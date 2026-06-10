import React from 'react';
import { useShallow } from 'zustand/react/shallow';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useManagedRuntimeInfo } from '@/hooks/useManagedRuntimeInfo';
import { getWorkspaceBootstrapCopyKeys } from '@/lib/managedRuntimeDiagnostics';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useManagedRuntimeStore } from '@/stores/useManagedRuntimeStore';
import { abbreviateManagedSessionId, getWorkspaceStatusToneClassName } from './managedRuntimeHeaderStatusUtils';

type ManagedRuntimeHeaderStatusProps = {
  compact?: boolean;
  className?: string;
};

type ManagedRuntimeHubButtonProps = {
  compact?: boolean;
  className?: string;
};

const ManagedRuntimeDetails = React.memo(function ManagedRuntimeDetails() {
  const { t } = useI18n();
  const {
    managedSessionId,
    workspaceDir,
    workspaceBootstrap,
    hubUrl,
  } = useManagedRuntimeStore(useShallow((state) => ({
    managedSessionId: state.managedSessionId,
    workspaceDir: state.workspaceDir,
    workspaceBootstrap: state.workspaceBootstrap,
    hubUrl: state.hubUrl,
  })));
  const bootstrapCopy = getWorkspaceBootstrapCopyKeys(workspaceBootstrap);

  return (
    <div className="w-[min(22rem,calc(100vw-2rem))] p-2">
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <div className="min-w-0">
          <div className="typography-ui-label font-semibold text-foreground">
            {t('layout.managedRuntime.detailsTitle')}
          </div>
          <div className="typography-micro text-muted-foreground">
            {t('layout.managedRuntime.title')}
          </div>
        </div>
        {hubUrl ? (
          <Button asChild size="xs" variant="outline" className="app-region-no-drag">
            <a href={hubUrl} aria-label={t('layout.managedRuntime.backToHub')}>
              {t('layout.managedRuntime.backToHub')}
            </a>
          </Button>
        ) : null}
      </div>

      <div className="space-y-2 rounded-lg border border-[var(--interactive-border)] bg-[var(--surface-muted)]/40 p-2">
        <div className="min-w-0">
          <div className="typography-micro text-muted-foreground">
            {t('layout.managedRuntime.sessionLabel')}
          </div>
          <div className="break-all font-mono text-[11px] leading-snug text-foreground">
            {managedSessionId ?? t('layout.managedRuntime.sessionPending')}
          </div>
        </div>

        <div className="min-w-0">
          <div className="typography-micro text-muted-foreground">
            {t('layout.managedRuntime.workspaceLabel')}
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
            <span className={cn(
              'inline-flex items-center rounded-full border px-1.5 py-px typography-micro font-medium',
              getWorkspaceStatusToneClassName(workspaceBootstrap.state)
            )}>
              {t(bootstrapCopy.stateLabelKey)}
            </span>
            <span className="min-w-0 text-[11px] leading-snug text-muted-foreground">
              {t(bootstrapCopy.descriptionKey)}
            </span>
          </div>
        </div>

        {workspaceBootstrap.reason ? (
          <div className="break-all font-mono text-[11px] leading-snug text-muted-foreground">
            {t('layout.managedRuntime.bootstrap.rawReason', { reason: workspaceBootstrap.reason })}
          </div>
        ) : null}
        {workspaceBootstrap.error ? (
          <div className="break-all text-[11px] leading-snug text-[var(--status-error)]">
            {t('layout.managedRuntime.bootstrap.rawError', { error: workspaceBootstrap.error })}
          </div>
        ) : null}
        {workspaceBootstrap.workspaceDir || workspaceDir ? (
          <div className="break-all font-mono text-[11px] leading-snug text-muted-foreground">
            {t('layout.managedRuntime.workspaceDir', { path: workspaceBootstrap.workspaceDir ?? workspaceDir ?? '' })}
          </div>
        ) : null}
      </div>
    </div>
  );
});

export const ManagedRuntimeHeaderStatus = React.memo(function ManagedRuntimeHeaderStatus({
  compact = false,
  className,
}: ManagedRuntimeHeaderStatusProps) {
  useManagedRuntimeInfo();
  const { t } = useI18n();
  const {
    managed,
    managedSessionId,
    workspaceBootstrap,
  } = useManagedRuntimeStore(useShallow((state) => ({
    managed: state.managed,
    managedSessionId: state.managedSessionId,
    workspaceBootstrap: state.workspaceBootstrap,
  })));

  if (!managed) {
    return null;
  }

  const bootstrapCopy = getWorkspaceBootstrapCopyKeys(workspaceBootstrap);
  const shortSessionId = abbreviateManagedSessionId(managedSessionId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'app-region-no-drag flex min-w-0 items-center rounded-lg border border-[var(--interactive-border)] bg-[var(--surface-elevated)] text-left transition-colors hover:bg-[var(--interactive-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            compact ? 'h-9 max-w-[8.5rem] gap-1.5 px-2' : 'h-8 max-w-[22rem] gap-2 px-2.5',
            className
          )}
          aria-label={t('layout.managedRuntime.detailsAria')}
          title={managedSessionId ?? t('layout.managedRuntime.title')}
        >
          <span className={cn(
            'shrink-0 rounded-full border px-1.5 py-px typography-micro font-semibold',
            getWorkspaceStatusToneClassName(workspaceBootstrap.state)
          )}>
            {compact ? t('layout.managedRuntime.compactLabel') : t('layout.managedRuntime.title')}
          </span>
          <span className="min-w-0 truncate font-mono text-[11px] leading-none text-foreground">
            {shortSessionId ?? t('layout.managedRuntime.sessionPending')}
          </span>
          {!compact ? (
            <span className={cn(
              'shrink-0 rounded-full border px-1.5 py-px typography-micro font-medium',
              getWorkspaceStatusToneClassName(workspaceBootstrap.state)
            )}>
              {t(bootstrapCopy.stateLabelKey)}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} portalToBody>
        <ManagedRuntimeDetails />
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

export const ManagedRuntimeHubButton = React.memo(function ManagedRuntimeHubButton({
  compact = false,
  className,
}: ManagedRuntimeHubButtonProps) {
  const { t } = useI18n();
  const { managed, hubUrl } = useManagedRuntimeStore(useShallow((state) => ({
    managed: state.managed,
    hubUrl: state.hubUrl,
  })));

  if (!managed || !hubUrl) {
    return null;
  }

  return (
    <Button asChild size="xs" variant="outline" className={cn('app-region-no-drag', compact && 'h-9 px-2', className)}>
      <a href={hubUrl} aria-label={t('layout.managedRuntime.backToHub')} title={t('layout.managedRuntime.backToHub')}>
        {compact ? 'Hub' : t('layout.managedRuntime.backToHub')}
      </a>
    </Button>
  );
});
