const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const MESSAGE_ID_LOW_BITS_MASK = (BigInt(1) << BigInt(48)) - BigInt(1);
const MESSAGE_ID_COUNTER_MODULUS = 0x1000;
const DEFAULT_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_IDEMPOTENCY_MAX_ENTRIES = 1000;

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const normalizeDirectoryKey = (directory) => {
  if (typeof directory !== 'string') return '';
  return directory.trim();
};

const idempotencyKeyFor = ({ type, sessionID, directory, clientRequestId }) => (
  `${type}\u0000${sessionID}\u0000${normalizeDirectoryKey(directory)}\u0000${clientRequestId}`
);

const sanitizeClientRequestId = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200) return null;
  return trimmed;
};

const stableStringify = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
};

export const createRuntimeMessageIdGenerator = ({
  now = () => Date.now(),
  randomBytes,
} = {}) => {
  let lastTimestamp = 0;
  let counter = 0;

  const nextRandomChar = () => {
    if (typeof randomBytes === 'function') {
      return BASE62[randomBytes(1)[0] % BASE62.length];
    }
    return BASE62[Math.floor(Math.random() * BASE62.length)];
  };

  const next = (prefix = 'msg') => {
    const candidate = Math.trunc(Number(now()));
    if (Number.isFinite(candidate) && candidate > lastTimestamp) {
      lastTimestamp = candidate;
      counter = 0;
    } else if (counter >= MESSAGE_ID_COUNTER_MODULUS - 1) {
      lastTimestamp += 1;
      counter = 0;
    } else {
      counter += 1;
    }

    const value = (BigInt(lastTimestamp) * BigInt(MESSAGE_ID_COUNTER_MODULUS) + BigInt(counter)) & MESSAGE_ID_LOW_BITS_MASK;
    let hex = '';
    for (let i = 0; i < 6; i += 1) {
      hex += Number((value >> BigInt(40 - 8 * i)) & BigInt(0xff)).toString(16).padStart(2, '0');
    }

    let suffix = '';
    for (let i = 0; i < 14; i += 1) {
      suffix += nextRandomChar();
    }

    return `${prefix}_${hex}${suffix}`;
  };

  return { next };
};

export const createRuntimeMessagePayloadHasher = ({ crypto }) => (payload) => {
  const hash = crypto.createHash('sha256');
  hash.update(stableStringify(payload));
  return hash.digest('hex');
};

const readStoreFile = async ({ fsPromises, filePath }) => {
  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.entries)) {
      return [];
    }
    return parsed.entries.filter((entry) => entry && typeof entry.key === 'string');
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
};

const writeStoreFile = async ({ fsPromises, path, filePath, entries }) => {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fsPromises.writeFile(tmpPath, `${JSON.stringify({ version: 1, entries }, null, 2)}\n`, 'utf8');
  await fsPromises.rename(tmpPath, filePath);
};

export const createRuntimeMessageIdempotencyStore = ({
  fsPromises,
  path,
  filePath,
  now = () => Date.now(),
  ttlMs = DEFAULT_IDEMPOTENCY_TTL_MS,
  maxEntries = DEFAULT_IDEMPOTENCY_MAX_ENTRIES,
} = {}) => {
  if (!fsPromises || !path || !filePath) {
    throw new Error('Runtime message idempotency store requires fsPromises, path, and filePath');
  }

  const entries = new Map();
  let loaded = false;
  let writeQueue = Promise.resolve();

  const prune = () => {
    const cutoff = now() - ttlMs;
    for (const [key, entry] of entries) {
      if (entry.status === 'forwarding') continue;
      if (entry.updatedAt < cutoff) {
        entries.delete(key);
      }
    }

    const removable = [...entries.values()]
      .filter((entry) => entry.status !== 'forwarding')
      .sort((a, b) => a.updatedAt - b.updatedAt);
    while (entries.size > maxEntries && removable.length > 0) {
      entries.delete(removable.shift().key);
    }
  };

  const persist = async () => {
    prune();
    const serialized = [...entries.values()].sort((a, b) => a.updatedAt - b.updatedAt);
    writeQueue = writeQueue.then(() => writeStoreFile({ fsPromises, path, filePath, entries: serialized }));
    await writeQueue;
  };

  const ensureLoaded = async () => {
    if (loaded) return;
    const restored = await readStoreFile({ fsPromises, filePath });
    entries.clear();
    for (const entry of restored) {
      entries.set(entry.key, entry);
    }
    loaded = true;
    prune();
  };

  const reserve = async ({ type, sessionID, directory, clientRequestId, payloadHash, messageID }) => {
    await ensureLoaded();
    const key = idempotencyKeyFor({ type, sessionID, directory, clientRequestId });
    const existing = entries.get(key);
    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        return { status: 'conflict', entry: existing };
      }
      return { status: 'existing', entry: existing };
    }

    const entry = {
      key,
      type,
      sessionID,
      directory: normalizeDirectoryKey(directory),
      clientRequestId,
      payloadHash,
      messageID,
      status: 'forwarding',
      createdAt: now(),
      updatedAt: now(),
    };
    entries.set(key, entry);
    await persist();
    return { status: 'reserved', entry };
  };

  const update = async (entry, patch) => {
    await ensureLoaded();
    const current = entries.get(entry.key) ?? entry;
    const next = {
      ...current,
      ...patch,
      updatedAt: now(),
    };
    entries.set(next.key, next);
    await persist();
    return next;
  };

  const snapshot = async () => {
    await ensureLoaded();
    prune();
    return [...entries.values()];
  };

  return {
    reserve,
    update,
    snapshot,
  };
};

