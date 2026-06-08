import { afterEach, describe, expect, it } from 'vitest';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { registerOpenCodeProxy } from './lib/opencode/proxy.js';
import {
  createRuntimeMessageIdGenerator,
  createRuntimeMessageIdempotencyStore,
  createRuntimeMessagePayloadHasher,
  registerRuntimeMessageOrderingRoutes,
} from './lib/opencode/runtime-message-ordering.js';

const listen = (app, host = '127.0.0.1') => new Promise((resolve, reject) => {
  const server = app.listen(0, host, () => resolve(server));
  server.once('error', reject);
});

const closeServer = (server) => new Promise((resolve, reject) => {
  if (!server) {
    resolve();
    return;
  }
  server.close((error) => {
    if (error) {
      reject(error);
      return;
    }
    resolve();
  });
});

const encodeAscendingIdAt = (prefix, now, counter = 1) => {
  const value = BigInt(now) * BigInt(0x1000) + BigInt(counter);
  let hex = '';
  for (let i = 0; i < 6; i += 1) {
    hex += Number((value >> BigInt(40 - 8 * i)) & BigInt(0xff)).toString(16).padStart(2, '0');
  }
  return `${prefix}_${hex}00000000000000`;
};

const makeTempDir = async () => fs.mkdtemp(path.join(os.tmpdir(), 'oc-runtime-message-'));

describe('Runtime message ordering primitives', () => {
  it('models why browser timestamp IDs can sort one assistant before its user', () => {
    const serverNow = 1_780_838_600_838;
    const browserNow = serverNow + 1_000;
    const userId = encodeAscendingIdAt('msg', browserNow);
    const assistantId = encodeAscendingIdAt('msg', serverNow);

    expect(assistantId < userId).toBe(true);
  });

  it('generates monotonic OpenCode-compatible message IDs when time stalls', () => {
    const idGenerator = createRuntimeMessageIdGenerator({
      now: () => 1_780_838_600_000,
      randomBytes: (size) => Buffer.alloc(size, 1),
    });

    const first = idGenerator.next('msg');
    const second = idGenerator.next('msg');

    expect(first).toMatch(/^msg_[0-9a-f]{12}[0-9A-Za-z]{14}$/);
    expect(second).toMatch(/^msg_[0-9a-f]{12}[0-9A-Za-z]{14}$/);
    expect(first < second).toBe(true);
  });

  it('recovers accepted idempotency entries from disk', async () => {
    const tempDir = await makeTempDir();
    const filePath = path.join(tempDir, 'idempotency.json');
    const hashPayload = createRuntimeMessagePayloadHasher({ crypto });
    const firstStore = createRuntimeMessageIdempotencyStore({ fsPromises: fs, path, filePath });
    const payloadHash = hashPayload({ text: 'hello' });

    const reserved = await firstStore.reserve({
      type: 'prompt',
      sessionID: 'ses_1',
      directory: '/workspace',
      clientRequestId: 'req_1',
      payloadHash,
      messageID: 'msg_server_1',
    });
    expect(reserved.status).toBe('reserved');
    await firstStore.update(reserved.entry, { status: 'accepted', upstreamStatus: 204 });

    const secondStore = createRuntimeMessageIdempotencyStore({ fsPromises: fs, path, filePath });
    const recovered = await secondStore.reserve({
      type: 'prompt',
      sessionID: 'ses_1',
      directory: '/workspace',
      clientRequestId: 'req_1',
      payloadHash,
      messageID: 'msg_unused',
    });

    expect(recovered.status).toBe('existing');
    expect(recovered.entry.messageID).toBe('msg_server_1');
    await fs.rm(tempDir, { recursive: true, force: true });
  });
});

