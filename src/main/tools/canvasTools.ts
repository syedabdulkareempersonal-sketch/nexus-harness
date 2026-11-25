import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import type { ArtifactItem, ArtifactKind, SaveArtifactInput, ToolActivity } from '@shared/types';

export interface CanvasToolContext {
  conversationId: string;
  saveArtifact: (input: SaveArtifactInput) => ArtifactItem;
  onArtifactCreated: (artifact: ArtifactItem) => void;
  emitActivity: (activity: ToolActivity) => void;
}

export function buildCanvasTools(ctx: CanvasToolContext): ToolSet {
  return {
    open_in_canvas: tool({
      description:
        'Opens a clean right-side Document Canvas containing a formatted report, polished document, Markdown table, standalone interactive HTML webpage, or code file so the user can read, edit, copy, or export to PDF/Markdown/HTML in 1 click. Only call this when producing a substantial document, table, webpage, or code—not for short everyday chat replies.',
      inputSchema: z.object({
        title: z.string().describe('Clear, human-friendly document title'),
        kind: z
          .enum(['markdown', 'html', 'table', 'code'])
          .describe(
            'Use "markdown" for reports/guides/letters, "table" for Markdown tables, "html" for complete self-contained HTML pages, or "code" for source code'
          ),
        content: z
          .string()
          .describe('Full, complete content of the report, table, HTML page, or code'),
        language: z
          .string()
          .nullable()
          .optional()
          .describe('Programming language when kind is "code", otherwise null'),
      }),
      execute: async ({ title, kind, content, language }) => {
        const activityId = `act-${Date.now()}-canvas`;
        ctx.emitActivity({
          id: activityId,
          toolName: 'open_in_canvas',
          friendlyLabel: `Opening "${title}" in Document View...`,
          status: 'running',
        });

        const artifact = ctx.saveArtifact({
          conversationId: ctx.conversationId,
          title,
          kind: kind as ArtifactKind,
          language: language ?? null,
          content,
        });

        ctx.onArtifactCreated(artifact);

        ctx.emitActivity({
          id: activityId,
          toolName: 'open_in_canvas',
          friendlyLabel: `Opened "${title}"`,
          status: 'completed',
        });

        return {
          artifactId: artifact.id,
          title: artifact.title,
          kind: artifact.kind,
          note: 'The document is now open on the right side of the screen. Give a short, friendly summary in chat without repeating the whole document.',
        };
      },
    }),
  };
}
