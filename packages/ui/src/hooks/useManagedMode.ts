import { useEffect } from 'react';
import { runtimeFetch } from '@/lib/runtime-fetch';
import { useManagedRuntimeStore } from '@/stores/useManagedRuntimeStore';
import { normalizeManagedRuntimeInfo } from '@/hooks/useManagedRuntimeInfo';

interface SystemInfoResponse {
  mode?: 'runtime';
  managed?: boolean;
  managedSessionId?: string | null;
  hubUrl?: string | null;
  workspaceDir?: string | null;
  workspaceBootstrap?: unknown;
  features?: {
    tunnel?: boolean;
    desktop?: boolean;
    selfUpdate?: boolean;
    remoteInstances?: boolean;
  };
}

export type ManagedMode = 'runtime' | 'none' | 'unknown';

export function useManagedMode(): { mode: ManagedMode; isLoading: boolean } {
  const mode = useManagedRuntimeStore((s) => s.mode);
  const isLoading = useManagedRuntimeStore((s) => s.isLoading);
  const setInfo = useManagedRuntimeStore((s) => s.setInfo);

  useEffect(() => {
    if (mode !== null) return;

    let cancelled = false;

    async function detect() {
      try {
        const response = await runtimeFetch('/api/system/info', {
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
          if (!cancelled) {
            setInfo(normalizeManagedRuntimeInfo(null));
          }
          return;
        }
        const data = (await response.json()) as SystemInfoResponse;
        if (cancelled) return;

        setInfo(normalizeManagedRuntimeInfo(data));
      } catch {
        if (!cancelled) {
          setInfo(normalizeManagedRuntimeInfo(null));
        }
      }
    }

    void detect();

    return () => {
      cancelled = true;
    };
  }, [mode, setInfo]);

  if (isLoading) {
    return { mode: 'unknown', isLoading: true };
  }

  if (!mode) {
    return { mode: 'none', isLoading: false };
  }

  return { mode, isLoading: false };
}
