import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Check, Pencil, Pin, Plus, Trash2, X } from 'lucide-react';
import type { MemoryCategory, MemoryItem, SaveMemoryInput } from '@shared/types';

interface MemoryDrawerProps {
  open: boolean;
  memories: MemoryItem[];
  autoMemoryEnabled: boolean;
  onClose: () => void;
  onSaveMemory: (input: SaveMemoryInput) => Promise<void>;
  onTogglePin: (id: string, pinned: boolean) => Promise<void>;
  onDeleteMemory: (id: string) => Promise<void>;
  onToggleAutoMemory: (enabled: boolean) => Promise<void>;
}

const CATEGORIES: MemoryCategory[] = ['About You', 'Preferences', 'Projects', 'Important'];

const NOTE_TINT_CLASSES: Record<MemoryItem['colorTag'], string> = {
  amber: 'bg-[#FFF9ED] dark:bg-[#241E14]',
  sage: 'bg-[#F1FAF5] dark:bg-[#14231C]',
  sky: 'bg-[#F2F7FD] dark:bg-[#151F2B]',
  rose: 'bg-[#FDF3F4] dark:bg-[#26171B]',
};

export const MemoryDrawer: React.FC<MemoryDrawerProps> = ({
  open,
  memories,
  autoMemoryEnabled,
  onClose,
  onSaveMemory,
  onTogglePin,
  onDeleteMemory,
  onToggleAutoMemory,
}) => {
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<MemoryCategory>('Preferences');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    await onSaveMemory({
      content: newContent.trim(),
      category: newCategory,
    });
    setNewContent('');
  };

  const beginEdit = (item: MemoryItem) => {
    setEditingId(item.id);
    setEditingText(item.content);
  };

  const commitEdit = async (item: MemoryItem) => {
    if (editingText.trim() && editingText.trim() !== item.content) {
      await onSaveMemory({
        id: item.id,
        content: editingText.trim(),
        category: item.category,
        colorTag: item.colorTag,
        pinned: item.pinned,
      });
    }
    setEditingId(null);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 16 }}
          transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
          aria-label="What AuraDesk Remembers About You"
          className="win12-island flex h-full w-80 shrink-0 flex-col overflow-hidden rounded-2xl xl:w-96"
        >
          <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <Brain className="h-4 w-4" strokeWidth={1.8} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-ink">What AuraDesk Remembers</h2>
                <p className="text-xs text-ink-muted">Stored privately on your computer</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Memory Board"
              className="tactile-press rounded-lg p-1.5 text-ink-muted hover:bg-subtle hover:text-ink"
            >
              <X className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </div>

          {/* Auto-learn toggle */}
          <div className="flex items-center justify-between border-b border-hairline bg-canvas px-5 py-2.5">
            <span className="text-xs font-medium text-ink-secondary">
              Learn helpful preferences automatically
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={autoMemoryEnabled}
              onClick={() => onToggleAutoMemory(!autoMemoryEnabled)}
              className={`tactile-press relative inline-flex h-5 w-9 shrink-0 items-center rounded-full ${
                autoMemoryEnabled ? 'bg-accent' : 'bg-strongline'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform duration-150 ${
                  autoMemoryEnabled ? 'translate-x-4' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Quick Add Sticky Note */}
          <form onSubmit={handleCreate} className="border-b border-hairline p-4">
            <label htmlFor="new-memory-input" className="sr-only">
              Add something for AuraDesk to remember
            </label>
            <textarea
              id="new-memory-input"
              rows={2}
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Add a note (e.g., Keep summaries under 5 bullet points)..."
              className="w-full resize-none rounded-xl border border-hairline bg-canvas px-3 py-2 text-xs leading-relaxed text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <select
                aria-label="Memory category"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as MemoryCategory)}
                className="rounded-lg border border-hairline bg-canvas px-2.5 py-1.5 text-xs text-ink-secondary"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={!newContent.trim()}
                className="tactile-press inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                Save Note
              </button>
            </div>
          </form>

          {/* Sticky Note Cards */}
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {memories.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-strongline p-6 text-center">
                <p className="text-sm font-medium text-ink">No saved memories yet</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
                  Mention your role, preferences, or projects in chat—or add a sticky note above—and it will appear right here under your control.
                </p>
              </div>
            ) : (
              memories.map((item) => {
                const isEditing = editingId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl border border-hairline p-3.5 shadow-card ${
                      NOTE_TINT_CLASSES[item.colorTag] || NOTE_TINT_CLASSES.amber
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="rounded-md bg-elevated px-2 py-0.5 text-[11px] font-medium text-ink-secondary">
                        {item.category}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onTogglePin(item.id, !item.pinned)}
                          aria-label={item.pinned ? 'Unpin memory' : 'Pin memory'}
                          title={item.pinned ? 'Pinned to top' : 'Pin note'}
                          className={`tactile-press rounded-md p-1 ${
                            item.pinned
                              ? 'bg-accent-soft text-accent'
                              : 'text-ink-muted hover:bg-surface hover:text-ink'
                          }`}
                        >
                          <Pin className="h-3.5 w-3.5" strokeWidth={1.8} />
                        </button>
                        <button
                          type="button"
                          onClick={() => beginEdit(item)}
                          aria-label="Edit memory"
                          className="tactile-press rounded-md p-1 text-ink-muted hover:bg-surface hover:text-ink"
                        >
                          <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteMemory(item.id)}
                          aria-label="Delete memory"
                          className="tactile-press rounded-md p-1 text-ink-muted hover:bg-danger-soft hover:text-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                        </button>
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea
                          rows={3}
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          className="w-full resize-none rounded-lg border border-strongline bg-surface p-2 text-xs text-ink focus:border-accent focus:outline-none"
                        />
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded-lg px-2.5 py-1 text-xs text-ink-secondary hover:bg-surface"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => commitEdit(item)}
                            className="tactile-press inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-xs font-semibold text-accent-ink"
                          >
                            <Check className="h-3 w-3" strokeWidth={2} />
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p
                        onClick={() => beginEdit(item)}
                        title="Click to edit"
                        className="cursor-pointer text-xs leading-relaxed text-ink"
                      >
                        {item.content}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};
