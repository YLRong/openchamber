import { beforeEach, describe, expect, test } from 'bun:test';

import { DEFAULT_WORKSPACE_BOOTSTRAP_DIAGNOSTICS, normalizeWorkspaceBootstrapDiagnostics } from '@/lib/managedRuntimeDiagnostics';
import { useManagedRuntimeStore, type ManagedRuntimeInfo } from './useManagedRuntimeStore';

const features = {
  tunnel: false,
  desktop: false,
  selfUpdate: false,
  remoteInstances: false,
};

function resetStore() {
  useManagedRuntimeStore.setState({
    mode: null,
    managed: false,
    managedSessionId: null,
    hubUrl: null,
    workspaceDir: null,
    workspaceBootstrap: DEFAULT_WORKSPACE_BOOTSTRAP_DIAGNOSTICS,
    features: {
      tunnel: true,
      desktop: true,
      selfUpdate: true,
      remoteInstances: true,
    },
    isLoading: true,
    error: null,
  });
}

describe('useManagedRuntimeStore', () => {
  beforeEach(() => {
    resetStore();
  });

  test('stores workspace bootstrap diagnostics with managed runtime info', () => {
    const workspaceBootstrap = normalizeWorkspaceBootstrapDiagnostics({
      state: 'failed',
      reason: 'workspace_not_empty',
      error: 'Workspace is not empty',
    });
    const info: ManagedRuntimeInfo = {
      mode: 'runtime',
      managed: true,
      managedSessionId: 'session-1',
      hubUrl: 'http://hub.local/session-1',
      workspaceDir: '/workspace',
      workspaceBootstrap,
      features,
    };

    useManagedRuntimeStore.getState().setInfo(info);

    const state = useManagedRuntimeStore.getState();
    expect(state.managed).toBe(true);
    expect(state.managedSessionId).toBe('session-1');
    expect(state.workspaceBootstrap.available).toBe(true);
    expect(state.workspaceBootstrap.state).toBe('failed');
    expect(state.workspaceBootstrap.reason).toBe('workspace_not_empty');
    expect(state.workspaceBootstrap.error).toBe('Workspace is not empty');
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  test('preserves diagnostics reference when equal payload refreshes', () => {
    const info: ManagedRuntimeInfo = {
      mode: 'runtime',
      managed: true,
      managedSessionId: 'session-1',
      hubUrl: null,
      workspaceDir: '/workspace',
      workspaceBootstrap: normalizeWorkspaceBootstrapDiagnostics({
        state: 'running',
        reason: 'git_clone_running',
      }),
      features,
    };

    useManagedRuntimeStore.getState().setInfo(info);
    const firstDiagnostics = useManagedRuntimeStore.getState().workspaceBootstrap;
    useManagedRuntimeStore.getState().setInfo({
      ...info,
      workspaceBootstrap: normalizeWorkspaceBootstrapDiagnostics({
        state: 'running',
        reason: 'git_clone_running',
      }),
    });

    expect(useManagedRuntimeStore.getState().workspaceBootstrap).toBe(firstDiagnostics);
  });
});
