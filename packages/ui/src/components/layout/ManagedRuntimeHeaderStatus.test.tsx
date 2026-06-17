import { describe, expect, test } from 'bun:test';

import {
  abbreviateManagedSessionId,
  formatLimuRuntimeVersionLabel,
  getWorkspaceStatusToneClassName,
} from './managedRuntimeHeaderStatusUtils';

describe('ManagedRuntimeHeaderStatus helpers', () => {
  test('abbreviates long managed session ids for header display', () => {
    expect(abbreviateManagedSessionId('jn7a80f6zg0y284r2z9zqwkben88d4fg')).toBe('jn7a80f6…d4fg');
    expect(abbreviateManagedSessionId('short-session')).toBe('short-session');
    expect(abbreviateManagedSessionId(null)).toBeNull();
  });

  test('keeps failed workspace state visibly textual and error toned', () => {
    expect(getWorkspaceStatusToneClassName('failed')).toContain('status-error');
    expect(getWorkspaceStatusToneClassName('succeeded')).toContain('status-success');
    expect(getWorkspaceStatusToneClassName('pending')).toContain('interactive-border');
  });

  test('formats Limu runtime version label from actual versions', () => {
    expect(formatLimuRuntimeVersionLabel('1.13.1', '1.17.7')).toBe('LIMU-1.13.1-1.17.7');
    expect(formatLimuRuntimeVersionLabel(' 1.13.1 ', null)).toBe('LIMU-1.13.1-unknown');
  });
});
