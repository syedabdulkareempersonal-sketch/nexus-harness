import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  ArrowUp,
  Brain,
  CheckCircle2,
  FileText,
  FolderPlus,
  Loader2,
  PanelRightOpen,
  Paperclip,
  ShieldX,
  Square,
  X,
} from 'lucide-react';
import { SafetyApprovalCard } from './SafetyApprovalCard';
import { renderWorkflowIcon } from './WorkflowStudio';
import { renderSafeMarkdown } from '../lib/markdown';
import type {
  AllowedFolder,
  ArtifactItem,
  ChatMessage,
  FileAttachment,
  PendingSafetyRequest,
  ProviderConfig,
  ProviderId,
  SafetyDecision,
  WorkflowItem,
} from '@shared/types';

interface ChatWorkspaceProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  errorBanner: string | null;
  providers: ProviderConfig[];
  activeProviderId: ProviderId;
  allowedFolders: AllowedFolder[];
  workflows: WorkflowItem[];
  memoriesCount: number;
  memoryOpen: boolean;
  canvasOpen: boolean;
  conversationArtifacts: ArtifactItem[];
  pendingSafetyRequests: PendingSafetyRequest[];
  prefillPrompt: string;
  onClearPrefill: () => void;
  onSendMessage: (content: string, attachments: FileAttachment[]) => Promise<void>;
  onStopGeneration: () => Promise<void>;
  onSelectProvider: (providerId: ProviderId, model?: string) => Promise<void>;
  onPickDocuments: () => Promise<FileAttachment[]>;
  onDropFile: (file: File) => Promise<FileAttachment>;
  onPickFolder: () => Promise<void>;
  onToggleMemory: () => void;
  onOpenArtifact: (artifact: ArtifactItem) => void;
  onResolveSafety: (requestId: string, decision: SafetyDecision) => Promise<void>;
  onDismissError: () => void;
}

