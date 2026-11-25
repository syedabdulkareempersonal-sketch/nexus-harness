import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  FileCheck2,
  FileText,
  FolderKanban,
  FolderOpen,
  FolderPlus,
  Globe,
  Loader2,
  PanelRightOpen,
  Paperclip,
  PenLine,
  ShieldAlert,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import { desktopApi } from '../lib/bridge';
import { renderSafeMarkdown } from '../lib/markdown';
import { SafetyApprovalCard } from './SafetyApprovalCard';
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

export type GuidedTaskMode = 'folder' | 'research' | 'document' | 'write' | null;

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
  guidedTask: GuidedTaskMode;
  onSelectGuidedTask: (mode: GuidedTaskMode) => void;
  draftInput: string;
  onDraftInputChange: (val: string) => void;
  onSend: (text: string, attachments: FileAttachment[]) => Promise<void>;
  onStop: () => Promise<void>;
  onResolveSafety: (requestId: string, decision: SafetyDecision) => Promise<void>;
  onOpenSettings: () => void;
  onPickFolder: () => Promise<AllowedFolder | null>;
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

const HOME_CARDS: Array<{
  mode: Exclude<GuidedTaskMode, null>;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}> = [
  {
    mode: 'folder',
    title: 'Organize a Folder',
    subtitle: 'Tidy messy files safely with your approval',
    icon: <FolderKanban className="h-5 w-5" strokeWidth={1.8} />,
  },
  {
    mode: 'research',
    title: 'Research a Topic',
    subtitle: 'Search live sources & write a clear report',
    icon: <Globe className="h-5 w-5" strokeWidth={1.8} />,
  },
  {
    mode: 'document',
    title: 'Summarize a File',
    subtitle: 'Read any PDF, Word doc, or spreadsheet',
    icon: <FileCheck2 className="h-5 w-5" strokeWidth={1.8} />,
  },
  {
    mode: 'write',
    title: 'Write or Polish',
    subtitle: 'Draft emails, letters, or clean documents',
    icon: <PenLine className="h-5 w-5" strokeWidth={1.8} />,
  },
];

