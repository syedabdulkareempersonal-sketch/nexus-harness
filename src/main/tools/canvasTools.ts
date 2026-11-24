import { tool, type CoreTool } from 'ai';
import { z } from 'zod';
import type { ArtifactItem, ArtifactKind, SaveArtifactInput, ToolActivity } from '@shared/types';

export interface CanvasToolContext {
  conversationId: string;
  saveArtifact: (input: SaveArtifactInput) => ArtifactItem;
  onArtifactCreated: (artifact: ArtifactItem) => void;
  emitActivity: (activity: ToolActivity) => void;
}

export function buildCanvasTools(ctx: CanvasToolContext): Record<string, CoreTool> {
  return {
    open_in_canvas: tool({
      description:
        'Opens a clean right-side Split-View Canvas containing a formatted report, polished document, Markdown table, standalone interactive HTML webpage, or code artifact so the user can preview, edit, copy, or export to PDF/Markdown/HTML in 1 click.',
      parameters: z.object({
        title: z.string().describe('Clear, human-friendly document or artifact title'),
        kind: z
          .enum(['markdown', 'html', 'table', 'code'])
          .describe('Use "markdown" for reports/guides/letters, "table" for Markdown tables, "html" for complete self-contained HTML pages, or "code" for source code'),
        content: z
          .string()
          .describe('Full, complete content of the report, table, HTML page, or code'),
        language: z
          .string()
          .optional()
          .describe('Programming language when kind is "code" (e.g. typescript, python)'),
      }),
      execute: async ({ title, kind, content, language }) => {
        const activityId = `act-${Date.now()}-canvas`;
        ctx.emitActivity({
          id: activityId,
          toolName: 'open_in_canvas',
          friendlyLabel: `Opening "${title}" in the Canvas...`,
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
          friendlyLabel: `Opened "${title}" in Canvas`,
          status: 'completed',
        });

        return {
          artifactId: artifact.id,
          title: artifact.title,
          kind: artifact.kind,
          note: 'The artifact is now visible in the right-hand Split-View Canvas. Keep your chat message concise and highlight the key takeaways rather than repeating the entire document verbatim.',
        };
      },
    }),
  };
}
