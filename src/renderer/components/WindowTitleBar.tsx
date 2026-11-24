import React, { useEffect, useState } from 'react';
import {
  Brain,
  ChevronDown,
  Copy,
  Minus,
  Moon,
  PanelRightOpen,
  Search,
  Square,
  Sun,
  X,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { PROVIDER_META, ProviderBrandIcon } from './ProviderBrandIcon';
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
  onOpenCommandPalette?: () => void;
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
  onOpenCommandPalette,
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

  return (
    <header className="win12-drag flex h-11 shrink-0 items-center justify-between gap-3 px-3 select-none">
      {/* Left Brand Cluster */}
      <div className="flex items-center gap-2.5 pl-1">
        {isMac && <div className="w-16 shrink-0" />}
        <BrandLogo size={24} />
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold tracking-tight text-ink">AuraDesk</span>
          <span className="rounded-md border border-hairline bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-accent">
            12 Pro
          </span>
        </div>
      </div>

      {/* Center Windows 12 Pro Universal Pill & Engine Switcher */}
      {!minimal && (
        <div className="win12-no-drag flex max-w-2xl flex-1 items-center justify-center gap-2">
          <button
            type="button"
            onClick={onOpenCommandPalette}
            className="tactile-press hidden h-8 w-64 items-center justify-between rounded-full border border-hairline bg-surface px-3.5 text-xs text-ink-muted shadow-card hover:border-strongline hover:text-ink md:flex"
          >
            <span className="flex items-center gap-2">
              <Search className="h-3.5 w-3.5" strokeWidth={1.8} />
              Quick actions &amp; workflows...
            </span>
            <kbd className="rounded bg-subtle px-1.5 py-0.5 font-mono text-[10px] text-ink-secondary">
              Ctrl+K
            </kbd>
          </button>

          {activeProvider && (
            <button
              type="button"
              onClick={onOpenSettings}
              title="Configure AI Engines & Live Models"
              className="tactile-press inline-flex h-8 items-center gap-2 rounded-full border border-hairline bg-surface px-3 text-xs font-medium text-ink shadow-card hover:border-strongline"
            >
              <span className={`flex h-5 w-5 items-center justify-center rounded-full ${meta.badgeClass}`}>
                <ProviderBrandIcon providerId={activeProvider.id} className="h-3.5 w-3.5" />
              </span>
              <span className="font-semibold">{meta.shortName}</span>
              <span className="max-w-[150px] truncate text-ink-secondary">
                {activeProvider.selectedModel}
              </span>
              <span
                className={`h-2 w-2 rounded-full ${
                  activeProvider.isVerified ? 'bg-trust' : 'bg-warn'
                }`}
              />
              <ChevronDown className="h-3.5 w-3.5 text-ink-muted" strokeWidth={1.8} />
            </button>
          )}
        </div>
      )}

      {/* Right Utility & Native Windows 12 Caption Controls */}
      <div className="win12-no-drag flex items-center gap-1">
        {!minimal && (
          <>
            {artifactCount > 0 && onToggleCanvas && (
              <button
                type="button"
                onClick={onToggleCanvas}
                className={`tactile-press inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium ${
                  canvasOpen
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-hairline bg-surface text-ink-secondary hover:text-ink'
                }`}
              >
                <PanelRightOpen className="h-3.5 w-3.5" strokeWidth={1.8} />
                <span className="hidden sm:inline">Canvas</span>
                <span className="tabular-nums text-[11px]">{artifactCount}</span>
              </button>
            )}

            {onToggleMemory && (
              <button
                type="button"
                onClick={onToggleMemory}
                className={`tactile-press inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium ${
                  memoryOpen
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-hairline bg-surface text-ink-secondary hover:text-ink'
                }`}
              >
                <Brain className="h-3.5 w-3.5" strokeWidth={1.8} />
                <span className="hidden sm:inline">Memory</span>
                <span className="tabular-nums text-[11px]">{memoryCount}</span>
              </button>
            )}
          </>
        )}

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to Daylight Mica' : 'Switch to Midnight Mica'}
          title={theme === 'dark' ? 'Daylight Mica' : 'Midnight Mica'}
          className="tactile-press flex h-8 w-8 items-center justify-center rounded-full text-ink-secondary hover:bg-surface hover:text-ink"
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
              className="flex h-8 w-10 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-surface hover:text-ink"
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
              className="flex h-8 w-10 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-surface hover:text-ink"
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
              className="flex h-8 w-10 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-[#C42B1C] hover:text-white"
            >
              <X className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
