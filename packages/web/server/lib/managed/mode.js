const VALID_MANAGED_MODES = new Set(['runtime']);

export const resolveManagedMode = (raw) => {
  const normalized = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (VALID_MANAGED_MODES.has(normalized)) {
    return normalized;
  }
  return 'none';
};

export const isManagedRuntime = (mode) => mode === 'runtime';
export const isManaged = (mode) => isManagedRuntime(mode);
