import React, { useEffect, useState } from 'react';
import {
  Brain,
  ChevronDown,
  Copy,
  Minus,
  Moon,
  PanelRightOpen,
  Square,
  Sun,
  X,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import {
  formatFriendlyModelName,
  PROVIDER_META,
  ProviderBrandIcon,
} from './ProviderBrandIcon';
import { desktopApi } from '../lib/bridge';
import type { ProviderConfig, ThemeMode } from '@shared/types';

interface WindowTitleBarProps {
  activeProvider?: ProviderConfig;
  theme: ThemeMode;
  memoryCount?: number;
  memoryOpen?: boolean;
  artifactCount?: number;
  canvasOpen?: boolean;
  minimal?: boolean;
  onOpenSettings?: () => void;
  onToggleMemory?: () => void;
  onToggleCanvas?: () => void;
  onToggleTheme: () => void;
}

export const WindowTitleBar: React.FC<WindowTitleBarProps> = ({
  activeProvider,
  theme,
  memoryCount = 0,
  memoryOpen = false,
  artifactCount = 0,
  canvasOpen = false,
  minimal = false,
  onOpenSettings,
  onToggleMemory,
  onToggleCanvas,
  onToggleTheme,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    void desktopApi.windowIsMaximized().then(setIsMaximized);
  }, []);

  const isMac =
    typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent);

  const meta = activeProvider ? PROVIDER_META[activeProvider.id] : PROVIDER_META.demo;
  const friendlyModel = activeProvider
    ? formatFriendlyModelName(activeProvider.selectedModel)
    : 'Practice Mode';

  return (
    <header className="win12-drag flex h-11 shrink-0 items-center justify-between gap-3 px-3.5 select-none">
      {/* Clean Brand Title */}
      <div className="flex items-center gap-2.5 pl-1">
        {isMac && <div className="w-16 shrink-0" />}
        <BrandLogo size={24} />
        <span className="text-sm font-semibold tracking-tight text-ink">AuraDesk</span>
      </div>

      {/* Single Friendly AI Switcher Pill */}
      {!minimal && activeProvider && (
        <div className="win12-no-drag flex items-center justify-center">
          <button
            type="button"
            onClick={onOpenSettings}
            title="Switch AI or change API key"
            className="tactile-press inline-flex h-8 items-center gap-2 rounded-full border border-hairline bg-elevated px-3.5 text-xs font-medium text-ink shadow-card hover:border-strongline"
          >
            <span className={`flex h-5 w-5 items-center justify-center rounded-full ${meta.badgeClass}`}>
              <ProviderBrandIcon providerId={activeProvider.id} className="h-3.5 w-3.5" />
            </span>
            <span className="font-semibold">{meta.shortName}</span>
            {activeProvider.id !== 'demo' && (
              <>
                <span className="text-ink-muted">·</span>
                <span className="max-w-[160px] truncate text-ink-secondary">{friendlyModel}</span>
              </>
            )}
            <span
              className={`h-2 w-2 rounded-full ${
                activeProvider.isVerified ? 'bg-trust' : 'bg-warn'
              }`}
            />
            <ChevronDown className="h-3.5 w-3.5 text-ink-muted" strokeWidth={1.8} />
          </button>
        </div>
      )}

      {/* Clean Right Controls */}
      <div className="win12-no-drag flex items-center gap-1.5">
        {!minimal && (
          <>
            {artifactCount > 0 && onToggleCanvas && (
              <button
                type="button"
                onClick={onToggleCanvas}
                className={`tactile-press inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium ${
                  canvasOpen
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-hairline bg-elevated text-ink-secondary hover:text-ink'
                }`}
              >
                <PanelRightOpen className="h-3.5 w-3.5" strokeWidth={1.8} />
                <span>Document</span>
              </button>
            )}

            {onToggleMemory && (
              <button
                type="button"
                onClick={onToggleMemory}
                className={`tactile-press inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium ${
                  memoryOpen
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-hairline bg-elevated text-ink-secondary hover:text-ink'
                }`}
              >
                <Brain className="h-3.5 w-3.5" strokeWidth={1.8} />
                <span>Notes</span>
                {memoryCount > 0 && (
                  <span className="tabular-nums rounded-full bg-subtle px-1.5 text-[11px]">
                    {memoryCount}
                  </span>
                )}
              </button>
            )}
          </>
        )}

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          className="tactile-press flex h-8 w-8 items-center justify-center rounded-full text-ink-secondary hover:bg-elevated hover:text-ink"
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4" strokeWidth={1.8} />
          ) : (
            <Moon className="h-4 w-4" strokeWidth={1.8} />
          )}
        </button>

        {!isMac && (
          <div className="ml-1 flex items-center">
            <button
              type="button"
              onClick={() => desktopApi.windowMinimize()}
              aria-label="Minimize window"
              className="flex h-8 w-10 items-center justify-center rounded-lg text-ink-secondary hover:bg-elevated hover:text-ink"
            >
              <Minus className="h-3.5 w-3.5" strokeWidth={1.8} />
            </button>

            <button
              type="button"
              onClick={async () => {
                const next = await desktopApi.windowToggleMaximize();
                setIsMaximized(next);
              }}
              aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
              className="flex h-8 w-10 items-center justify-center rounded-lg text-ink-secondary hover:bg-elevated hover:text-ink"
            >
              {isMaximized ? (
                <Copy className="h-3 w-3" strokeWidth={1.8} />
              ) : (
                <Square className="h-3 w-3" strokeWidth={1.8} />
              )}
            </button>

            <button
              type="button"
              onClick={() => desktopApi.windowClose()}
              aria-label="Close window"
              className="flex h-8 w-10 items-center justify-center rounded-lg text-ink-secondary hover:bg-[#C42B1C] hover:text-white"
            >
              <X className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