describe('Runtime message ordering routes', () => {
  let upstreamServer;
  let appServer;
  let tempDir;

  afterEach(async () => {
    await closeServer(appServer);
    await closeServer(upstreamServer);
    appServer = undefined;
    upstreamServer = undefined;
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  const setup = async ({ upstreamStatus = 204 } = {}) => {
    const upstreamCalls = [];
    const upstream = express();
    upstream.use(express.json());
    upstream.post('/session/:sessionID/prompt_async', (req, res) => {
      upstreamCalls.push({
        type: 'prompt',
        sessionID: req.params.sessionID,
        query: req.query,
        body: req.body,
        authorization: req.headers.authorization,
      });
      res.status(upstreamStatus).json(upstreamStatus >= 400 ? { error: 'upstream rejected' } : { ok: true });
    });
    upstream.post('/session/:sessionID/command', (req, res) => {
      upstreamCalls.push({
        type: 'command',
        sessionID: req.params.sessionID,
        query: req.query,
        body: req.body,
        authorization: req.headers.authorization,
      });
      res.status(upstreamStatus).json(upstreamStatus >= 400 ? { error: 'upstream rejected' } : { ok: true });
    });
    upstream.get('/config/providers', (_req, res) => {
      res.json({ ok: true });
    });

    upstreamServer = await listen(upstream);
    const upstreamPort = upstreamServer.address().port;
    const externalBaseUrl = `http://127.0.0.1:${upstreamPort}`;
    tempDir = await makeTempDir();

    const app = express();
    app.use('/api/openchamber/runtime-message', express.json({ limit: '50mb' }));
    registerRuntimeMessageOrderingRoutes(app, {
      crypto,
      fsPromises: fs,
      path,
      openchamberDataDir: tempDir,
      buildOpenCodeUrl: (requestPath) => `${externalBaseUrl}${requestPath}`,
      getOpenCodeAuthHeaders: () => ({ Authorization: 'Bearer adapter-token' }),
      now: () => 1_780_838_600_000,
    });
    registerOpenCodeProxy(app, {
      fs: {},
      os: {},
      path,
      OPEN_CODE_READY_GRACE_MS: 0,
      getRuntime: () => ({
        openCodePort: upstreamPort,
        openCodeBaseUrl: externalBaseUrl,
        isOpenCodeReady: true,
        openCodeNotReadySince: 0,
        isRestartingOpenCode: false,
      }),
      getOpenCodeAuthHeaders: () => ({ Authorization: 'Bearer proxy-token' }),
      buildOpenCodeUrl: (requestPath) => `${externalBaseUrl}${requestPath}`,
      ensureOpenCodeApiPrefix: () => {},
    });
    appServer = await listen(app);
    const appPort = appServer.address().port;
    return {
      upstreamCalls,
      appUrl: `http://127.0.0.1:${appPort}`,
    };
  };

  it('forwards prompts with a Runtime-generated canonical message ID', async () => {
    const { appUrl, upstreamCalls } = await setup();
    const response = await fetch(`${appUrl}/api/openchamber/runtime-message/session/ses_1/prompt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clientRequestId: 'req_1',
        messageID: 'msg_browser_clock',
        directory: '/workspace/project',
        model: { providerID: 'provider', modelID: 'model' },
        agent: 'build',
        variant: 'normal',
        parts: [{ type: 'text', text: 'hello' }],
      }),
    });

    expect(response.status).toBe(202);
    const payload = await response.json();
    expect(payload.messageID).toMatch(/^msg_[0-9a-f]{12}[0-9A-Za-z]{14}$/);
    expect(payload.messageID).not.toBe('msg_browser_clock');
    expect(upstreamCalls).toHaveLength(1);
    expect(upstreamCalls[0].type).toBe('prompt');
    expect(upstreamCalls[0].body.messageID).toBe(payload.messageID);
    expect(upstreamCalls[0].body.messageID).not.toBe('msg_browser_clock');
    expect(upstreamCalls[0].body.clientRequestId).toBe(undefined);
    expect(upstreamCalls[0].body.parts).toEqual([{ type: 'text', text: 'hello' }]);
    expect(upstreamCalls[0].query.directory).toBe('/workspace/project');
    expect(upstreamCalls[0].authorization).toBe('Bearer adapter-token');
  });

  it('deduplicates prompt retries by clientRequestId and payload', async () => {
    const { appUrl, upstreamCalls } = await setup();
    const body = {
      clientRequestId: 'req_retry',
      directory: '/workspace/project',
      model: { providerID: 'provider', modelID: 'model' },
      parts: [{ type: 'text', text: 'hello' }],
    };

    const first = await fetch(`${appUrl}/api/openchamber/runtime-message/session/ses_1/prompt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const firstPayload = await first.json();
    const second = await fetch(`${appUrl}/api/openchamber/runtime-message/session/ses_1/prompt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const secondPayload = await second.json();

    expect(first.status).toBe(202);
    expect(second.status).toBe(200);
    expect(firstPayload.messageID).toBe(secondPayload.messageID);
    expect(secondPayload.reused).toBe(true);
    expect(upstreamCalls).toHaveLength(1);
  });

  it('rejects a reused clientRequestId with a different payload before forwarding', async () => {
    const { appUrl, upstreamCalls } = await setup();
    const first = {
      clientRequestId: 'req_conflict',
      parts: [{ type: 'text', text: 'hello' }],
    };
    const second = {
      clientRequestId: 'req_conflict',
      parts: [{ type: 'text', text: 'changed' }],
    };

    const firstResponse = await fetch(`${appUrl}/api/openchamber/runtime-message/session/ses_1/prompt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(first),
    });
    const secondResponse = await fetch(`${appUrl}/api/openchamber/runtime-message/session/ses_1/prompt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(second),
    });

    expect(firstResponse.status).toBe(202);
    expect(secondResponse.status).toBe(409);
    expect(upstreamCalls).toHaveLength(1);
  });

  it('forwards commands through the same server-generated ID path', async () => {
    const { appUrl, upstreamCalls } = await setup();
    const response = await fetch(`${appUrl}/api/openchamber/runtime-message/session/ses_1/command`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clientRequestId: 'req_cmd',
        messageID: 'msg_browser_clock',
        command: 'test-command',
        arguments: 'arg',
        model: 'provider/model',
        agent: 'build',
        directory: '/workspace/project',
      }),
    });

    expect(response.status).toBe(202);
    const payload = await response.json();
    expect(upstreamCalls).toHaveLength(1);
    expect(upstreamCalls[0].type).toBe('command');
    expect(upstreamCalls[0].body.messageID).toBe(payload.messageID);
    expect(upstreamCalls[0].body.messageID).not.toBe('msg_browser_clock');
    expect(upstreamCalls[0].body.command).toBe('test-command');
  });

  it('registers before the generic OpenCode proxy and keeps other proxy routes unchanged', async () => {
    const { appUrl, upstreamCalls } = await setup();
    const adapterResponse = await fetch(`${appUrl}/api/openchamber/runtime-message/session/ses_1/prompt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clientRequestId: 'req_proxy_order',
        parts: [{ type: 'text', text: 'hello' }],
      }),
    });
    const genericResponse = await fetch(`${appUrl}/api/config/providers`);

    expect(adapterResponse.status).toBe(202);
    expect(genericResponse.status).toBe(200);
    expect(await genericResponse.json()).toEqual({ ok: true });
    expect(upstreamCalls).toHaveLength(1);
  });

  it('exposes advisory Runtime server-time diagnostics', async () => {
    const { appUrl } = await setup();
    const response = await fetch(`${appUrl}/api/openchamber/runtime-message/time`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      serverTimeMs: 1_780_838_600_000,
      serverTimeIso: '2026-06-07T13:23:20.000Z',
    });
  });
});
