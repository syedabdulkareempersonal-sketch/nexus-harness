import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Check,
  Code2,
  Copy,
  Download,
  Eye,
  FileCode,
  FileText,
  Globe,
  PencilLine,
  X,
} from 'lucide-react';
import { renderSafeMarkdown } from '../lib/markdown';
import type { ArtifactItem, ExportArtifactFormat, SaveArtifactInput } from '@shared/types';

interface ArtifactCanvasProps {
  artifact: ArtifactItem;
  allArtifacts: ArtifactItem[];
  onSelectArtifact: (artifact: ArtifactItem) => void;
  onSaveArtifact: (input: SaveArtifactInput) => Promise<ArtifactItem>;
  onExportArtifact: (artifactId: string, format: ExportArtifactFormat) => Promise<string | null>;
  onClose: () => void;
}

export const ArtifactCanvas: React.FC<ArtifactCanvasProps> = ({
  artifact,
  allArtifacts,
  onSelectArtifact,
  onSaveArtifact,
  onExportArtifact,
  onClose,
}) => {
  const [mode, setMode] = useState<'preview' | 'edit'>('preview');
  const [draftContent, setDraftContent] = useState(artifact.content);
  const [draftTitle, setDraftTitle] = useState(artifact.title);
  const [copied, setCopied] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  useEffect(() => {
    setDraftContent(artifact.content);
    setDraftTitle(artifact.title);
  }, [artifact.id, artifact.content, artifact.title]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(draftContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleSaveEdits = async () => {
    await onSaveArtifact({
      id: artifact.id,
      conversationId: artifact.conversationId,
      title: draftTitle.trim() || artifact.title,
      kind: artifact.kind,
      language: artifact.language,
      content: draftContent,
    });
    setMode('preview');
  };

  const handleExport = async (format: ExportArtifactFormat) => {
    if (draftContent !== artifact.content || draftTitle !== artifact.title) {
      await onSaveArtifact({
        id: artifact.id,
        conversationId: artifact.conversationId,
        title: draftTitle.trim() || artifact.title,
        kind: artifact.kind,
        language: artifact.language,
        content: draftContent,
      });
    }
    const msg = await onExportArtifact(artifact.id, format);
    if (msg) {
      setExportStatus(msg);
      setTimeout(() => setExportStatus(null), 3200);
    }
  };

  const KindIcon =
    artifact.kind === 'html'
      ? Globe
      : artifact.kind === 'code'
        ? Code2
        : FileText;

  return (
    <motion.section
      initial={{ opacity: 0, x: 14 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 14 }}
      transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
      aria-label="Live Artifact Canvas"
      className="win12-island flex h-full w-full flex-col overflow-hidden rounded-2xl lg:w-[45%] xl:w-[47%]"
    >
      {/* Canvas Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-5 py-3.5">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <KindIcon className="h-4 w-4" strokeWidth={1.8} />
          </div>

          {allArtifacts.length > 1 ? (
            <select
              aria-label="Switch Canvas document"
              value={artifact.id}
              onChange={(e) => {
                const chosen = allArtifacts.find((a) => a.id === e.target.value);
                if (chosen) onSelectArtifact(chosen);
              }}
              className="max-w-[240px] truncate rounded-lg border border-hairline bg-canvas px-2.5 py-1.5 text-sm font-semibold text-ink"
            >
              {allArtifacts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
          ) : (
            <h2 className="truncate text-sm font-semibold text-ink">{artifact.title}</h2>
          )}
        </div>

        {/* Mode & Action Controls */}
        <div className="flex items-center gap-1.5">
          <div className="flex rounded-lg bg-subtle p-0.5">
            <button
              type="button"
              onClick={() => setMode('preview')}
              className={`tactile-press inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${
                mode === 'preview'
                  ? 'bg-surface text-ink shadow-card'
                  : 'text-ink-secondary hover:text-ink'
              }`}
            >
              <Eye className="h-3.5 w-3.5" strokeWidth={1.8} />
              Preview
            </button>
            <button
              type="button"
              onClick={() => setMode('edit')}
              className={`tactile-press inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${
                mode === 'edit'
                  ? 'bg-surface text-ink shadow-card'
                  : 'text-ink-secondary hover:text-ink'
              }`}
            >
              <PencilLine className="h-3.5 w-3.5" strokeWidth={1.8} />
              Edit
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="tactile-press inline-flex items-center gap-1 rounded-lg border border-hairline bg-canvas px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-subtle"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-trust" strokeWidth={2} />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" strokeWidth={1.8} />
                Copy
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Canvas"
            className="tactile-press rounded-lg p-1.5 text-ink-muted hover:bg-subtle hover:text-ink"
          >
            <X className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {/* 1-Click Export Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline bg-canvas px-5 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-muted">1-Click Export:</span>
          <button
            type="button"
            onClick={() => handleExport('pdf')}
            className="tactile-press inline-flex items-center gap-1 rounded-lg border border-hairline bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:bg-subtle"
          >
            <Download className="h-3 w-3 text-accent" strokeWidth={1.8} />
            PDF
          </button>
          <button
            type="button"
            onClick={() => handleExport('markdown')}
            className="tactile-press inline-flex items-center gap-1 rounded-lg border border-hairline bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:bg-subtle"
          >
            <FileText className="h-3 w-3 text-ink-secondary" strokeWidth={1.8} />
            Markdown
          </button>
          <button
            type="button"
            onClick={() => handleExport('html')}
            className="tactile-press inline-flex items-center gap-1 rounded-lg border border-hairline bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:bg-subtle"
          >
            <FileCode className="h-3 w-3 text-ink-secondary" strokeWidth={1.8} />
            HTML
          </button>
        </div>

        {exportStatus && (
          <span role="status" className="text-xs font-medium text-trust">
            {exportStatus}
          </span>
        )}
      </div>

      {/* Canvas Body */}
      <div className="flex-1 overflow-y-auto p-6">
        {mode === 'edit' ? (
          <div className="flex h-full flex-col gap-3">
            <div>
              <label htmlFor="canvas-title-input" className="sr-only">
                Document Title
              </label>
              <input
                id="canvas-title-input"
                type="text"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                className="w-full rounded-xl border border-hairline bg-canvas px-3.5 py-2 text-sm font-semibold text-ink focus:border-accent focus:outline-none"
              />
            </div>
            <textarea
              aria-label="Edit Canvas document content"
              value={draftContent}
              onChange={(e) => setDraftContent(e.target.value)}
              className="flex-1 resize-none rounded-2xl border border-hairline bg-canvas p-4 font-mono text-xs leading-relaxed text-ink focus:border-accent focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraftContent(artifact.content);
                  setDraftTitle(artifact.title);
                  setMode('preview');
                }}
                className="tactile-press rounded-xl px-4 py-2 text-xs font-medium text-ink-secondary hover:bg-subtle"
              >
                Discard Changes
              </button>
              <button
                type="button"
                onClick={handleSaveEdits}
                className="tactile-press inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-ink hover:bg-accent-hover"
              >
                <Check className="h-3.5 w-3.5" strokeWidth={2} />
                Save Changes
              </button>
            </div>
          </div>
        ) : artifact.kind === 'html' ? (
          <div className="h-full min-h-[480px] overflow-hidden rounded-2xl border border-hairline bg-white shadow-card">
            <iframe
              title={artifact.title}
              srcDoc={draftContent}
              sandbox="allow-scripts"
              className="h-full min-h-[480px] w-full border-0"
            />
          </div>
        ) : artifact.kind === 'code' ? (
          <pre className="overflow-x-auto rounded-2xl border border-hairline bg-canvas p-5 font-mono text-xs leading-relaxed text-ink">
            <code>{draftContent}</code>
          </pre>
        ) : (
          <article
            className="prose-aura prose-aura-wide mx-auto rounded-2xl border border-hairline bg-elevated p-7 shadow-card"
            dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(draftContent) }}
          />
        )}
      </div>
    </motion.section>
  );
};
