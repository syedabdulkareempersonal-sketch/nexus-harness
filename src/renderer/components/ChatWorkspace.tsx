import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUp,
  CheckCircle2,
  FileText,
  FolderOpen,
  Loader2,
  PanelRightOpen,
  Paperclip,
  ShieldAlert,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import { desktopApi } from '../lib/bridge';
import { renderSafeMarkdown } from '../lib/markdown';
import { PROVIDER_META, ProviderBrandIcon } from './ProviderBrandIcon';
import { SafetyApprovalCard } from './SafetyApprovalCard';
import { renderWorkflowIcon } from './WorkflowStudio';
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
  artifactsForConversation: ArtifactItem[];
  pendingSafety: PendingSafetyRequest | null;
  draftInput: string;
  onDraftInputChange: (val: string) => void;
  onSend: (text: string, attachments: FileAttachment[]) => Promise<void>;
  onStop: () => Promise<void>;
  onResolveSafety: (requestId: string, decision: SafetyDecision) => Promise<void>;
  onSwitchProvider: (providerId: ProviderId, model?: string) => Promise<void>;
  onOpenSettings: () => void;
  onPickFolder: () => Promise<void>;
  onOpenArtifact: (artifact: ArtifactItem) => void;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export const ChatWorkspace: React.FC<ChatWorkspaceProps> = ({
  messages,
  isStreaming,
  errorBanner,
  providers,
  activeProviderId,
  allowedFolders,
  workflows,
  artifactsForConversation,
  pendingSafety,
  draftInput,
  onDraftInputChange,
  onSend,
  onStop,
  onResolveSafety,
  onSwitchProvider,
  onOpenSettings,
  onPickFolder,
  onOpenArtifact,
}) => {
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [parsingFiles, setParsingFiles] = useState(false);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingSafety]);

  const activeProvider =
    providers.find((p) => p.id === activeProviderId) ?? providers[0];
  const activeMeta = PROVIDER_META[activeProviderId];

  const handleAttachClick = async () => {
    setParsingFiles(true);
    try {
      const picked = await desktopApi.pickAndParseDocuments();
      if (picked.length > 0) {
        setAttachments((prev) => [...prev, ...picked]);
      }
    } finally {
      setParsingFiles(false);
    }
  };

  const handleDropFiles = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const files = Array.from(e.dataTransfer.files || []).slice(0, 5);
    if (files.length === 0) return;

    setParsingFiles(true);
    try {
      const parsedItems: FileAttachment[] = [];
      for (const file of files) {
        const ab = await file.arrayBuffer();
        const base64Data = arrayBufferToBase64(ab);
        const parsed = await desktopApi.parseDroppedDocument({
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          base64Data,
        });
        parsedItems.push(parsed);
      }
      setAttachments((prev) => [...prev, ...parsedItems]);
    } finally {
      setParsingFiles(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isStreaming) return;
    if (!draftInput.trim() && attachments.length === 0) return;
    const textToSend =
      draftInput.trim() ||
      `Please analyze ${attachments.map((a) => `"${a.name}"`).join(', ')} and summarize the key points.`;
    const currentAttachments = [...attachments];
    onDraftInputChange('');
    setAttachments([]);
    await onSend(textToSend, currentAttachments);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <main
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setIsDraggingOver(false);
      }}
      onDrop={handleDropFiles}
      className="win12-island relative flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-2xl"
    >
      {/* Drag-and-Drop Document Overlay */}
      {isDraggingOver && (
        <div className="pointer-events-none absolute inset-3 z-30 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-accent-soft backdrop-blur-sm">
          <FileText className="h-9 w-9 text-accent" strokeWidth={1.8} />
          <p className="mt-2 text-base font-semibold text-ink">
            Drop PDFs, Word docs, or CSV spreadsheets to analyze
          </p>
          <p className="text-xs text-ink-secondary">
            Processed 100% locally on your Windows PC
          </p>
        </div>
      )}

      {/* Main Message Stream or Windows 12 Pro Welcome Studio */}
      <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-8">
        {messages.length === 0 ? (
          <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center py-4">
            <h1 className="text-3xl font-semibold text-ink">
              What can I take off your plate today?
            </h1>
            <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-ink-secondary">
              Drop a document, research the live web, or launch a 1-click workflow below. Every file action pauses with a plain-English card for your approval.
            </p>

            {/* Quick Engine Status Bar inside Empty Studio */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-hairline bg-subtle px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-lg ${activeMeta.badgeClass}`}
                >
                  <ProviderBrandIcon providerId={activeProviderId} className="h-4 w-4" />
                </span>
                <div className="text-xs">
                  <span className="font-semibold text-ink">{activeProvider?.displayName}</span>
                  <span className="text-ink-muted"> · {activeProvider?.selectedModel}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={onOpenSettings}
                className="tactile-press rounded-lg border border-hairline bg-elevated px-3 py-1.5 text-xs font-semibold text-accent hover:bg-subtle"
              >
                {activeProvider?.isVerified ? 'Switch Engine / Model' : 'Connect API Key'}
              </button>
            </div>

            {/* Starter Workflows Grid */}
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {workflows.slice(0, 4).map((wf) => (
                <button
                  key={wf.id}
                  type="button"
                  onClick={() => {
                    onDraftInputChange(wf.promptTemplate);
                    textareaRef.current?.focus();
                  }}
                  className="tactile-press group flex items-start gap-3.5 rounded-2xl border border-hairline bg-elevated p-4 text-left shadow-card hover:border-strongline"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                    {renderWorkflowIcon(wf.iconName, 'h-4 w-4')}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink">{wf.title}</div>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink-secondary">
                      {wf.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-6 pb-4">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  {/* Attached files on user message */}
                  {msg.attachments.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {msg.attachments.map((att) => (
                        <span
                          key={att.id}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-hairline bg-elevated px-3 py-1.5 text-xs font-medium text-ink shadow-card"
                        >
                          <FileText className="h-3.5 w-3.5 text-accent" strokeWidth={1.8} />
                          <span>{att.name}</span>
                          <span className="text-ink-muted">({att.summaryPreview})</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Plain-English Live Tool Activity Pills */}
                  {!isUser && msg.toolActivities.length > 0 && (
                    <div className="mb-2.5 flex flex-wrap gap-1.5">
                      {msg.toolActivities.map((act) => (
                        <div
                          key={act.id}
                          className="inline-flex items-center gap-2 rounded-full border border-hairline bg-elevated px-3 py-1 text-xs text-ink-secondary shadow-card"
                        >
                          {act.status === 'running' ? (
                            <Loader2
                              className="h-3.5 w-3.5 animate-spin text-accent"
                              strokeWidth={2}
                            />
                          ) : act.status === 'completed' ? (
                            <CheckCircle2
                              className="h-3.5 w-3.5 text-trust"
                              strokeWidth={1.9}
                            />
                          ) : (
                            <ShieldAlert
                              className="h-3.5 w-3.5 text-warn"
                              strokeWidth={1.9}
                            />
                          )}
                          <span>{act.friendlyLabel}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {isUser ? (
                    <div className="max-w-[85%] rounded-2xl bg-accent px-4 py-3 text-sm leading-relaxed text-accent-ink shadow-card">
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  ) : (
                    <div className="w-full rounded-2xl border border-hairline bg-elevated px-5 py-4 shadow-card">
                      {msg.content ? (
                        <div
                          className="prose-aura"
                          dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(msg.content) }}
                        />
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-ink-muted">
                          <Sparkles className="h-3.5 w-3.5 animate-pulse text-accent" />
                          Working on your request...
                        </div>
                      )}

                      {/* Linked Canvas Artifact Buttons */}
                      {msg.artifactIds.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2 border-t border-hairline pt-3">
                          {msg.artifactIds.map((artId) => {
                            const found = artifactsForConversation.find((a) => a.id === artId);
                            if (!found) return null;
                            return (
                              <button
                                key={artId}
                                type="button"
                                onClick={() => onOpenArtifact(found)}
                                className="tactile-press inline-flex items-center gap-2 rounded-xl border border-strongline bg-subtle px-3.5 py-2 text-xs font-semibold text-ink hover:border-accent hover:text-accent"
                              >
                                <PanelRightOpen className="h-3.5 w-3.5 text-accent" strokeWidth={1.8} />
                                Open &ldquo;{found.title}&rdquo; in Canvas
                              </button>
                            );
                          })}
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
                className="flex items-start justify-between gap-3 rounded-2xl border border-hairline bg-warn-soft px-4 py-3 text-xs leading-relaxed text-warn"
              >
                <span className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} />
                  <span>{errorBanner}</span>
                </span>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="shrink-0 rounded-lg bg-elevated px-2.5 py-1 font-semibold text-ink shadow-card"
                >
                  Open AI Engines
                </button>
              </div>
            )}

            <div ref={scrollEndRef} />
          </div>
        )}
      </div>

      {/* Calm Plain-English Safety Guardrail Card */}
      <div className="px-5">
        {pendingSafety && (
          <SafetyApprovalCard request={pendingSafety} onDecide={onResolveSafety} />
        )}
      </div>

      {/* Windows 12 Pro Floating Acrylic Composer */}
      <div className="shrink-0 px-5 pb-4 pt-1 sm:px-8">
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-2xl rounded-2xl border border-strongline bg-elevated p-3 shadow-card focus-within:border-accent"
        >
          {/* Pending Document Attachments */}
          {attachments.length > 0 && (
            <div className="mb-2.5 flex flex-wrap gap-2 border-b border-hairline pb-2.5">
              {attachments.map((att) => (
                <span
                  key={att.id}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-subtle px-3 py-1 text-xs font-medium text-ink"
                >
                  <FileText className="h-3.5 w-3.5 text-accent" strokeWidth={1.8} />
                  <span className="max-w-[180px] truncate">{att.name}</span>
                  <span className="text-ink-muted">· {att.summaryPreview}</span>
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
            </div>
          )}

          <label htmlFor="chat-composer-input" className="sr-only">
            Ask AuraDesk anything
          </label>
          <textarea
            id="chat-composer-input"
            ref={textareaRef}
            rows={2}
            value={draftInput}
            onChange={(e) => onDraftInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything, drop a PDF or CSV, or ask AuraDesk to organize a shared folder..."
            className="w-full resize-none bg-transparent px-1.5 py-1 text-sm leading-relaxed text-ink placeholder:text-ink-muted focus:outline-none"
          />

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleAttachClick}
                disabled={parsingFiles}
                className="tactile-press inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-subtle hover:text-ink"
              >
                {parsingFiles ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" strokeWidth={1.9} />
                ) : (
                  <Paperclip className="h-3.5 w-3.5" strokeWidth={1.8} />
                )}
                Attach File
              </button>

              <button
                type="button"
                onClick={onPickFolder}
                className="tactile-press inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-subtle hover:text-ink"
              >
                <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.8} />
                <span className="tabular-nums">
                  {allowedFolders.length > 0
                    ? `${allowedFolders.length} Folder${allowedFolders.length === 1 ? '' : 's'}`
                    : 'Share Folder'}
                </span>
              </button>

              {/* Inline Live Model Quick-Selector */}
              {activeProvider && activeProvider.availableModels.length > 1 && (
                <select
                  aria-label="Quick model switcher"
                  value={activeProvider.selectedModel}
                  onChange={(e) => onSwitchProvider(activeProviderId, e.target.value)}
                  className="rounded-lg border border-hairline bg-subtle px-2 py-1 text-[11px] font-medium text-ink-secondary hover:text-ink"
                >
                  {activeProvider.availableModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {isStreaming ? (
              <button
                type="button"
                onClick={onStop}
                aria-label="Stop generation"
                className="tactile-press inline-flex items-center gap-1.5 rounded-xl bg-ink px-3.5 py-2 text-xs font-semibold text-canvas"
              >
                <Square className="h-3 w-3 fill-current" />
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!draftInput.trim() && attachments.length === 0}
                aria-label="Send message"
                className="tactile-press inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-ink hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                Send
                <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.2} />
              </button>
            )}
          </div>
        </form>
      </div>
    </main>
  );
};
