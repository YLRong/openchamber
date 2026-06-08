import React from 'react';
import { cn } from '@/lib/utils';
import { useManagedRuntime, useManagedRuntimeInfo } from '@/hooks/useManagedRuntimeInfo';

export const ManagedRuntimeBanner = React.memo(function ManagedRuntimeBanner() {
  useManagedRuntimeInfo();
  const { managed, managedSessionId, hubUrl } = useManagedRuntime();

  if (!managed) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3',
        'px-3 py-1.5',
        'bg-primary/10 text-primary',
        'border-b border-primary/20',
        'typography-ui-label'
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate">
          Managed Session
          {managedSessionId ? (
            <span className="ml-1.5 font-mono text-primary/80">
              {managedSessionId}
            </span>
          ) : null}
        </span>
      </div>
      {hubUrl ? (
        <a
          href={hubUrl}
          className={cn(
            'shrink-0 rounded px-2 py-0.5',
            'bg-primary text-primary-foreground',
            'hover:bg-primary/90',
            'transition-colors'
          )}
        >
          Back to Hub
        </a>
      ) : null}
    </div>
  );
});
