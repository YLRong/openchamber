import { describe, expect, test } from 'bun:test';

import {
  DEFAULT_WORKSPACE_BOOTSTRAP_DIAGNOSTICS,
  getWorkspaceBootstrapCopyKeys,
  getWorkspaceBootstrapReasonDescriptionKey,
  normalizeWorkspaceBootstrapDiagnostics,
} from './managedRuntimeDiagnostics';

describe('managed runtime diagnostics', () => {
  test('missing bootstrap diagnostics stay pending and unavailable', () => {
    expect(normalizeWorkspaceBootstrapDiagnostics(undefined)).toEqual(DEFAULT_WORKSPACE_BOOTSTRAP_DIAGNOSTICS);
    expect(getWorkspaceBootstrapCopyKeys(DEFAULT_WORKSPACE_BOOTSTRAP_DIAGNOSTICS)).toEqual({
      stateLabelKey: 'layout.managedRuntime.bootstrap.state.pending',
      descriptionKey: 'layout.managedRuntime.bootstrap.reason.pendingDiagnostics',
    });
  });

  test('normalizes known bootstrap diagnostics and redacts credentials', () => {
    const diagnostics = normalizeWorkspaceBootstrapDiagnostics({
      state: 'failed',
      reason: 'git_clone_failed',
      repoUrl: 'https://user:secret@example.com/org/repo.git',
      repoBranch: ' main ',
      workspaceDir: '/workspace',
      gitHead: 'abc123',
      error: 'fatal token=abc ghp_secret password=hunter2',
      hasGit: false,
    });

    expect(diagnostics.available).toBe(true);
    expect(diagnostics.state).toBe('failed');
    expect(diagnostics.reason).toBe('git_clone_failed');
    expect(diagnostics.repoUrl).toBe('https://***:***@example.com/org/repo.git');
    expect(diagnostics.repoBranch).toBe('main');
    expect(diagnostics.workspaceDir).toBe('/workspace');
    expect(diagnostics.gitHead).toBe('abc123');
    expect(diagnostics.error).toBe('fatal token=*** *** password=***');
    expect(diagnostics.hasGit).toBe(false);
  });

  test('maps every known bootstrap reason to user-facing copy keys', () => {
    const reasonToKey = new Map<string, string>([
      ['repo_url_not_configured', 'layout.managedRuntime.bootstrap.reason.repoUrlNotConfigured'],
      ['workspace_already_initialized', 'layout.managedRuntime.bootstrap.reason.workspaceAlreadyInitialized'],
      ['workspace_not_empty', 'layout.managedRuntime.bootstrap.reason.workspaceNotEmpty'],
      ['git_clone_failed', 'layout.managedRuntime.bootstrap.reason.gitCloneFailed'],
      ['git_checkout_failed', 'layout.managedRuntime.bootstrap.reason.gitCheckoutFailed'],
      ['git_clone_running', 'layout.managedRuntime.bootstrap.reason.gitCloneRunning'],
      ['git_clone_succeeded', 'layout.managedRuntime.bootstrap.reason.gitCloneSucceeded'],
      ['status_read_failed', 'layout.managedRuntime.bootstrap.reason.statusReadFailed'],
    ]);

    for (const [reason, key] of reasonToKey) {
      expect(getWorkspaceBootstrapReasonDescriptionKey(reason)).toBe(key);
    }
    expect(getWorkspaceBootstrapReasonDescriptionKey('new_reason')).toBe('layout.managedRuntime.bootstrap.reason.unknown');
  });

  test('unknown state remains safe instead of throwing', () => {
    const diagnostics = normalizeWorkspaceBootstrapDiagnostics({ state: 'surprising', reason: 'surprising_reason' });

    expect(diagnostics.state).toBe('unknown');
    expect(getWorkspaceBootstrapCopyKeys(diagnostics)).toEqual({
      stateLabelKey: 'layout.managedRuntime.bootstrap.state.unknown',
      descriptionKey: 'layout.managedRuntime.bootstrap.reason.unknown',
    });
  });
});
