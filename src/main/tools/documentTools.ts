import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import mammoth from 'mammoth';
import { extractText } from 'unpdf';
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { assertAllowedPath } from '../security/pathGuard';
import type { AllowedFolder, FileAttachment, ToolActivity } from '@shared/types';

function summarizeCsv(text: string): { summary: string; formatted: string } {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  const rows = parsed.data;
  const headers = parsed.meta.fields ?? [];
  if (headers.length === 0) {
    return {
      summary: `${rows.length} rows parsed`,
      formatted: text.slice(0, 14000),
    };
  }

  const numericSummaries: string[] = [];
  for (const col of headers.slice(0, 12)) {
    const nums = rows
      .map((r) => Number(String(r[col] ?? '').replace(/[$,%\s,]/g, '')))
      .filter((n) => !Number.isNaN(n) && Number.isFinite(n));
    if (nums.length >= Math.max(2, Math.floor(rows.length * 0.5))) {
      const sum = nums.reduce((a, b) => a + b, 0);
      const avg = sum / nums.length;
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      numericSummaries.push(
        `- ${col}: sum=${sum.toFixed(2)}, avg=${avg.toFixed(2)}, min=${min}, max=${max}`
      );
    }
  }

  const sampleRows = rows.slice(0, 35);
  const markdownTable = [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...sampleRows.map((row) => `| ${headers.map((h) => String(row[h] ?? '')).join(' | ')} |`),
  ].join('\n');

  const formatted = [
    `Spreadsheet Summary: ${rows.length} rows, ${headers.length} columns (${headers.join(', ')})`,
    numericSummaries.length > 0 ? `\nKey Column Totals & Averages:\n${numericSummaries.join('\n')}` : '',
    `\nSample Rows (first ${sampleRows.length} of ${rows.length}):\n${markdownTable}`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    summary: `${rows.length} rows · ${headers.length} columns`,
    formatted: formatted.slice(0, 20000),
  };
}

export async function parseDocumentBuffer(params: {
  name: string;
  mimeType?: string;
  buffer: Buffer;
  filePath?: string;
}): Promise<FileAttachment> {
  const ext = path.extname(params.name).toLowerCase();
  const sizeBytes = params.buffer.byteLength;
  let extractedText = '';
  let summaryPreview = '';

  if (ext === '.pdf' || params.mimeType === 'application/pdf') {
    const uint8 = new Uint8Array(params.buffer);
    const pdfResult = await extractText(uint8, { mergePages: true });
    extractedText = (Array.isArray(pdfResult.text) ? pdfResult.text.join('\n\n') : pdfResult.text || '').trim();
    summaryPreview = `PDF · ${pdfResult.totalPages} page${pdfResult.totalPages === 1 ? '' : 's'}`;
  } else if (
    ext === '.docx' ||
    params.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const result = await mammoth.extractRawText({ buffer: params.buffer });
    extractedText = result.value.trim();
    const wordCount = extractedText.split(/\s+/).filter(Boolean).length;
    summaryPreview = `Word Doc · ${wordCount.toLocaleString()} words`;
  } else if (ext === '.csv' || ext === '.tsv' || params.mimeType === 'text/csv') {
    const rawText = params.buffer.toString('utf8');
    const csvInfo = summarizeCsv(rawText);
    extractedText = csvInfo.formatted;
    summaryPreview = `Spreadsheet · ${csvInfo.summary}`;
  } else {
    extractedText = params.buffer.toString('utf8').slice(0, 24000);
    const lineCount = extractedText.split('\n').length;
    summaryPreview = `Document · ${lineCount.toLocaleString()} lines`;
  }

  if (!extractedText) {
    extractedText = '[No selectable text was found inside this file.]';
  }

  return {
    id: crypto.randomUUID(),
    name: params.name,
    filePath: params.filePath,
    mimeType: params.mimeType || 'application/octet-stream',
    sizeBytes,
    summaryPreview,
    extractedText: extractedText.slice(0, 24000),
  };
}

export function buildDocumentTools(ctx: {
  getAllowedFolders: () => AllowedFolder[];
  emitActivity: (activity: ToolActivity) => void;
}): ToolSet {
  return {
    analyze_document_file: tool({
      description:
        'Extracts text, tables, and key numbers from a PDF (.pdf), Word document (.docx), Spreadsheet (.csv/.tsv), or text document inside a shared folder.',
      inputSchema: z.object({
        filePath: z.string().describe('Full path to the PDF, DOCX, CSV, or text file inside a shared folder'),
      }),
      execute: async ({ filePath }) => {
        const activityId = `act-${Date.now()}-doc`;
        const fileName = path.basename(filePath);
        ctx.emitActivity({
          id: activityId,
          toolName: 'analyze_document_file',
          friendlyLabel: `Reading "${fileName}"...`,
          status: 'running',
        });

        try {
          const { resolvedPath } = assertAllowedPath(filePath, ctx.getAllowedFolders());
          const buffer = fs.readFileSync(resolvedPath);
          const parsed = await parseDocumentBuffer({
            name: fileName,
            buffer,
            filePath: resolvedPath,
          });

          ctx.emitActivity({
            id: activityId,
            toolName: 'analyze_document_file',
            friendlyLabel: `Read "${fileName}" (${parsed.summaryPreview})`,
            status: 'completed',
          });

          return {
            fileName: parsed.name,
            summary: parsed.summaryPreview,
            extractedContent: parsed.extractedText,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Could not analyze document.';
          ctx.emitActivity({
            id: activityId,
            toolName: 'analyze_document_file',
            friendlyLabel: message,
            status: 'error',
          });
          return { error: message };
        }
      },
    }),
  };
}
