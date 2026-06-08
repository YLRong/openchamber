import React from 'react';
import type { Session } from '@opencode-ai/sdk/v2';
import { useManagedRuntime } from '@/hooks/useManagedRuntimeInfo';
import { opencodeClient } from '@/lib/opencode/client';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useUIStore } from '@/stores/useUIStore';
import { useSessionUIStore } from '@/sync/session-ui-store';

const DEFAULT_MANAGED_WORKSPACE_DIR = '/workspace';

const normalizeWorkspaceDir = (value: string | null | undefined): string => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    return DEFAULT_MANAGED_WORKSPACE_DIR;
  }
  const normalized = trimmed.replace(/\\/g, '/');
  return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
};

const getSessionUpdatedAt = (session: Session): number => {
  return (typeof session.time?.updated === 'number' ? session.time.updated : 0)
    || (typeof session.time?.created === 'number' ? session.time.created : 0);
};

const pickRuntimeSession = (sessions: Session[]): Session | null => {
  const activeSessions = sessions.filter((session) => !session.time?.archived);
  if (activeSessions.length === 0) {
    return null;
  }
  return [...activeSessions].sort((a, b) => getSessionUpdatedAt(b) - getSessionUpdatedAt(a))[0] ?? null;
};

export function useManagedRuntimeBootstrap({ enabled }: { enabled: boolean }) {
  const { managed, mode, managedSessionId, workspaceDir } = useManagedRuntime();
  const bootstrapKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!enabled || !managed || mode !== 'runtime') {
      return;
    }

    const directory = normalizeWorkspaceDir(workspaceDir);
    const bootstrapKey = `${managedSessionId ?? 'unknown'}\n${directory}`;
    if (bootstrapKeyRef.current === bootstrapKey) {
      return;
    }
    bootstrapKeyRef.current = bootstrapKey;

    let cancelled = false;

    const run = async () => {
      const directoryStore = useDirectoryStore.getState();
      directoryStore.synchronizeHomeDirectory(directory);
      useProjectsStore.getState().setManagedRuntimeWorkspace(directory);
      useUIStore.getState().setSessionSwitcherOpen(false);
      opencodeClient.setDirectory(directory);

      try {
        const sessions = await opencodeClient.listSessions();
        if (cancelled) {
          return;
        }

        const selected = pickRuntimeSession(sessions);
        if (selected) {
          useSessionUIStore.getState().setCurrentSession(selected.id, directory);
          return;
        }

        await useSessionUIStore.getState().createSession(undefined, directory, null);
      } catch (error) {
        if (!cancelled) {
          bootstrapKeyRef.current = null;
          console.warn('[managed-runtime] failed to bootstrap runtime session', error);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [enabled, managed, managedSessionId, mode, workspaceDir]);
}
