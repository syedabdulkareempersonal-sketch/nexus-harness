import React from 'react';
import {
  Blocks,
  MessageSquare,
  Moon,
  Plus,
  Settings,
  Sun,
  Trash2,
  Workflow,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import type { ConversationSummary, ThemeMode } from '@shared/types';

export type ActiveNavTab = 'chat' | 'workflows' | 'superpowers';

interface SidebarProps {
  activeTab: ActiveNavTab;
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  enabledToolsCount: number;
  theme: ThemeMode;
  onSelectTab: (tab: ActiveNavTab) => void;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  conversations,
  activeConversationId,
  enabledToolsCount,
  theme,
  onSelectTab,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onToggleTheme,
  onOpenSettings,
}) => {
  const isDark = theme === 'dark';

  return (
    <aside
      aria-label="Primary Workspace Navigation"
      className="flex h-full w-64 shrink-0 flex-col border-r border-hairline bg-subtle/65 select-none"
    >
      {/* Brand + New Chat */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2.5">
          <BrandLogo size={30} />
          <span className="text-base font-semibold tracking-tight text-ink">AuraDesk</span>
        </div>

        <button
          type="button"
          onClick={onNewChat}
          title="New Chat (Ctrl+N)"
          aria-label="Start a new chat"
          className="tactile-press inline-flex items-center gap-1 rounded-xl border border-hairline bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink shadow-card hover:bg-elevated"
        >
          <Plus className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
          New
        </button>
      </div>

      {/* Primary Views */}
      <nav aria-label="Workspace sections" className="space-y-1 px-3 py-2">
        <button
          type="button"
          onClick={() => onSelectTab('chat')}
          className={`tactile-press flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium ${
            activeTab === 'chat'
              ? 'bg-surface text-ink shadow-card'
              : 'text-ink-secondary hover:bg-surface/60 hover:text-ink'
          }`}
        >
          <span className="flex items-center gap-2.5">
            <MessageSquare className="h-4 w-4 shrink-0" strokeWidth={1.8} />
            Workspace
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('workflows')}
          className={`tactile-press flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium ${
            activeTab === 'workflows'
              ? 'bg-surface text-ink shadow-card'
              : 'text-ink-secondary hover:bg-surface/60 hover:text-ink'
          }`}
        >
          <span className="flex items-center gap-2.5">
            <Workflow className="h-4 w-4 shrink-0" strokeWidth={1.8} />
            Workflows
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('superpowers')}
          className={`tactile-press flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium ${
            activeTab === 'superpowers'
              ? 'bg-surface text-ink shadow-card'
              : 'text-ink-secondary hover:bg-surface/60 hover:text-ink'
          }`}
        >
          <span className="flex items-center gap-2.5">
            <Blocks className="h-4 w-4 shrink-0" strokeWidth={1.8} />
            Superpowers
          </span>
          <span className="tabular-nums rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
            {enabledToolsCount}
          </span>
        </button>
      </nav>

      {/* Conversation History */}
      <div className="mt-3 flex min-h-0 flex-1 flex-col border-t border-hairline px-3 pt-3">
        <div className="px-2 pb-2 text-xs font-medium text-ink-muted">Recent Sessions</div>

        <div className="flex-1 space-y-1 overflow-y-auto pr-0.5">
          {conversations.length === 0 ? (
            <p className="px-2 py-4 text-xs leading-relaxed text-ink-muted">
              Your conversations stay privately stored on this computer.
            </p>
          ) : (
            conversations.map((conv) => {
              const selected = activeTab === 'chat' && conv.id === activeConversationId;
              return (
                <div
                  key={conv.id}
                  className={`group flex items-center justify-between rounded-xl px-2.5 py-2 text-xs ${
                    selected
                      ? 'bg-surface font-medium text-ink shadow-card'
                      : 'text-ink-secondary hover:bg-surface/60 hover:text-ink'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectTab('chat');
                      onSelectConversation(conv.id);
                    }}
                    className="min-w-0 flex-1 truncate text-left"
                  >
                    {conv.title}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteConversation(conv.id);
                    }}
                    aria-label={`Delete ${conv.title}`}
                    className="ml-1 hidden shrink-0 rounded-md p-1 text-ink-muted hover:bg-danger-soft hover:text-danger group-hover:inline-flex"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="flex items-center justify-between border-t border-hairline p-3">
        <button
          type="button"
          onClick={onOpenSettings}
          className="tactile-press inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-ink-secondary hover:bg-surface hover:text-ink"
        >
          <Settings className="h-4 w-4" strokeWidth={1.8} />
          AI Models &amp; Keys
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={isDark ? 'Switch to Daylight theme' : 'Switch to Obsidian dark theme'}
          title={isDark ? 'Switch to Daylight' : 'Switch to Dark mode'}
          className="tactile-press rounded-xl p-2 text-ink-secondary hover:bg-surface hover:text-ink"
        >
          {isDark ? (
            <Sun className="h-4 w-4" strokeWidth={1.8} />
          ) : (
            <Moon className="h-4 w-4" strokeWidth={1.8} />
          )}
        </button>
      </div>
    </aside>
  );
};
