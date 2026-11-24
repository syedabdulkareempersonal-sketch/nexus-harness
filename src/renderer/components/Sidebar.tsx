import React from 'react';
import {
  Blocks,
  Layers,
  MessageSquare,
  Moon,
  Plus,
  Settings,
  Sun,
  Trash2,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import type { ConversationSummary, ThemeMode } from '@shared/types';

export type NavTab = 'chat' | 'workflows' | 'superpowers';

interface SidebarProps {
  activeTab: NavTab;
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  theme: ThemeMode;
  activeSuperpowerCount: number;
  workflowCount: number;
  onSelectTab: (tab: NavTab) => void;
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
  theme,
  activeSuperpowerCount,
  workflowCount,
  onSelectTab,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onToggleTheme,
  onOpenSettings,
}) => {
  return (
    <aside
      aria-label="Primary Workspace Navigation"
      className="flex h-full w-64 shrink-0 flex-col border-r border-hairline bg-subtle/75 select-none"
    >
      {/* Brand Header + New Chat */}
      <div className="flex items-center justify-between px-4 pb-3 pt-4">
        <div className="flex items-center gap-2.5">
          <BrandLogo size={30} />
          <span className="text-base font-semibold tracking-tight text-ink">AuraDesk</span>
        </div>

        <button
          type="button"
          onClick={onNewChat}
          title="New Chat (Ctrl+N)"
          aria-label="Start a new chat"
          className="tactile-press inline-flex items-center gap-1 rounded-xl bg-accent px-2.5 py-1.5 text-xs font-semibold text-accent-ink hover:bg-accent-hover"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.1} />
          New
        </button>
      </div>

      {/* Primary Studio Modes */}
      <nav aria-label="Studio Sections" className="space-y-1 px-3 pb-3">
        <button
          type="button"
          onClick={() => onSelectTab('chat')}
          className={`tactile-press flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium ${
            activeTab === 'chat'
              ? 'bg-surface text-ink shadow-card'
              : 'text-ink-secondary hover:bg-surface/60 hover:text-ink'
          }`}
        >
          <span className="flex items-center gap-2.5">
            <MessageSquare className="h-4 w-4 shrink-0" strokeWidth={1.8} />
            Workspace Chat
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('workflows')}
          className={`tactile-press flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium ${
            activeTab === 'workflows'
              ? 'bg-surface text-ink shadow-card'
              : 'text-ink-secondary hover:bg-surface/60 hover:text-ink'
          }`}
        >
          <span className="flex items-center gap-2.5">
            <Layers className="h-4 w-4 shrink-0" strokeWidth={1.8} />
            Workflows
          </span>
          <span className="tabular-nums rounded-full bg-canvas px-2 py-0.5 text-[11px] text-ink-muted">
            {workflowCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('superpowers')}
          className={`tactile-press flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium ${
            activeTab === 'superpowers'
              ? 'bg-surface text-ink shadow-card'
              : 'text-ink-secondary hover:bg-surface/60 hover:text-ink'
          }`}
        >
          <span className="flex items-center gap-2.5">
            <Blocks className="h-4 w-4 shrink-0" strokeWidth={1.8} />
            Superpowers
          </span>
          <span className="tabular-nums rounded-full bg-trust-soft px-2 py-0.5 text-[11px] font-medium text-trust">
            {activeSuperpowerCount} on
          </span>
        </button>
      </nav>

      {/* Conversation History */}
      <div className="flex-1 overflow-y-auto border-t border-hairline px-3 py-3">
        <div className="mb-2 px-2 text-xs font-medium text-ink-muted">Recent Sessions</div>

        {conversations.length === 0 ? (
          <p className="px-2 py-3 text-xs leading-relaxed text-ink-muted">
            Your conversations stay private on this computer and will appear here.
          </p>
        ) : (
          <ul className="space-y-1">
            {conversations.map((conv) => {
              const isSelected = activeTab === 'chat' && conv.id === activeConversationId;
              return (
                <li key={conv.id} className="group relative flex items-center">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectTab('chat');
                      onSelectConversation(conv.id);
                    }}
                    className={`w-full truncate rounded-xl py-2 pl-3 pr-8 text-left text-xs font-medium transition-colors ${
                      isSelected
                        ? 'bg-surface text-ink shadow-card'
                        : 'text-ink-secondary hover:bg-surface/55 hover:text-ink'
                    }`}
                  >
                    {conv.title}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteConversation(conv.id);
                    }}
                    aria-label={`Delete conversation ${conv.title}`}
                    className="absolute right-1.5 rounded-lg p-1 text-ink-muted opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger focus:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer Controls */}
      <div className="flex items-center justify-between border-t border-hairline px-3 py-3">
        <button
          type="button"
          onClick={onOpenSettings}
          className="tactile-press inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-ink-secondary hover:bg-surface hover:text-ink"
        >
          <Settings className="h-4 w-4" strokeWidth={1.8} />
          AI &amp; Keys
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          title={theme === 'dark' ? 'Switch to Daylight Mode' : 'Switch to Dark Mode'}
          className="tactile-press rounded-xl p-2 text-ink-secondary hover:bg-surface hover:text-ink"
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4" strokeWidth={1.8} />
          ) : (
            <Moon className="h-4 w-4" strokeWidth={1.8} />
          )}
        </button>
      </div>
    </aside>
  );
};
