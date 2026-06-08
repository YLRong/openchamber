import { useEffect } from 'react';
import { runtimeFetch } from '@/lib/runtime-fetch';
import { useManagedRuntimeStore } from '@/stores/useManagedRuntimeStore';

interface SystemInfoResponse {
  mode?: 'runtime';
  managed?: boolean;
  managedSessionId?: string | null;
  hubUrl?: string | null;
  workspaceDir?: string | null;
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
            setInfo({ mode: null, managed: false, managedSessionId: null, hubUrl: null, workspaceDir: null, features: { tunnel: true, desktop: true, selfUpdate: true, remoteInstances: true } });
          }
          return;
        }
        const data = (await response.json()) as SystemInfoResponse;
        if (cancelled) return;

        const serverFeatures = data.features;
        const features = {
          tunnel: serverFeatures?.tunnel ?? !data.managed,
          desktop: serverFeatures?.desktop ?? !data.managed,
          selfUpdate: serverFeatures?.selfUpdate ?? !data.managed,
          remoteInstances: serverFeatures?.remoteInstances ?? !data.managed,
        };

        if (data.managed && data.mode === 'runtime') {
          setInfo({
            mode: 'runtime',
            managed: true,
            managedSessionId: data.managedSessionId ?? null,
            hubUrl: data.hubUrl ?? null,
            workspaceDir: data.workspaceDir ?? null,
            features,
          });
        } else {
          setInfo({ mode: null, managed: false, managedSessionId: null, hubUrl: null, workspaceDir: null, features });
        }
      } catch {
        if (!cancelled) {
          setInfo({ mode: null, managed: false, managedSessionId: null, hubUrl: null, workspaceDir: null, features: { tunnel: true, desktop: true, selfUpdate: true, remoteInstances: true } });
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
