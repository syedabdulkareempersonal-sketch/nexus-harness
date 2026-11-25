import React, { useState } from 'react';
import {
  ArrowUpRight,
  FileCheck2,
  FolderKanban,
  Globe,
  PenLine,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { SaveWorkflowInput, WorkflowItem } from '@shared/types';

interface WorkflowStudioProps {
  workflows: WorkflowItem[];
  onRunWorkflow: (workflow: WorkflowItem) => void;
  onSaveWorkflow: (input: SaveWorkflowInput) => Promise<void>;
  onDeleteWorkflow: (id: string) => Promise<void>;
}

export function renderWorkflowIcon(iconName: string, className = 'h-5 w-5') {
  switch (iconName) {
    case 'FolderKanban':
      return <FolderKanban className={className} strokeWidth={1.8} />;
    case 'Globe':
      return <Globe className={className} strokeWidth={1.8} />;
    case 'FileCheck2':
      return <FileCheck2 className={className} strokeWidth={1.8} />;
    case 'PenLine':
      return <PenLine className={className} strokeWidth={1.8} />;
    default:
      return <Sparkles className={className} strokeWidth={1.8} />;
  }
}

export const WorkflowStudio: React.FC<WorkflowStudioProps> = ({
  workflows,
  onRunWorkflow,
  onSaveWorkflow,
  onDeleteWorkflow,
}) => {
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Personal Routine');
  const [iconName, setIconName] = useState('Sparkles');
  const [promptTemplate, setPromptTemplate] = useState('');
  const [outputArtifactHint, setOutputArtifactHint] = useState('Canvas Summary');
  const [selectedTools, setSelectedTools] = useState<string[]>([]);

  const toggleTool = (toolKey: string) => {
    setSelectedTools((prev) =>
      prev.includes(toolKey) ? prev.filter((k) => k !== toolKey) : [...prev, toolKey]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !promptTemplate.trim()) return;

    await onSaveWorkflow({
      title: title.trim(),
      description: description.trim() || 'Reusable 1-click workflow',
      iconName,
      category,
      promptTemplate: promptTemplate.trim(),
      requiredTools: selectedTools,
      outputArtifactHint: outputArtifactHint.trim() || null,
    });

    setTitle('');
    setDescription('');
    setPromptTemplate('');
    setSelectedTools([]);
    setCreating(false);
  };

  return (
    <div className="win12-island h-full flex-1 overflow-y-auto rounded-2xl px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-ink">Quick Tasks</h1>
            <p className="mt-1.5 max-w-[65ch] text-sm leading-relaxed text-ink-secondary">
              Start everyday tasks in one click—or save your own favorite instructions as a reusable shortcut.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            className="tactile-press inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-xs font-semibold text-accent-ink hover:bg-accent-hover"
          >
            {creating ? (
              <>
                <X className="h-3.5 w-3.5" strokeWidth={2} />
                Close
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                Create My Own Task
              </>
            )}
          </button>
        </div>

        {creating && (
          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-2xl border border-strongline bg-surface p-6 shadow-float"
          >
            <h2 className="text-base font-semibold text-ink">Save a Reusable Workflow</h2>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label htmlFor="wf-title" className="mb-1 block text-xs font-medium text-ink">
                  Workflow Title *
                </label>
                <input
                  id="wf-title"
                  required
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Weekly Expense Receipt Summary"
                  className="w-full rounded-xl border border-hairline bg-canvas px-3.5 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="wf-icon" className="mb-1 block text-xs font-medium text-ink">
                  Symbol
                </label>
                <select
                  id="wf-icon"
                  value={iconName}
                  onChange={(e) => setIconName(e.target.value)}
                  className="w-full rounded-xl border border-hairline bg-canvas px-3 py-2 text-sm text-ink"
                >
                  <option value="Sparkles">Sparkles</option>
                  <option value="FolderKanban">Folder Organizer</option>
                  <option value="Globe">Web Research</option>
                  <option value="FileCheck2">Document Brief</option>
                  <option value="PenLine">Writing Studio</option>
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="wf-desc" className="mb-1 block text-xs font-medium text-ink">
                  Short Summary
                </label>
                <input
                  id="wf-desc"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What this workflow produces for you"
                  className="w-full rounded-xl border border-hairline bg-canvas px-3.5 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="wf-output" className="mb-1 block text-xs font-medium text-ink">
                  Canvas Output Style
                </label>
                <input
                  id="wf-output"
                  type="text"
                  value={outputArtifactHint}
                  onChange={(e) => setOutputArtifactHint(e.target.value)}
                  placeholder="e.g., Clean Markdown Table"
                  className="w-full rounded-xl border border-hairline bg-canvas px-3.5 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="wf-prompt" className="mb-1 block text-xs font-medium text-ink">
                Step-by-step instructions in plain English *
              </label>
              <textarea
                id="wf-prompt"
                required
                rows={4}
                value={promptTemplate}
                onChange={(e) => setPromptTemplate(e.target.value)}
                placeholder="Tell AuraDesk what to read, how to organize the findings, and what to open in the Canvas..."
                className="w-full resize-none rounded-xl border border-hairline bg-canvas p-3.5 text-sm leading-relaxed text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
              />
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-medium text-ink">
                Superpowers this workflow uses:
              </span>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'smartFolders', label: 'Smart Folder Assistant' },
                  { key: 'webResearch', label: 'Live Web Research' },
                  { key: 'documentAnalyst', label: 'Document & PDF Analyst' },
                ].map((t) => {
                  const active = selectedTools.includes(t.key);
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => toggleTool(t.key)}
                      className={`tactile-press rounded-full border px-3 py-1 text-xs font-medium ${
                        active
                          ? 'border-accent bg-accent-soft text-accent'
                          : 'border-hairline bg-canvas text-ink-secondary'
                      }`}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="rounded-xl px-4 py-2 text-xs font-medium text-ink-secondary hover:bg-subtle"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="tactile-press rounded-xl bg-accent px-5 py-2 text-xs font-semibold text-accent-ink hover:bg-accent-hover"
              >
                Save Workflow
              </button>
            </div>
          </form>
        )}

        {/* Workflow List */}
        <div className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-surface shadow-card">
          {workflows.map((wf) => (
            <div
              key={wf.id}
              className="flex flex-col justify-between gap-4 p-6 transition-colors hover:bg-elevated sm:flex-row sm:items-center"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  {renderWorkflowIcon(wf.iconName)}
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-ink">{wf.title}</h3>
                    {wf.outputArtifactHint && (
                      <span className="rounded-full bg-subtle px-2.5 py-0.5 text-[11px] font-medium text-ink-secondary">
                        Opens: {wf.outputArtifactHint}
                      </span>
                    )}
                  </div>
                  <p className="max-w-[60ch] text-xs leading-relaxed text-ink-secondary">
                    {wf.description}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {!wf.isBuiltin && (
                  <button
                    type="button"
                    onClick={() => onDeleteWorkflow(wf.id)}
                    aria-label={`Delete ${wf.title}`}
                    className="tactile-press rounded-xl p-2 text-ink-muted hover:bg-danger-soft hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.8} />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onRunWorkflow(wf)}
                  className="tactile-press inline-flex items-center gap-1.5 rounded-xl border border-strongline bg-canvas px-4 py-2 text-xs font-semibold text-ink hover:border-accent hover:bg-accent hover:text-accent-ink"
                >
                  Start Task
                  <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.9} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
