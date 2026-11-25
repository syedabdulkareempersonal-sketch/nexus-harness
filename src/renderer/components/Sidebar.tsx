import React from 'react';
import {
  FolderOpen,
  MessageSquare,
  Plus,
  Settings,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { PROVIDER_META } from './ProviderBrandIcon';
import type { ConversationSummary, ProviderConfig } from '@shared/types';

export type NavTab = 'chat' | 'workflows' | 'superpowers';

interface SidebarProps {
  activeTab: NavTab;
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  activeProvider?: ProviderConfig;
  sharedFolderCount: number;
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
  activeProvider,
  sharedFolderCount,
  onSelectTab,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onOpenSettings,
}) => {
  const activeName = activeProvider
    ? PROVIDER_META[activeProvider.id].shortName
    : 'Practice Mode';

  return (
    <aside
      aria-label="Workspace Navigation"
      className="win12-island flex h-full w-60 shrink-0 flex-col rounded-2xl select-none"
    >
      {/* Simple, Friendly New Chat Button */}
      <div className="p-3 pb-2">
        <button
          type="button"
          onClick={onNewChat}
          className="tactile-press flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink shadow-card hover:bg-accent-hover"
        >
          <Plus className="h-4 w-4" strokeWidth={2.2} />
          New Chat
        </button>
      </div>

      {/* Simple Everyday Navigation */}
      <nav aria-label="Main Menu" className="space-y-1 px-2.5 pb-3">
        <button
          type="button"
          onClick={() => onSelectTab('chat')}
          className={`tactile-press flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs ${
            activeTab === 'chat'
              ? 'bg-elevated font-semibold text-ink shadow-card'
              : 'font-medium text-ink-secondary hover:bg-subtle hover:text-ink'
          }`}
        >
          {activeTab === 'chat' && <span className="h-4 w-1 rounded-full bg-accent" />}
          <MessageSquare className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.8} />
          <span>Chat</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('workflows')}
          className={`tactile-press flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs ${
            activeTab === 'workflows'
              ? 'bg-elevated font-semibold text-ink shadow-card'
              : 'font-medium text-ink-secondary hover:bg-subtle hover:text-ink'
          }`}
        >
          {activeTab === 'workflows' && <span className="h-4 w-1 rounded-full bg-accent" />}
          <Sparkles className="h-4 w-4 shrink-0" strokeWidth={1.8} />
          <span>Quick Tasks</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('superpowers')}
          className={`tactile-press flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs ${
            activeTab === 'superpowers'
              ? 'bg-elevated font-semibold text-ink shadow-card'
              : 'font-medium text-ink-secondary hover:bg-subtle hover:text-ink'
          }`}
        >
          <span className="flex items-center gap-2.5">
            {activeTab === 'superpowers' && <span className="h-4 w-1 rounded-full bg-accent" />}
            <FolderOpen className="h-4 w-4 shrink-0" strokeWidth={1.8} />
            <span>Tools &amp; Folders</span>
          </span>
          {sharedFolderCount > 0 && (
            <span className="tabular-nums rounded-full bg-subtle px-2 py-0.5 text-[11px] text-ink-secondary">
              {sharedFolderCount}
            </span>
          )}
        </button>
      </nav>

      {/* Past Chats */}
      <div className="flex-1 overflow-y-auto border-t border-hairline px-2.5 py-3">
        <div className="mb-2 px-2 text-[11px] font-semibold text-ink-muted">Past Chats</div>

        {conversations.length === 0 ? (
          <p className="px-2 py-2 text-xs leading-relaxed text-ink-muted">
            Your chats will show up here.
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
                    className={`flex w-full items-center gap-2 truncate rounded-xl py-2 pl-2.5 pr-8 text-left text-xs ${
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
                    aria-label={`Delete chat ${conv.title}`}
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

      {/* Simple Bottom AI Setup Button */}
      <div className="border-t border-hairline p-2.5">
        <button
          type="button"
          onClick={onOpenSettings}
          className="tactile-press flex w-full items-center gap-2.5 rounded-xl border border-hairline bg-subtle px-3 py-2.5 text-left hover:bg-elevated"
        >
          <Settings className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.8} />
          <div className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-ink">AI Setup</span>
            <span className="block truncate text-[11px] text-ink-muted">{activeName}</span>
          </div>
        </button>
      </div>
    </aside>
  );
};
