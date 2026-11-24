import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Blocks,
  Brain,
  FolderPlus,
  Layers,
  MessageSquarePlus,
  Moon,
  Search,
  Settings,
  Sun,
} from 'lucide-react';
import { ProviderBrandIcon } from './ProviderBrandIcon';
import { renderWorkflowIcon } from './WorkflowStudio';
import type { ProviderConfig, ProviderId, ThemeMode, WorkflowItem } from '@shared/types';

interface CommandPaletteProps {
  open: boolean;
  providers: ProviderConfig[];
  workflows: WorkflowItem[];
  theme: ThemeMode;
  onClose: () => void;
  onNewChat: () => void;
  onOpenSuperpowers: () => void;
  onOpenWorkflows: () => void;
  onOpenSettings: () => void;
  onToggleMemory: () => void;
  onToggleTheme: () => void;
  onPickFolder: () => Promise<void>;
  onSwitchProvider: (id: ProviderId) => Promise<void>;
  onRunWorkflow: (wf: WorkflowItem) => void;
}

interface ActionEntry {
  id: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  run: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  providers,
  workflows,
  theme,
  onClose,
  onNewChat,
  onOpenSuperpowers,
  onOpenWorkflows,
  onOpenSettings,
  onToggleMemory,
  onToggleTheme,
  onPickFolder,
  onSwitchProvider,
  onRunWorkflow,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const actions = useMemo<ActionEntry[]>(() => {
    const base: ActionEntry[] = [
      {
        id: 'new-chat',
        label: 'Start New Workspace Session',
        hint: 'Ctrl+N',
        icon: <MessageSquarePlus className="h-4 w-4 text-accent" strokeWidth={1.8} />,
        run: () => {
          onNewChat();
          onClose();
        },
      },
      {
        id: 'ai-settings',
        label: 'Connect or Switch AI Engines & API Keys',
        hint: 'Models',
        icon: <Settings className="h-4 w-4 text-accent" strokeWidth={1.8} />,
        run: () => {
          onOpenSettings();
          onClose();
        },
      },
      {
        id: 'share-folder',
        label: 'Share a Local Folder with AuraDesk',
        hint: 'Sandbox',
        icon: <FolderPlus className="h-4 w-4 text-trust" strokeWidth={1.8} />,
        run: () => {
          void onPickFolder();
          onClose();
        },
      },
      {
        id: 'open-superpowers',
        label: 'Open Superpowers & App Connectors',
        hint: 'Tools',
        icon: <Blocks className="h-4 w-4 text-ink-secondary" strokeWidth={1.8} />,
        run: () => {
          onOpenSuperpowers();
          onClose();
        },
      },
      {
        id: 'open-workflows',
        label: 'Browse 1-Click Workflow Studio',
        hint: 'Skills',
        icon: <Layers className="h-4 w-4 text-ink-secondary" strokeWidth={1.8} />,
        run: () => {
          onOpenWorkflows();
          onClose();
        },
      },
      {
        id: 'toggle-memory',
        label: 'Toggle Live Visual Memory Board',
        hint: 'Notes',
        icon: <Brain className="h-4 w-4 text-ink-secondary" strokeWidth={1.8} />,
        run: () => {
          onToggleMemory();
          onClose();
        },
      },
      {
        id: 'toggle-theme',
        label:
          theme === 'dark' ? 'Switch to Daylight Mica Theme' : 'Switch to Midnight Mica Theme',
        hint: 'Appearance',
        icon:
          theme === 'dark' ? (
            <Sun className="h-4 w-4 text-ink-secondary" strokeWidth={1.8} />
          ) : (
            <Moon className="h-4 w-4 text-ink-secondary" strokeWidth={1.8} />
          ),
        run: () => {
          onToggleTheme();
          onClose();
        },
      },
    ];

    const wfEntries: ActionEntry[] = workflows.map((wf) => ({
      id: `wf-${wf.id}`,
      label: `Run Workflow: ${wf.title}`,
      hint: wf.category,
      icon: renderWorkflowIcon(wf.iconName, 'h-4 w-4 text-accent'),
      run: () => {
        onRunWorkflow(wf);
        onClose();
      },
    }));

    const providerEntries: ActionEntry[] = providers
      .filter((p) => p.isVerified || p.id === 'demo')
      .map((p) => ({
        id: `prov-${p.id}`,
        label: `Switch Engine to ${p.displayName} (${p.selectedModel})`,
        hint: 'AI Engine',
        icon: <ProviderBrandIcon providerId={p.id} className="h-4 w-4 text-accent" />,
        run: () => {
          void onSwitchProvider(p.id);
          onClose();
        },
      }));

    return [...base, ...wfEntries, ...providerEntries];
  }, [
    onClose,
    onNewChat,
    onOpenSettings,
    onOpenSuperpowers,
    onOpenWorkflows,
    onPickFolder,
    onRunWorkflow,
    onSwitchProvider,
    onToggleMemory,
    onToggleTheme,
    providers,
    theme,
    workflows,
  ]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return actions;
    return actions.filter(
      (a) => a.label.toLowerCase().includes(q) || a.hint.toLowerCase().includes(q)
    );
  }, [actions, query]);

  if (!open) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => (filtered.length === 0 ? 0 : (i + 1) % filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) =>
        filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length
      );
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault();
      filtered[selectedIndex].run();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Quick Command Launcher"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/35 pt-20 backdrop-blur-xs"
    >
      {/* Instant open with zero entrance animation for high-frequency keyboard action */}
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-strongline bg-elevated shadow-modal"
      >
        <div className="flex items-center gap-3 border-b border-hairline px-4 py-3.5">
          <Search className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.9} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a workflow, superpower, or AI engine..."
            className="w-full bg-transparent text-sm text-ink placeholder:text-ink-muted focus:outline-none"
          />
          <kbd className="rounded bg-subtle px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
            ESC
          </kbd>
        </div>

        <ul className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <li className="px-4 py-6 text-center text-xs text-ink-muted">
              No matching commands found.
            </li>
          ) : (
            filtered.map((item, idx) => {
              const active = idx === selectedIndex;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={item.run}
                    className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-xs ${
                      active ? 'bg-accent-soft text-ink font-semibold' : 'text-ink-secondary'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      {item.icon}
                      <span>{item.label}</span>
                    </span>
                    <span className="text-[11px] text-ink-muted">{item.hint}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
};
