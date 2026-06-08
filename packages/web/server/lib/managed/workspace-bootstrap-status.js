import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const WORKSPACE_BOOTSTRAP_STATUS_FILENAME = 'workspace-bootstrap.json';

const VALID_STATES = new Set(['pending', 'running', 'succeeded', 'skipped', 'failed']);

export function resolveWorkspaceBootstrapStatusPath({
  workspaceDir = process.env.WORKSPACE_DIR,
  stateDir = process.env.OPENCHAMBER_STATE_DIR,
} = {}) {
  const resolvedStateDir = typeof stateDir === 'string' && stateDir.trim().length > 0
    ? stateDir.trim()
    : path.join(
      typeof workspaceDir === 'string' && workspaceDir.trim().length > 0
        ? workspaceDir.trim()
        : '/workspace',
      '.openchamber'
    );
  return path.join(resolvedStateDir, WORKSPACE_BOOTSTRAP_STATUS_FILENAME);
}

export async function readWorkspaceBootstrapStatus(options = {}) {
  const statusPath = resolveWorkspaceBootstrapStatusPath(options);
  try {
    const raw = await readFile(statusPath, 'utf8');
    return normalizeWorkspaceBootstrapStatus(JSON.parse(raw));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    return {
      state: 'failed',
      reason: 'status_read_failed',
      error: sanitizeDiagnosticString(error?.message || String(error)),
    };
  }
}

export function normalizeWorkspaceBootstrapStatus(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const state = typeof raw.state === 'string' && VALID_STATES.has(raw.state)
    ? raw.state
    : 'failed';
  const normalized = { state };

  addStringField(normalized, 'reason', raw.reason);
  addStringField(normalized, 'repoUrl', sanitizeRepoUrl(raw.repoUrl));
  addStringField(normalized, 'repoBranch', raw.repoBranch);
  addStringField(normalized, 'workspaceDir', raw.workspaceDir);
  addStringField(normalized, 'startedAt', raw.startedAt);
  addStringField(normalized, 'completedAt', raw.completedAt);
  addStringField(normalized, 'gitHead', raw.gitHead);
  addStringField(normalized, 'error', sanitizeDiagnosticString(raw.error));

  if (typeof raw.hasGit === 'boolean') {
    normalized.hasGit = raw.hasGit;
  }

  return normalized;
}

export function sanitizeRepoUrl(value) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.username || parsed.password) {
      parsed.username = '***';
      parsed.password = parsed.password ? '***' : '';
    }
    return parsed.toString();
  } catch {
    return trimmed
      .replace(/:\/\/([^/@\s:]+):([^/@\s]+)@/g, '://***:***@')
      .replace(/:\/\/([^/@\s]+)@/g, '://***@');
  }
}

export function sanitizeDiagnosticString(value) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return sanitizeRepoUrl(trimmed)
    .replace(/(token|password|passwd|secret)=([^&\s]+)/gi, '$1=***')
    .replace(/(gh[pousr]_[A-Za-z0-9_]+)/g, '***');
}

function addStringField(target, key, value) {
  if (typeof value === 'string' && value.trim().length > 0) {
    target[key] = value.trim();
  }
}
