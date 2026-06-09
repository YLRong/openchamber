import type { I18nKey } from '@/lib/i18n/messages/en';

const RAW_WORKSPACE_BOOTSTRAP_STATES = ['pending', 'running', 'succeeded', 'skipped', 'failed'] as const;

export type RawWorkspaceBootstrapState = typeof RAW_WORKSPACE_BOOTSTRAP_STATES[number];
export type WorkspaceBootstrapState = RawWorkspaceBootstrapState | 'unknown';

export interface WorkspaceBootstrapDiagnostics {
  available: boolean;
  state: WorkspaceBootstrapState;
  reason: string | null;
  repoUrl: string | null;
  repoBranch: string | null;
  workspaceDir: string | null;
  startedAt: string | null;
  completedAt: string | null;
  gitHead: string | null;
  error: string | null;
  hasGit: boolean | null;
}

export interface WorkspaceBootstrapCopyKeys {
  stateLabelKey: I18nKey;
  descriptionKey: I18nKey;
}

export const DEFAULT_WORKSPACE_BOOTSTRAP_DIAGNOSTICS: WorkspaceBootstrapDiagnostics = {
  available: false,
  state: 'pending',
  reason: null,
  repoUrl: null,
  repoBranch: null,
  workspaceDir: null,
  startedAt: null,
  completedAt: null,
  gitHead: null,
  error: null,
  hasGit: null,
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeRepoUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password) {
      parsed.username = '***';
      parsed.password = parsed.password ? '***' : '';
    }
    return parsed.toString();
  } catch {
    return value
      .replace(/:\/\/([^/@\s:]+):([^/@\s]+)@/g, '://***:***@')
      .replace(/:\/\/([^/@\s]+)@/g, '://***@');
  }
}

function sanitizeDiagnosticString(value: string | null): string | null {
  const sanitizedUrl = sanitizeRepoUrl(value);
  if (!sanitizedUrl) {
    return null;
  }
  return sanitizedUrl
    .replace(/(token|password|passwd|secret)=([^&\s]+)/gi, '$1=***')
    .replace(/(gh[pousr]_[A-Za-z0-9_]+)/g, '***');
}

function normalizeState(value: unknown): WorkspaceBootstrapState {
  if (typeof value === 'string' && RAW_WORKSPACE_BOOTSTRAP_STATES.includes(value as RawWorkspaceBootstrapState)) {
    return value as RawWorkspaceBootstrapState;
  }
  return 'unknown';
}

export function normalizeWorkspaceBootstrapDiagnostics(raw: unknown): WorkspaceBootstrapDiagnostics {
  if (!isObjectRecord(raw)) {
    return DEFAULT_WORKSPACE_BOOTSTRAP_DIAGNOSTICS;
  }

  return {
    available: true,
    state: normalizeState(raw.state),
    reason: sanitizeDiagnosticString(normalizeString(raw.reason)),
    repoUrl: sanitizeRepoUrl(normalizeString(raw.repoUrl)),
    repoBranch: sanitizeDiagnosticString(normalizeString(raw.repoBranch)),
    workspaceDir: sanitizeDiagnosticString(normalizeString(raw.workspaceDir)),
    startedAt: normalizeString(raw.startedAt),
    completedAt: normalizeString(raw.completedAt),
    gitHead: sanitizeDiagnosticString(normalizeString(raw.gitHead)),
    error: sanitizeDiagnosticString(normalizeString(raw.error)),
    hasGit: typeof raw.hasGit === 'boolean' ? raw.hasGit : null,
  };
}

export function areWorkspaceBootstrapDiagnosticsEqual(
  a: WorkspaceBootstrapDiagnostics,
  b: WorkspaceBootstrapDiagnostics,
): boolean {
  return a.available === b.available
    && a.state === b.state
    && a.reason === b.reason
    && a.repoUrl === b.repoUrl
    && a.repoBranch === b.repoBranch
    && a.workspaceDir === b.workspaceDir
    && a.startedAt === b.startedAt
    && a.completedAt === b.completedAt
    && a.gitHead === b.gitHead
    && a.error === b.error
    && a.hasGit === b.hasGit;
}

export function getWorkspaceBootstrapStateLabelKey(state: WorkspaceBootstrapState): I18nKey {
  switch (state) {
    case 'pending':
      return 'layout.managedRuntime.bootstrap.state.pending';
    case 'running':
      return 'layout.managedRuntime.bootstrap.state.running';
    case 'succeeded':
      return 'layout.managedRuntime.bootstrap.state.succeeded';
    case 'skipped':
      return 'layout.managedRuntime.bootstrap.state.skipped';
    case 'failed':
      return 'layout.managedRuntime.bootstrap.state.failed';
    case 'unknown':
    default:
      return 'layout.managedRuntime.bootstrap.state.unknown';
  }
}

export function getWorkspaceBootstrapReasonDescriptionKey(reason: string | null): I18nKey {
  switch (reason) {
    case 'repo_url_not_configured':
      return 'layout.managedRuntime.bootstrap.reason.repoUrlNotConfigured';
    case 'workspace_already_initialized':
      return 'layout.managedRuntime.bootstrap.reason.workspaceAlreadyInitialized';
    case 'workspace_not_empty':
      return 'layout.managedRuntime.bootstrap.reason.workspaceNotEmpty';
    case 'git_clone_failed':
      return 'layout.managedRuntime.bootstrap.reason.gitCloneFailed';
    case 'git_checkout_failed':
      return 'layout.managedRuntime.bootstrap.reason.gitCheckoutFailed';
    case 'git_clone_running':
      return 'layout.managedRuntime.bootstrap.reason.gitCloneRunning';
    case 'git_clone_succeeded':
      return 'layout.managedRuntime.bootstrap.reason.gitCloneSucceeded';
    case 'status_read_failed':
      return 'layout.managedRuntime.bootstrap.reason.statusReadFailed';
    default:
      return 'layout.managedRuntime.bootstrap.reason.unknown';
  }
}

export function getWorkspaceBootstrapCopyKeys(diagnostics: WorkspaceBootstrapDiagnostics): WorkspaceBootstrapCopyKeys {
  if (!diagnostics.available) {
    return {
      stateLabelKey: getWorkspaceBootstrapStateLabelKey('pending'),
      descriptionKey: 'layout.managedRuntime.bootstrap.reason.pendingDiagnostics',
    };
  }

  return {
    stateLabelKey: getWorkspaceBootstrapStateLabelKey(diagnostics.state),
    descriptionKey: getWorkspaceBootstrapReasonDescriptionKey(diagnostics.reason),
  };
}
