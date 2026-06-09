import { describe, expect, test } from 'bun:test';

import { normalizeManagedRuntimeInfo } from './useManagedRuntimeInfo';

describe('normalizeManagedRuntimeInfo', () => {
  test('includes workspace bootstrap diagnostics from system info', () => {
    const info = normalizeManagedRuntimeInfo({
      mode: 'runtime',
      managed: true,
      managedSessionId: 'session-1',
      hubUrl: 'http://hub.local/session-1',
      workspaceDir: '/workspace',
      workspaceBootstrap: {
        state: 'succeeded',
        reason: 'git_clone_succeeded',
        gitHead: 'abc123',
      },
      features: {
        tunnel: false,
        desktop: false,
        selfUpdate: false,
        remoteInstances: false,
      },
    });

    expect(info.mode).toBe('runtime');
    expect(info.managed).toBe(true);
    expect(info.managedSessionId).toBe('session-1');
    expect(info.hubUrl).toBe('http://hub.local/session-1');
    expect(info.workspaceDir).toBe('/workspace');
    expect(info.workspaceBootstrap.available).toBe(true);
    expect(info.workspaceBootstrap.state).toBe('succeeded');
    expect(info.workspaceBootstrap.reason).toBe('git_clone_succeeded');
    expect(info.workspaceBootstrap.gitHead).toBe('abc123');
  });

  test('missing diagnostics normalize to safe pending state', () => {
    const info = normalizeManagedRuntimeInfo({
      mode: 'runtime',
      managed: true,
      managedSessionId: 'session-2',
    });

    expect(info.workspaceBootstrap.available).toBe(false);
    expect(info.workspaceBootstrap.state).toBe('pending');
    expect(info.workspaceBootstrap.reason).toBeNull();
  });

  test('non-managed system info keeps defaults', () => {
    const info = normalizeManagedRuntimeInfo({ managed: false });

    expect(info.managed).toBe(false);
    expect(info.workspaceBootstrap.available).toBe(false);
    expect(info.workspaceBootstrap.state).toBe('pending');
  });
});
