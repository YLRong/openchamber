import { create } from 'zustand';
import {
  areWorkspaceBootstrapDiagnosticsEqual,
  DEFAULT_WORKSPACE_BOOTSTRAP_DIAGNOSTICS,
  type WorkspaceBootstrapDiagnostics,
} from '@/lib/managedRuntimeDiagnostics';

export interface ManagedRuntimeFeatures {
  tunnel: boolean;
  desktop: boolean;
  selfUpdate: boolean;
  remoteInstances: boolean;
}

export interface ManagedRuntimeInfo {
  mode: 'runtime' | null;
  managed: boolean;
  managedSessionId: string | null;
  hubUrl: string | null;
  workspaceDir: string | null;
  openchamberVersion: string | null;
  openCodeVersion: string | null;
  workspaceBootstrap: WorkspaceBootstrapDiagnostics;
  features: ManagedRuntimeFeatures;
}

interface ManagedRuntimeState extends ManagedRuntimeInfo {
  isLoading: boolean;
  error: Error | null;
  setInfo: (info: ManagedRuntimeInfo) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: Error | null) => void;
}

const defaultFeatures: ManagedRuntimeFeatures = {
  tunnel: true,
  desktop: true,
  selfUpdate: true,
  remoteInstances: true,
};

export const useManagedRuntimeStore = create<ManagedRuntimeState>((set) => ({
  mode: null,
  managed: false,
  managedSessionId: null,
  hubUrl: null,
  workspaceDir: null,
  openchamberVersion: null,
  openCodeVersion: null,
  workspaceBootstrap: DEFAULT_WORKSPACE_BOOTSTRAP_DIAGNOSTICS,
  features: defaultFeatures,
  isLoading: true,
  error: null,
  setInfo: (info) => set((state) => {
    const features = (
      state.features.tunnel === info.features.tunnel
      && state.features.desktop === info.features.desktop
      && state.features.selfUpdate === info.features.selfUpdate
      && state.features.remoteInstances === info.features.remoteInstances
    )
      ? state.features
      : info.features;
    const workspaceBootstrap = areWorkspaceBootstrapDiagnosticsEqual(state.workspaceBootstrap, info.workspaceBootstrap)
      ? state.workspaceBootstrap
      : info.workspaceBootstrap;

    if (
      state.mode === info.mode
      && state.managed === info.managed
      && state.managedSessionId === info.managedSessionId
      && state.hubUrl === info.hubUrl
      && state.workspaceDir === info.workspaceDir
      && state.openchamberVersion === info.openchamberVersion
      && state.openCodeVersion === info.openCodeVersion
      && state.workspaceBootstrap === workspaceBootstrap
      && state.features === features
      && state.isLoading === false
      && state.error === null
    ) {
      return state;
    }

    return {
      ...state,
      mode: info.mode,
      managed: info.managed,
      managedSessionId: info.managedSessionId,
      hubUrl: info.hubUrl,
      workspaceDir: info.workspaceDir,
      openchamberVersion: info.openchamberVersion,
      openCodeVersion: info.openCodeVersion,
      workspaceBootstrap,
      features,
      isLoading: false,
      error: null,
    };
  }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error, isLoading: false }),
}));