export const ChatWorkspace: React.FC<ChatWorkspaceProps> = ({
  messages,
  isStreaming,
  errorBanner,
  providers,
  activeProviderId,
  allowedFolders,
  artifactsForConversation,
  pendingSafety,
  guidedTask,
  onSelectGuidedTask,
  draftInput,
  onDraftInputChange,
  onSend,
  onStop,
  onResolveSafety,
  onOpenSettings,
  onPickFolder,
  onOpenArtifact,
}) => {
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [parsingFiles, setParsingFiles] = useState(false);
  const [guidedText, setGuidedText] = useState('');
  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const guidedInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingSafety]);

  useEffect(() => {
    setGuidedText('');
    if (guidedTask === 'research' || guidedTask === 'write') {
      requestAnimationFrame(() => guidedInputRef.current?.focus());
    }
  }, [guidedTask]);

  const activeProvider =
    providers.find((p) => p.id === activeProviderId) ?? providers[0];

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
      `Please summarize ${attachments.map((a) => `"${a.name}"`).join(', ')} and highlight the key takeaways.`;
    const currentAttachments = [...attachments];
    onDraftInputChange('');
    setAttachments([]);
    onSelectGuidedTask(null);
    await onSend(textToSend, currentAttachments);
  };

  const handleRunGuidedTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guidedTask === 'folder') {
      const folder = allowedFolders[0];
      if (!folder) return;
      onSelectGuidedTask(null);
      await onSend(
        `Please look inside my "${folder.label}" folder (${folder.folderPath}), summarize what files are inside, and open a clean, sensible organization plan on the right before moving anything.`,
        []
      );
    } else if (guidedTask === 'research' && guidedText.trim()) {
      const topic = guidedText.trim();
      onSelectGuidedTask(null);
      await onSend(
        `Please research "${topic}" using live web sources and open a clear, easy-to-read report with key takeaways on the right.`,
        []
      );
    } else if (guidedTask === 'document' && attachments.length > 0) {
      const filesToSend = [...attachments];
      setAttachments([]);
      onSelectGuidedTask(null);
      await onSend(
        `Please read ${filesToSend.map((f) => `"${f.name}"`).join(', ')}, explain the main points in simple English, and open a clean summary & action checklist on the right.`,
        filesToSend
      );
    } else if (guidedTask === 'write' && guidedText.trim()) {
      const brief = guidedText.trim();
      onSelectGuidedTask(null);
      await onSend(
        `Please write a clear, polished draft for: "${brief}" and open it on the right so I can review, edit, or export it as a PDF.`,
        []
      );
    }
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
      {/* Drag-and-Drop File Overlay */}
      {isDraggingOver && (
        <div className="pointer-events-none absolute inset-3 z-30 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-accent-soft backdrop-blur-sm">
          <FileText className="h-9 w-9 text-accent" strokeWidth={1.8} />
          <p className="mt-2 text-base font-semibold text-ink">
            Drop your PDF, Word doc, or spreadsheet here
          </p>
          <p className="text-xs text-ink-secondary">Read privately on your computer</p>
        </div>
      )}

      {/* Main Message Area or Simple Home Screen */}
      <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-8">
        {messages.length === 0 ? (
          <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center py-4">
            <div className="text-center">
              <h1 className="text-3xl font-semibold text-ink">How can I help you today?</h1>
              <p className="mx-auto mt-2 max-w-md text-sm text-ink-secondary">
                Pick a quick task below, drop a file, or simply type your question in plain English.
              </p>

              {activeProviderId === 'demo' && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="tactile-press mt-4 inline-flex items-center gap-2 rounded-full border border-hairline bg-elevated px-4 py-1.5 text-xs font-medium text-accent shadow-card hover:border-accent"
                >
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={1.8} />
                  In Practice Mode · Click here to connect Google Gemini, OpenAI, or Claude
                </button>
              )}
            </div>

            {/* 4 Ultra-Clear Everyday Action Cards */}
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {HOME_CARDS.map((card) => {
                const isSelected = guidedTask === card.mode;
                return (
                  <button
                    key={card.mode}
                    type="button"
                    onClick={() => onSelectGuidedTask(isSelected ? null : card.mode)}
                    className={`tactile-press flex items-center gap-4 rounded-2xl border p-4 text-left shadow-card ${
                      isSelected
                        ? 'border-accent bg-accent-soft'
                        : 'border-hairline bg-elevated hover:border-strongline'
                    }`}
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                      {card.icon}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-ink">{card.title}</div>
                      <p className="mt-0.5 text-xs text-ink-secondary">{card.subtitle}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Friendly 1-Step Guided Card (Replaces Scary Prompt Dumps!) */}
            {guidedTask && (
              <form
                onSubmit={handleRunGuidedTask}
                className="mt-4 rounded-2xl border border-accent bg-elevated p-5 shadow-float"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-ink">
                    {guidedTask === 'folder' && 'Step 1: Choose which folder to tidy up'}
                    {guidedTask === 'research' && 'What topic should I research for you?'}
                    {guidedTask === 'document' && 'Choose a document to summarize'}
                    {guidedTask === 'write' && 'What would you like me to write?'}
                  </h2>
                  <button
                    type="button"
                    onClick={() => onSelectGuidedTask(null)}
                    aria-label="Close helper"
                    className="rounded-lg p-1 text-ink-muted hover:bg-subtle hover:text-ink"
                  >
                    <X className="h-4 w-4" strokeWidth={1.8} />
                  </button>
                </div>

                {guidedTask === 'folder' && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    {allowedFolders.length === 0 ? (
                      <>
                        <p className="text-xs text-ink-secondary">
                          Pick a folder (like Downloads or Desktop). AuraDesk won&apos;t move anything without asking you first.
                        </p>
                        <button
                          type="button"
                          onClick={() => void onPickFolder()}
                          className="tactile-press inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-semibold text-accent-ink hover:bg-accent-hover"
                        >
                          <FolderPlus className="h-4 w-4" strokeWidth={1.9} />
                          Pick a Folder
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-ink-secondary">
                          Ready to check <strong>{allowedFolders[0].label}</strong> and create a neat tidy-up plan.
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void onPickFolder()}
                            className="tactile-press rounded-xl border border-hairline bg-subtle px-3 py-2 text-xs font-medium text-ink"
                          >
                            Pick Another
                          </button>
                          <button
                            type="submit"
                            className="tactile-press inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-ink hover:bg-accent-hover"
                          >
                            Scan &amp; Plan
                            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {(guidedTask === 'research' || guidedTask === 'write') && (
                  <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
                    <input
                      ref={guidedInputRef}
                      type="text"
                      required
                      value={guidedText}
                      onChange={(e) => setGuidedText(e.target.value)}
                      placeholder={
                        guidedTask === 'research'
                          ? 'e.g., Best budget laptops for college students in 2026'
                          : 'e.g., A polite email asking my landlord to fix the heater'
                      }
                      className="flex-1 rounded-xl border border-hairline bg-subtle px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:bg-elevated focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={!guidedText.trim()}
                      className="tactile-press inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-accent px-5 py-2.5 text-xs font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-45"
                    >
                      {guidedTask === 'research' ? 'Start Research' : 'Create Draft'}
                      <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  </div>
                )}

                {guidedTask === 'document' && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    {attachments.length === 0 ? (
                      <>
                        <p className="text-xs text-ink-secondary">
                          Select any PDF, Word (.docx), or CSV spreadsheet from your computer.
                        </p>
                        <button
                          type="button"
                          onClick={handleAttachClick}
                          disabled={parsingFiles}
                          className="tactile-press inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-semibold text-accent-ink hover:bg-accent-hover"
                        >
                          {parsingFiles ? (
                            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                          ) : (
                            <Paperclip className="h-4 w-4" strokeWidth={1.9} />
                          )}
                          Choose File
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-xs font-medium text-ink">
                          Ready: <strong>{attachments.map((a) => a.name).join(', ')}</strong>
                        </span>
                        <button
                          type="submit"
                          className="tactile-press inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-ink hover:bg-accent-hover"
                        >
                          Summarize Now
                          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </form>
            )}
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-5 pb-4">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
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

                  {!isUser && msg.toolActivities.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
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
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                          Thinking...
                        </div>
                      )}

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
                                View &ldquo;{found.title}&rdquo;
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
                className="flex items-center justify-between gap-3 rounded-2xl border border-hairline bg-warn-soft px-4 py-3 text-xs leading-relaxed text-warn"
              >
                <span className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.9} />
                  <span>{errorBanner}</span>
                </span>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="shrink-0 rounded-lg bg-elevated px-3 py-1.5 font-semibold text-ink shadow-card"
                >
                  Check AI Setup
                </button>
              </div>
            )}

            <div ref={scrollEndRef} />
          </div>
        )}
      </div>

      {/* Plain-English Safety Approval Card */}
      <div className="px-5">
        {pendingSafety && (
          <SafetyApprovalCard request={pendingSafety} onDecide={onResolveSafety} />
        )}
      </div>

      {/* Clean, Effortless Message Bar */}
      <div className="shrink-0 px-5 pb-4 pt-1 sm:px-8">
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-2xl rounded-2xl border border-strongline bg-elevated p-3 shadow-card focus-within:border-accent"
        >
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
            Message AuraDesk
          </label>
          <textarea
            id="chat-composer-input"
            rows={2}
            value={draftInput}
            onChange={(e) => onDraftInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              activeProvider?.id === 'demo'
                ? 'Type a question, or attach a PDF / spreadsheet...'
                : `Message ${activeProvider?.displayName || 'AuraDesk'}...`
            }
            className="w-full resize-none bg-transparent px-1.5 py-1 text-sm leading-relaxed text-ink placeholder:text-ink-muted focus:outline-none"
          />

          <div className="mt-2 flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleAttachClick}
                disabled={parsingFiles}
                className="tactile-press inline-flex items-center gap-1.5 rounded-xl bg-subtle px-3 py-1.5 text-xs font-medium text-ink hover:opacity-90"
              >
                {parsingFiles ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" strokeWidth={1.9} />
                ) : (
                  <Paperclip className="h-3.5 w-3.5 text-accent" strokeWidth={1.8} />
                )}
                Attach File
              </button>

              <button
                type="button"
                onClick={() => void onPickFolder()}
                className="tactile-press inline-flex items-center gap-1.5 rounded-xl bg-subtle px-3 py-1.5 text-xs font-medium text-ink hover:opacity-90"
              >
                <FolderOpen className="h-3.5 w-3.5 text-accent" strokeWidth={1.8} />
                <span className="tabular-nums">
                  {allowedFolders.length > 0
                    ? `${allowedFolders.length} Shared Folder${allowedFolders.length === 1 ? '' : 's'}`
                    : 'Choose Folder'}
                </span>
              </button>
            </div>

            {isStreaming ? (
              <button
                type="button"
                onClick={onStop}
                aria-label="Stop reply"
                className="tactile-press inline-flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2 text-xs font-semibold text-canvas"
              >
                <Square className="h-3 w-3 fill-current" />
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!draftInput.trim() && attachments.length === 0}
                aria-label="Send message"
                className="tactile-press inline-flex items-center gap-1.5 rounded-xl bg-accent px-5 py-2 text-xs font-semibold text-accent-ink hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
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
