import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useManagedRuntime, useManagedRuntimeInfo } from '@/hooks/useManagedRuntimeInfo';
import { getWorkspaceBootstrapCopyKeys } from '@/lib/managedRuntimeDiagnostics';
import { useI18n } from '@/lib/i18n';

export const ManagedRuntimeBanner = React.memo(function ManagedRuntimeBanner() {
  useManagedRuntimeInfo();
  const { t } = useI18n();
  const { managed, managedSessionId, hubUrl, workspaceDir, workspaceBootstrap } = useManagedRuntime();

  if (!managed) {
    return null;
  }

  const bootstrapCopy = getWorkspaceBootstrapCopyKeys(workspaceBootstrap);

  return (
    <div
      className={cn(
        'flex flex-col gap-2 border-b px-3 py-2 text-foreground',
        'border-[var(--interactive-border)]',
        'bg-[color-mix(in_srgb,var(--status-info)_8%,var(--background))]',
        'sm:flex-row sm:items-center sm:justify-between'
      )}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2 typography-ui-label">
          <span className="font-medium text-foreground">{t('layout.managedRuntime.title')}</span>
          {managedSessionId ? (
            <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <span>{t('layout.managedRuntime.sessionLabel')}</span>
              <span className="truncate font-mono text-foreground/80">{managedSessionId}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{t('layout.managedRuntime.sessionPending')}</span>
          )}
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 typography-micro text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span>{t('layout.managedRuntime.workspaceLabel')}</span>
            <span
              className={cn(
                'rounded-full border px-1.5 py-px text-foreground',
                workspaceBootstrap.state === 'failed'
                  ? 'border-[var(--status-error-border)] bg-[var(--status-error-background)] text-[var(--status-error)]'
                  : 'border-[var(--interactive-border)] bg-[var(--surface-elevated)]'
              )}
            >
              {t(bootstrapCopy.stateLabelKey)}
            </span>
          </span>
          <span className="min-w-0 truncate">{t(bootstrapCopy.descriptionKey)}</span>
          {workspaceBootstrap.reason ? (
            <span className="min-w-0 truncate font-mono text-muted-foreground/80">
              {t('layout.managedRuntime.bootstrap.rawReason', { reason: workspaceBootstrap.reason })}
            </span>
          ) : null}
          {workspaceBootstrap.error ? (
            <span className="min-w-0 truncate text-[var(--status-error)]">
              {t('layout.managedRuntime.bootstrap.rawError', { error: workspaceBootstrap.error })}
            </span>
          ) : null}
          {workspaceDir ? (
            <span className="min-w-0 truncate">
              {t('layout.managedRuntime.workspaceDir', { path: workspaceDir })}
            </span>
          ) : null}
        </div>
      </div>
      {hubUrl ? (
        <Button asChild size="sm" variant="default" className="self-start sm:self-center">
          <a href={hubUrl} aria-label={t('layout.managedRuntime.backToHub')}>
            {t('layout.managedRuntime.backToHub')}
          </a>
        </Button>
      ) : null}
    </div>
  );
});