const validateParts = (parts) => Array.isArray(parts) && parts.length > 0;

const pickPromptBody = (body, messageID) => {
  const next = {
    messageID,
    model: body.model,
    agent: body.agent,
    noReply: body.noReply,
    tools: body.tools,
    format: body.format,
    system: body.system,
    variant: body.variant,
    parts: body.parts,
  };

  for (const key of Object.keys(next)) {
    if (next[key] === undefined) {
      delete next[key];
    }
  }
  return next;
};

const pickCommandBody = (body, messageID) => {
  const next = {
    messageID,
    agent: body.agent,
    model: body.model,
    arguments: body.arguments,
    command: body.command,
    variant: body.variant,
    parts: body.parts,
  };

  for (const key of Object.keys(next)) {
    if (next[key] === undefined) {
      delete next[key];
    }
  }
  return next;
};

const buildQuery = ({ directory, workspace }) => {
  const params = new URLSearchParams();
  if (typeof directory === 'string' && directory.trim()) {
    params.set('directory', directory);
  }
  if (typeof workspace === 'string' && workspace.trim()) {
    params.set('workspace', workspace);
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
};

const parseUpstreamBody = async (response) => {
  const text = await response.text().catch(() => '');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

export const createRuntimeMessageSubmissionHandler = ({
  type,
  idGenerator,
  idempotencyStore,
  hashPayload,
  buildOpenCodeUrl,
  getOpenCodeAuthHeaders,
  fetchImpl = fetch,
}) => {
  const isPrompt = type === 'prompt';

  return async (req, res) => {
    const body = isPlainObject(req.body) ? req.body : {};
    const sessionID = typeof req.params?.sessionID === 'string' ? req.params.sessionID : '';
    const clientRequestId = sanitizeClientRequestId(body.clientRequestId);
    const directory = typeof body.directory === 'string' ? body.directory : undefined;
    const workspace = typeof body.workspace === 'string' ? body.workspace : undefined;

    if (!sessionID) {
      return res.status(400).json({ error: 'sessionID is required' });
    }
    if (!clientRequestId) {
      return res.status(400).json({ error: 'clientRequestId is required' });
    }
    if (isPrompt && !validateParts(body.parts)) {
      return res.status(400).json({ error: 'parts must contain at least one item' });
    }
    if (!isPrompt && typeof body.command !== 'string') {
      return res.status(400).json({ error: 'command is required' });
    }

    const payloadForHash = {
      type,
      sessionID,
      directory: normalizeDirectoryKey(directory),
      workspace: typeof workspace === 'string' ? workspace : '',
      body: isPrompt
        ? pickPromptBody(body, 'server-generated')
        : pickCommandBody(body, 'server-generated'),
    };
    const payloadHash = hashPayload(payloadForHash);
    const reserved = await idempotencyStore.reserve({
      type,
      sessionID,
      directory,
      clientRequestId,
      payloadHash,
      messageID: idGenerator.next('msg'),
    });

    if (reserved.status === 'conflict') {
      return res.status(409).json({
        error: 'clientRequestId was already used with a different payload',
        messageID: reserved.entry.messageID,
      });
    }

    if (reserved.status === 'existing') {
      const statusCode = reserved.entry.status === 'failed'
        ? (reserved.entry.upstreamStatus || 502)
        : 200;
      return res.status(statusCode).json({
        ok: reserved.entry.status !== 'failed',
        reused: true,
        status: reserved.entry.status,
        messageID: reserved.entry.messageID,
        upstreamStatus: reserved.entry.upstreamStatus,
        error: reserved.entry.error,
      });
    }

    const messageID = reserved.entry.messageID;
    const upstreamBody = isPrompt ? pickPromptBody(body, messageID) : pickCommandBody(body, messageID);
    const upstreamPath = isPrompt
      ? `/session/${encodeURIComponent(sessionID)}/prompt_async${buildQuery({ directory, workspace })}`
      : `/session/${encodeURIComponent(sessionID)}/command${buildQuery({ directory, workspace })}`;

    try {
      const upstream = await fetchImpl(buildOpenCodeUrl(upstreamPath), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...getOpenCodeAuthHeaders(),
        },
        body: JSON.stringify(upstreamBody),
      });

      if (!upstream.ok) {
        const detail = await parseUpstreamBody(upstream);
        await idempotencyStore.update(reserved.entry, {
          status: 'failed',
          upstreamStatus: upstream.status,
          error: typeof detail === 'string' ? detail : detail?.error || detail?.message || 'OpenCode request failed',
        });
        return res.status(upstream.status).json({
          ok: false,
          messageID,
          upstreamStatus: upstream.status,
          error: detail,
        });
      }

      await idempotencyStore.update(reserved.entry, {
        status: 'accepted',
        upstreamStatus: upstream.status,
      });
      return res.status(202).json({
        ok: true,
        reused: false,
        status: 'accepted',
        messageID,
        upstreamStatus: upstream.status,
      });
    } catch (error) {
      await idempotencyStore.update(reserved.entry, {
        status: 'unknown',
        error: error?.message || 'OpenCode request failed',
      });
      return res.status(503).json({
        ok: false,
        messageID,
        retryable: true,
        error: error?.message || 'OpenCode service unavailable',
      });
    }
  };
};

