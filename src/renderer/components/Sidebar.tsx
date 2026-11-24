import React from 'react';
import {
  Blocks,
  Cpu,
  Layers,
  MessageSquare,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type { ConversationSummary } from '@shared/types';

export type NavTab = 'chat' | 'workflows' | 'superpowers';

interface SidebarProps {
  activeTab: NavTab;
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  activeSuperpowerCount: number;
  workflowCount: number;
  onSelectTab: (tab: NavTab) => void;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onOpenSettings: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  conversations,
  activeConversationId,
  activeSuperpowerCount,
  workflowCount,
  onSelectTab,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onOpenSettings,
}) => {
  return (
    <aside
      aria-label="Primary Workspace Navigation"
      className="win12-island flex h-full w-64 shrink-0 flex-col rounded-2xl select-none"
    >
      {/* Top Action Button */}
      <div className="p-3 pb-2">
        <button
          type="button"
          onClick={onNewChat}
          title="Start New Session (Ctrl+N)"
          className="tactile-press flex w-full items-center justify-between rounded-xl bg-accent px-3.5 py-2.5 text-xs font-semibold text-accent-ink shadow-card hover:bg-accent-hover"
        >
          <span className="flex items-center gap-2">
            <Plus className="h-4 w-4" strokeWidth={2.2} />
            New Session
          </span>
          <kbd className="rounded bg-black/15 px-1.5 py-0.5 font-mono text-[10px] opacity-90">
            Ctrl+N
          </kbd>
        </button>
      </div>

      {/* Windows 12 Pro Navigation Stack with Fluent Active Pill */}
      <nav aria-label="Studio Sections" className="space-y-1 px-2.5 pb-3">
        <button
          type="button"
          onClick={() => onSelectTab('chat')}
          className={`tactile-press flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium ${
            activeTab === 'chat'
              ? 'bg-elevated text-ink font-semibold shadow-card'
              : 'text-ink-secondary hover:bg-subtle hover:text-ink'
          }`}
        >
          <span className="flex items-center gap-2.5">
            {activeTab === 'chat' && <span className="h-3.5 w-1 rounded-full bg-accent" />}
            <MessageSquare className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.8} />
            <span>Studio Chat</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('workflows')}
          className={`tactile-press flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium ${
            activeTab === 'workflows'
              ? 'bg-elevated text-ink font-semibold shadow-card'
              : 'text-ink-secondary hover:bg-subtle hover:text-ink'
          }`}
        >
          <span className="flex items-center gap-2.5">
            {activeTab === 'workflows' && <span className="h-3.5 w-1 rounded-full bg-accent" />}
            <Layers className="h-4 w-4 shrink-0" strokeWidth={1.8} />
            <span>Workflows</span>
          </span>
          <span className="tabular-nums rounded-full bg-subtle px-2 py-0.5 text-[11px] text-ink-muted">
            {workflowCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('superpowers')}
          className={`tactile-press flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium ${
            activeTab === 'superpowers'
              ? 'bg-elevated text-ink font-semibold shadow-card'
              : 'text-ink-secondary hover:bg-subtle hover:text-ink'
          }`}
        >
          <span className="flex items-center gap-2.5">
            {activeTab === 'superpowers' && <span className="h-3.5 w-1 rounded-full bg-accent" />}
            <Blocks className="h-4 w-4 shrink-0" strokeWidth={1.8} />
            <span>Superpowers</span>
          </span>
          <span className="tabular-nums rounded-full bg-trust-soft px-2 py-0.5 text-[11px] font-semibold text-trust">
            {activeSuperpowerCount} on
          </span>
        </button>
      </nav>

      {/* Recent Workspace Sessions */}
      <div className="flex-1 overflow-y-auto border-t border-hairline px-2.5 py-3">
        <div className="mb-2 px-2 text-[11px] font-semibold text-ink-muted">Recent Sessions</div>

        {conversations.length === 0 ? (
          <p className="px-2 py-3 text-xs leading-relaxed text-ink-muted">
            Chats stay private in SQLite on your PC and appear here.
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
                    className={`flex w-full items-center gap-2 truncate rounded-xl py-2 pl-2.5 pr-8 text-left text-xs transition-colors ${
                      isSelected
                        ? 'bg-elevated font-semibold text-ink shadow-card'
                        : 'font-medium text-ink-secondary hover:bg-subtle hover:text-ink'
                    }`}
                  >
                    {isSelected && <span className="h-3.5 w-1 shrink-0 rounded-full bg-accent" />}
                    <span className="truncate">{conv.title}</span>
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

      {/* Bottom Dock: AI Engines & Local Vault Status */}
      <div className="border-t border-hairline p-2.5">
        <button
          type="button"
          onClick={onOpenSettings}
          className="tactile-press flex w-full items-center justify-between rounded-xl border border-hairline bg-subtle px-3 py-2.5 text-left hover:bg-elevated"
        >
          <span className="flex items-center gap-2.5">
            <Cpu className="h-4 w-4 text-accent" strokeWidth={1.8} />
            <span>
              <span className="block text-xs font-semibold text-ink">AI Engines &amp; Keys</span>
              <span className="block text-[10px] text-ink-muted">Live models · Local Vault</span>
            </span>
          </span>
          <ShieldCheck className="h-4 w-4 text-trust" strokeWidth={1.8} />
        </button>
      </div>
    </aside>
  );
};
