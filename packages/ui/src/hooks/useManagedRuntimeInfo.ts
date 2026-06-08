import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { runtimeFetch } from '@/lib/runtime-fetch';
import { useManagedRuntimeStore, type ManagedRuntimeFeatures, type ManagedRuntimeInfo } from '@/stores/useManagedRuntimeStore';

interface SystemInfoResponse {
  openchamberVersion?: string;
  runtime?: string;
  pid?: number;
  startedAt?: string;
  mode?: 'runtime';
  managed?: boolean;
  managedSessionId?: string | null;
  hubUrl?: string | null;
  workspaceDir?: string | null;
  features?: ManagedRuntimeFeatures;
}

const POLL_INTERVAL_MS = 30_000;

const availableFeatures: ManagedRuntimeFeatures = {
  tunnel: true,
  desktop: true,
  selfUpdate: true,
  remoteInstances: true,
};

function normalizeInfo(data: SystemInfoResponse | null | undefined): ManagedRuntimeInfo {
  if (!data || typeof data !== 'object' || data.managed !== true) {
    return {
      mode: null,
      managed: false,
      managedSessionId: null,
      hubUrl: null,
      workspaceDir: null,
      features: availableFeatures,
    };
  }

  return {
    mode: data.mode === 'runtime' ? 'runtime' : null,
    managed: true,
    managedSessionId: data.managedSessionId ?? null,
    hubUrl: data.hubUrl ?? null,
    workspaceDir: data.workspaceDir ?? null,
    features: {
      tunnel: data.features?.tunnel ?? false,
      desktop: data.features?.desktop ?? false,
      selfUpdate: data.features?.selfUpdate ?? false,
      remoteInstances: data.features?.remoteInstances ?? false,
    },
  };
}

async function fetchManagedRuntimeInfo(): Promise<ManagedRuntimeInfo> {
  const response = await runtimeFetch('/api/system/info', {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Server responded with ${response.status}`);
  }
  const data = (await response.json()) as SystemInfoResponse;
  return normalizeInfo(data);
}

export function useManagedRuntimeInfo() {
  const setInfo = useManagedRuntimeStore((s) => s.setInfo);
  const setError = useManagedRuntimeStore((s) => s.setError);
  const disposedRef = useRef(false);

  useEffect(() => {
    disposedRef.current = false;

    const refresh = async () => {
      try {
        const info = await fetchManagedRuntimeInfo();
        if (!disposedRef.current) {
          setInfo(info);
        }
      } catch (error) {
        if (!disposedRef.current) {
          setError(error instanceof Error ? error : new Error(String(error)));
        }
      }
    };

    void refresh();

    const timer = window.setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);

    return () => {
      disposedRef.current = true;
      window.clearInterval(timer);
    };
  }, [setInfo, setError]);
}

export function useManagedRuntime() {
  return useManagedRuntimeStore(useShallow((s) => ({
    mode: s.mode,
    managed: s.managed,
    managedSessionId: s.managedSessionId,
    hubUrl: s.hubUrl,
    workspaceDir: s.workspaceDir,
    features: s.features,
    isLoading: s.isLoading,
    error: s.error,
  })));
}