export const ChatWorkspace: React.FC<ChatWorkspaceProps> = ({
  messages,
  isStreaming,
  errorBanner,
  providers,
  activeProviderId,
  allowedFolders,
  workflows,
  memoriesCount,
  memoryOpen,
  canvasOpen,
  conversationArtifacts,
  pendingSafetyRequests,
  prefillPrompt,
  onClearPrefill,
  onSendMessage,
  onStopGeneration,
  onSelectProvider,
  onPickDocuments,
  onDropFile,
  onPickFolder,
  onToggleMemory,
  onOpenArtifact,
  onResolveSafety,
  onDismissError,
}) => {
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [parsingFiles, setParsingFiles] = useState(false);

  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (prefillPrompt) {
      setDraft(prefillPrompt);
      onClearPrefill();
      setTimeout(() => textareaRef.current?.focus(), 30);
    }
  }, [prefillPrompt, onClearPrefill]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingSafetyRequests.length]);

  const activeProvider =
    providers.find((p) => p.id === activeProviderId) ?? providers[0];

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!draft.trim() && attachments.length === 0) || isStreaming) return;
    const textToSend =
      draft.trim() ||
      `Please summarize and extract the key insights from ${attachments.map((a) => a.name).join(', ')}.`;
    const attachedCopy = [...attachments];
    setDraft('');
    setAttachments([]);
    await onSendMessage(textToSend, attachedCopy);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleAttachClick = async () => {
    setParsingFiles(true);
    try {
      const picked = await onPickDocuments();
      if (picked.length > 0) {
        setAttachments((prev) => [...prev, ...picked]);
      }
    } finally {
      setParsingFiles(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const files = Array.from(e.dataTransfer.files || []).slice(0, 5);
    if (files.length === 0) return;

    setParsingFiles(true);
    try {
      const parsed: FileAttachment[] = [];
      for (const file of files) {
        const att = await onDropFile(file);
        parsed.push(att);
      }
      setAttachments((prev) => [...prev, ...parsed]);
    } finally {
      setParsingFiles(false);
    }
  };

  return (
    <main
      onDragOver={(e) => {
        e.preventDefault();
        if (!isDraggingOver) setIsDraggingOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setIsDraggingOver(false);
      }}
      onDrop={handleDrop}
      className="relative flex h-full min-w-0 flex-1 flex-col bg-canvas"
    >
      {/* Drag & Drop Overlay */}
      {isDraggingOver && (
        <div className="pointer-events-none absolute inset-4 z-30 flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-accent bg-accent-soft/85 backdrop-blur-sm">
          <FileText className="h-9 w-9 text-accent" strokeWidth={1.8} />
          <p className="mt-2 text-base font-semibold text-ink">
            Drop PDFs, Word docs, or CSV spreadsheets here
          </p>
          <p className="text-xs text-ink-secondary">
            AuraDesk reads them privately on your computer
          </p>
        </div>
      )}

      {/* Top Workspace Bar */}
      <header className="flex items-center justify-between gap-3 border-b border-hairline bg-canvas/90 px-6 py-3 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="header-provider-select" className="sr-only">
            Active AI Model
          </label>
          <select
            id="header-provider-select"
            value={activeProviderId}
            onChange={(e) => onSelectProvider(e.target.value as ProviderId)}
            className="rounded-xl border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold text-ink shadow-card"
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName} · {p.selectedModel}
              </option>
            ))}
          </select>

          {activeProvider && activeProvider.availableModels.length > 1 && (
            <select
              aria-label="Switch model variant"
              value={activeProvider.selectedModel}
              onChange={(e) => onSelectProvider(activeProvider.id, e.target.value)}
              className="hidden rounded-xl border border-hairline bg-surface px-2.5 py-1.5 text-xs text-ink-secondary sm:inline-block"
            >
              {activeProvider.availableModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-2">
          {conversationArtifacts.length > 0 && !canvasOpen && (
            <button
              type="button"
              onClick={() => onOpenArtifact(conversationArtifacts[0])}
              className="tactile-press inline-flex items-center gap-1.5 rounded-xl border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold text-ink shadow-card hover:bg-subtle"
            >
              <PanelRightOpen className="h-3.5 w-3.5 text-accent" strokeWidth={1.8} />
              Canvas ({conversationArtifacts.length})
            </button>
          )}

          <button
            type="button"
            onClick={onToggleMemory}
            aria-pressed={memoryOpen}
            className={`tactile-press inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold ${
              memoryOpen
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-hairline bg-surface text-ink shadow-card hover:bg-subtle'
            }`}
          >
            <Brain className="h-3.5 w-3.5" strokeWidth={1.8} />
            Memory
            <span className="tabular-nums rounded-full bg-subtle px-1.5 py-0.2 text-[11px] text-ink-secondary">
              {memoriesCount}
            </span>
          </button>
        </div>
      </header>

      {/* Main Scrollable Thread or Welcome Studio */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        {messages.length === 0 ? (
          <div className="mx-auto flex max-w-3xl flex-col justify-center py-6">
            <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              What can I take off your desk today?
            </h1>
            <p className="mt-2.5 max-w-[62ch] text-sm leading-relaxed text-ink-secondary">
              Drop a PDF or spreadsheet, tidy up a folder with plain-English safety checks, or pick a 1-click workflow below.
            </p>

            {/* Starter 1-Click Workflow Grid */}
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {workflows.slice(0, 4).map((wf) => (
                <button
                  key={wf.id}
                  type="button"
                  onClick={() => {
                    setDraft(wf.promptTemplate);
                    textareaRef.current?.focus();
                  }}
                  className="tactile-press group flex items-start gap-3.5 rounded-2xl border border-hairline bg-surface p-4 text-left shadow-card hover:border-strongline"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                    {renderWorkflowIcon(wf.iconName, 'h-4 w-4')}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-ink">{wf.title}</h2>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-secondary">
                      {wf.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              const linkedArtifacts = conversationArtifacts.filter((a) =>
                msg.artifactIds.includes(a.id)
              );

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  {/* Attached Documents on User Message */}
                  {msg.attachments.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {msg.attachments.map((att) => (
                        <div
                          key={att.id}
                          className="inline-flex items-center gap-2 rounded-xl border border-hairline bg-surface px-3 py-1.5 text-xs shadow-card"
                        >
                          <FileText className="h-3.5 w-3.5 text-accent" strokeWidth={1.8} />
                          <span className="font-medium text-ink">{att.name}</span>
                          <span className="text-ink-muted">{att.summaryPreview}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Plain-English Live Tool Activities */}
                  {!isUser && msg.toolActivities.length > 0 && (
                    <div className="mb-2.5 flex flex-wrap gap-2">
                      {msg.toolActivities.map((act) => (
                        <div
                          key={act.id}
                          className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface px-3 py-1 text-xs text-ink-secondary shadow-card"
                        >
                          {act.status === 'running' ? (
                            <Loader2
                              className="h-3.5 w-3.5 animate-spin text-accent"
                              strokeWidth={2}
                            />
                          ) : act.status === 'completed' ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-trust" strokeWidth={1.9} />
                          ) : (
                            <ShieldX className="h-3.5 w-3.5 text-warn" strokeWidth={1.9} />
                          )}
                          <span>{act.friendlyLabel}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Message Content */}
                  {isUser ? (
                    <div className="max-w-[82%] rounded-2xl bg-subtle px-4 py-3 text-sm leading-relaxed text-ink">
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  ) : (
                    <div className="w-full rounded-2xl border border-hairline bg-surface px-5 py-4 shadow-card">
                      {msg.content ? (
                        <div
                          className="prose-aura"
                          dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(msg.content) }}
                        />
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-ink-muted">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                          Thinking...
                        </div>
                      )}

                      {/* Linked Canvas Artifacts */}
                      {linkedArtifacts.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2 border-t border-hairline pt-3">
                          {linkedArtifacts.map((art) => (
                            <button
                              key={art.id}
                              type="button"
                              onClick={() => onOpenArtifact(art)}
                              className="tactile-press inline-flex items-center gap-2 rounded-xl border border-strongline bg-canvas px-3.5 py-2 text-xs font-semibold text-ink hover:border-accent hover:bg-accent-soft"
                            >
                              <PanelRightOpen className="h-3.5 w-3.5 text-accent" strokeWidth={1.8} />
                              Open in Canvas: {art.title}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {errorBanner && (
              <div
                role="alert"
                className="flex items-center justify-between gap-3 rounded-2xl border border-hairline bg-warn-soft px-4 py-3 text-xs font-medium text-warn"
              >
                <span>{errorBanner}</span>
                <button
                  type="button"
                  onClick={onDismissError}
                  aria-label="Dismiss message"
                  className="rounded-lg p-1 hover:bg-black/5"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.8} />
                </button>
              </div>
            )}

            <div ref={threadEndRef} />
          </div>
        )}
      </div>

      {/* Plain-English Safety & Trust Guardrail Queue */}
      <AnimatePresence>
        {pendingSafetyRequests.map((req) => (
          <div key={req.requestId} className="px-6">
            <SafetyApprovalCard request={req} onDecide={onResolveSafety} />
          </div>
        ))}
      </AnimatePresence>

      {/* Bottom Composer */}
      <div className="border-t border-hairline bg-canvas px-6 py-4">
        <form
          onSubmit={handleSend}
          className="mx-auto max-w-3xl rounded-2xl border border-strongline bg-surface p-3 shadow-card focus-within:border-accent"
        >
          {/* Pending Document Attachments */}
          {(attachments.length > 0 || parsingFiles) && (
            <div className="mb-2.5 flex flex-wrap items-center gap-2 border-b border-hairline pb-2.5">
              {attachments.map((att) => (
                <span
                  key={att.id}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-subtle px-2.5 py-1 text-xs font-medium text-ink"
                >
                  <FileText className="h-3.5 w-3.5 text-accent" strokeWidth={1.8} />
                  {att.name}
                  <span className="text-ink-muted">({att.summaryPreview})</span>
                  <button
                    type="button"
                    aria-label={`Remove ${att.name}`}
                    onClick={() =>
                      setAttachments((prev) => prev.filter((item) => item.id !== att.id))
                    }
                    className="ml-0.5 rounded p-0.5 text-ink-muted hover:text-ink"
                  >
                    <X className="h-3 w-3" strokeWidth={2} />
                  </button>
                </span>
              ))}
              {parsingFiles && (
                <span className="inline-flex items-center gap-1.5 text-xs text-ink-secondary">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                  Reading document...
                </span>
              )}
            </div>
          )}

          <label htmlFor="chat-composer" className="sr-only">
            Ask AuraDesk anything
          </label>
          <textarea
            id="chat-composer"
            ref={textareaRef}
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything, drop a PDF or CSV, or ask to organize a shared folder..."
            className="w-full resize-none bg-transparent px-1.5 py-1 text-sm leading-relaxed text-ink placeholder:text-ink-muted focus:outline-none"
          />

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleAttachClick}
                className="tactile-press inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-subtle hover:text-ink"
              >
                <Paperclip className="h-3.5 w-3.5" strokeWidth={1.8} />
                Attach PDF / Doc / CSV
              </button>

              <button
                type="button"
                onClick={onPickFolder}
                className="tactile-press inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-subtle hover:text-ink"
              >
                <FolderPlus className="h-3.5 w-3.5" strokeWidth={1.8} />
                {allowedFolders.length > 0
                  ? `${allowedFolders.length} Shared Folder${allowedFolders.length === 1 ? '' : 's'}`
                  : 'Share Folder'}
              </button>
            </div>

            {isStreaming ? (
              <button
                type="button"
                onClick={onStopGeneration}
                className="tactile-press inline-flex items-center gap-1.5 rounded-xl bg-ink px-3.5 py-2 text-xs font-semibold text-canvas"
              >
                <Square className="h-3 w-3 fill-current" />
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!draft.trim() && attachments.length === 0}
                aria-label="Send message"
                className="tactile-press inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-ink hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                Send
                <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.1} />
              </button>
            )}
          </div>
        </form>
      </div>
    </main>
  );
};
