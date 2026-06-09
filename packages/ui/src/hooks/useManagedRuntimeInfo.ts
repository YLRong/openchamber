import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { runtimeFetch } from '@/lib/runtime-fetch';
import { normalizeWorkspaceBootstrapDiagnostics } from '@/lib/managedRuntimeDiagnostics';
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
  workspaceBootstrap?: unknown;
  features?: Partial<ManagedRuntimeFeatures>;
}

const POLL_INTERVAL_MS = 30_000;

const availableFeatures: ManagedRuntimeFeatures = {
  tunnel: true,
  desktop: true,
  selfUpdate: true,
  remoteInstances: true,
};

const MANAGED_RUNTIME_SESSION_STORAGE_KEY = 'openchamber.managedRuntimeSessionId';
const MANAGED_RUNTIME_SCOPED_STORAGE_KEYS = [
  'config-store',
  'homeDirectory',
  'lastDirectory',
  'oc.sessions.activeSessionByProject',
  'oc.sessions.folderCollapse',
  'oc.sessions.folders',
  'oc.sessions.groupCollapse',
  'oc.sessions.groupOrder',
  'openchamber.pwaRecentSessions',
];

function resetManagedRuntimeStorageIfNeeded(info: ManagedRuntimeInfo): boolean {
  if (typeof window === 'undefined' || !info.managed || info.mode !== 'runtime' || !info.managedSessionId) {
    return false;
  }

  try {
    const previousSessionId = window.localStorage.getItem(MANAGED_RUNTIME_SESSION_STORAGE_KEY);
    if (previousSessionId === info.managedSessionId) {
      return false;
    }

    // NodePort 可能被不同 Managed session 复用；本地持久化状态必须按 session 隔离。
    for (const key of MANAGED_RUNTIME_SCOPED_STORAGE_KEYS) {
      window.localStorage.removeItem(key);
    }
    window.localStorage.setItem(MANAGED_RUNTIME_SESSION_STORAGE_KEY, info.managedSessionId);
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

export function normalizeManagedRuntimeInfo(data: SystemInfoResponse | null | undefined): ManagedRuntimeInfo {
  if (!data || typeof data !== 'object' || data.managed !== true) {
    return {
      mode: null,
      managed: false,
      managedSessionId: null,
      hubUrl: null,
      workspaceDir: null,
      workspaceBootstrap: normalizeWorkspaceBootstrapDiagnostics(null),
      features: availableFeatures,
    };
  }

  return {
    mode: data.mode === 'runtime' ? 'runtime' : null,
    managed: true,
    managedSessionId: data.managedSessionId ?? null,
    hubUrl: data.hubUrl ?? null,
    workspaceDir: data.workspaceDir ?? null,
    workspaceBootstrap: normalizeWorkspaceBootstrapDiagnostics(data.workspaceBootstrap),
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
  return normalizeManagedRuntimeInfo(data);
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
        if (resetManagedRuntimeStorageIfNeeded(info)) {
          return;
        }
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
    workspaceBootstrap: s.workspaceBootstrap,
    features: s.features,
    isLoading: s.isLoading,
    error: s.error,
  })));
}
