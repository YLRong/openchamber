import type { WorkspaceBootstrapState } from '@/lib/managedRuntimeDiagnostics';

export function abbreviateManagedSessionId(sessionId: string | null | undefined): string | null {
  if (!sessionId) {
    return null;
  }
  if (sessionId.length <= 16) {
    return sessionId;
  }
  return `${sessionId.slice(0, 8)}…${sessionId.slice(-4)}`;
}

export function formatLimuRuntimeVersionLabel(
  openchamberVersion: string | null | undefined,
  openCodeVersion: string | null | undefined,
): string {
  const normalizedOpenChamberVersion = openchamberVersion?.trim() || 'unknown';
  const normalizedOpenCodeVersion = openCodeVersion?.trim() || 'unknown';
  return `LIMU-${normalizedOpenChamberVersion}-${normalizedOpenCodeVersion}`;
}

export function getWorkspaceStatusToneClassName(state: WorkspaceBootstrapState): string {
  switch (state) {
    case 'failed':
      return 'border-[var(--status-error-border)] bg-[var(--status-error-background)] text-[var(--status-error)]';
    case 'succeeded':
      return 'border-[var(--status-success-border)] bg-[var(--status-success-background)] text-[var(--status-success)]';
    case 'running':
      return 'border-[var(--status-info-border)] bg-[var(--status-info-background)] text-[var(--status-info)]';
    case 'pending':
    case 'skipped':
    case 'unknown':
    default:
      return 'border-[var(--interactive-border)] bg-[var(--surface-elevated)] text-foreground';
  }
}