export const registerRuntimeMessageOrderingRoutes = (app, dependencies) => {
  const {
    crypto,
    fsPromises,
    path,
    openchamberDataDir,
    buildOpenCodeUrl,
    getOpenCodeAuthHeaders,
    fetchImpl,
    now,
    idempotencyFilePath,
  } = dependencies;

  const dataDir = openchamberDataDir || path.join(process.cwd(), '.openchamber');
  const filePath = idempotencyFilePath || path.join(dataDir, 'runtime-message-idempotency.json');
  const idGenerator = createRuntimeMessageIdGenerator({
    now,
    randomBytes: crypto.randomBytes.bind(crypto),
  });
  const hashPayload = createRuntimeMessagePayloadHasher({ crypto });
  const idempotencyStore = createRuntimeMessageIdempotencyStore({
    fsPromises,
    path,
    filePath,
    now,
  });

  app.get('/api/openchamber/runtime-message/time', (_req, res) => {
    const serverNow = typeof now === 'function' ? now() : Date.now();
    res.json({
      serverTimeMs: serverNow,
      serverTimeIso: new Date(serverNow).toISOString(),
    });
  });

  app.post('/api/openchamber/runtime-message/session/:sessionID/prompt', createRuntimeMessageSubmissionHandler({
    type: 'prompt',
    idGenerator,
    idempotencyStore,
    hashPayload,
    buildOpenCodeUrl,
    getOpenCodeAuthHeaders,
    fetchImpl,
  }));

  app.post('/api/openchamber/runtime-message/session/:sessionID/command', createRuntimeMessageSubmissionHandler({
    type: 'command',
    idGenerator,
    idempotencyStore,
    hashPayload,
    buildOpenCodeUrl,
    getOpenCodeAuthHeaders,
    fetchImpl,
  }));

  return {
    idGenerator,
    idempotencyStore,
  };
};
