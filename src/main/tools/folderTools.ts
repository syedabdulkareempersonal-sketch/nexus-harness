import fs from 'node:fs';
import path from 'node:path';
import { tool, type CoreTool } from 'ai';
import { z } from 'zod';
import { assertAllowedPath } from '../security/pathGuard';
import type { SafetyGate } from '../security/safetyGate';
import type { AllowedFolder, ToolActivity } from '@shared/types';

export interface FolderToolContext {
  conversationId: string;
  getAllowedFolders: () => AllowedFolder[];
  trustFolder: (folderId: string) => AllowedFolder | null;
  safetyGate: SafetyGate;
  emitActivity: (activity: ToolActivity) => void;
  trashFile: (fullPath: string) => Promise<void>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function classifyFileKind(name: string, isDir: boolean): string {
  if (isDir) return 'Folder';
  const ext = path.extname(name).toLowerCase();
  if (['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf'].includes(ext)) return 'Document';
  if (['.csv', '.tsv', '.xls', '.xlsx', '.numbers'].includes(ext)) return 'Spreadsheet';
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.heic'].includes(ext)) return 'Image';
  if (['.mp4', '.mov', '.mkv', '.webm'].includes(ext)) return 'Video';
  if (['.mp3', '.wav', '.m4a', '.flac'].includes(ext)) return 'Audio';
  if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) return 'Archive';
  if (['.ts', '.tsx', '.js', '.py', '.json', '.html', '.css'].includes(ext)) return 'Code';
  return 'File';
}

async function ensureWritePermission(
  ctx: FolderToolContext,
  folder: AllowedFolder,
  params: {
    headline: string;
    whatWillHappen: string;
    whyExplanation: string;
    targetPath: string;
    previewText?: string;
    riskLevel?: 'gentle' | 'caution';
    alwaysAsk?: boolean;
  }
): Promise<boolean> {
  if (!params.alwaysAsk && folder.trustMode === 'trusted') {
    return true;
  }

  const decision = await ctx.safetyGate.requestApproval({
    conversationId: ctx.conversationId,
    headline: params.headline,
    whatWillHappen: params.whatWillHappen,
    whyExplanation: params.whyExplanation,
    targetPath: params.targetPath,
    folderId: folder.id,
    folderLabel: folder.label,
    canTrustFolder: !params.alwaysAsk,
    previewText: params.previewText,
    riskLevel: params.riskLevel ?? 'gentle',
  });

  if (decision === 'trust_folder') {
    ctx.trustFolder(folder.id);
    return true;
  }

  return decision === 'allow_once';
}

export function buildFolderTools(ctx: FolderToolContext): Record<string, CoreTool> {
  return {
    list_shared_folders: tool({
      description:
        'Lists the folders on this computer that the user has shared with AuraDesk so you know which paths are available.',
      parameters: z.object({}),
      execute: async () => {
        const folders = ctx.getAllowedFolders();
        if (folders.length === 0) {
          return {
            sharedFolders: [],
            note: 'No folders are shared yet. Politely invite the user to click "+ Add Folder" in Superpowers or the chat attachment bar.',
          };
        }
        return {
          sharedFolders: folders.map((f) => ({
            label: f.label,
            path: f.folderPath,
            trustMode: f.trustMode,
          })),
        };
      },
    }),

    list_folder_contents: tool({
      description:
        'Lists files and subfolders inside a user-shared folder path, including sizes, categories, and last modified dates.',
      parameters: z.object({
        folderPath: z.string().describe('Full path of the shared folder or subfolder to inspect'),
      }),
      execute: async ({ folderPath }) => {
        const activityId = `act-${Date.now()}-list`;
        const shortName = path.basename(folderPath) || folderPath;
        ctx.emitActivity({
          id: activityId,
          toolName: 'list_folder_contents',
          friendlyLabel: `Looking inside your "${shortName}" folder...`,
          status: 'running',
        });

        try {
          const { resolvedPath } = assertAllowedPath(folderPath, ctx.getAllowedFolders());
          const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
          const items = entries.slice(0, 200).map((entry) => {
            const full = path.join(resolvedPath, entry.name);
            let sizeBytes = 0;
            let modifiedAt = '';
            try {
              const stat = fs.statSync(full);
              sizeBytes = stat.size;
              modifiedAt = stat.mtime.toISOString().split('T')[0];
            } catch {
              // Ignore inaccessible system metadata entries
            }
            return {
              name: entry.name,
              path: full,
              kind: classifyFileKind(entry.name, entry.isDirectory()),
              isDirectory: entry.isDirectory(),
              size: entry.isDirectory() ? 'Folder' : formatBytes(sizeBytes),
              modifiedDate: modifiedAt,
            };
          });

          ctx.emitActivity({
            id: activityId,
            toolName: 'list_folder_contents',
            friendlyLabel: `Inspected ${items.length} items in "${shortName}"`,
            status: 'completed',
          });

          return {
            folder: resolvedPath,
            totalItemsFound: entries.length,
            shownItems: items.length,
            items,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unable to read folder.';
          ctx.emitActivity({
            id: activityId,
            toolName: 'list_folder_contents',
            friendlyLabel: message,
            status: 'error',
          });
          return { error: message };
        }
      },
    }),

    search_files_in_folder: tool({
      description: 'Searches for files matching a keyword or extension inside a shared folder.',
      parameters: z.object({
        folderPath: z.string().describe('Root shared folder path to search within'),
        query: z.string().describe('Filename keyword or extension such as ".pdf" or "invoice"'),
      }),
      execute: async ({ folderPath, query }) => {
        const activityId = `act-${Date.now()}-search`;
        const shortName = path.basename(folderPath) || folderPath;
        ctx.emitActivity({
          id: activityId,
          toolName: 'search_files_in_folder',
          friendlyLabel: `Searching "${shortName}" for "${query}"...`,
          status: 'running',
        });

        try {
          const { resolvedPath } = assertAllowedPath(folderPath, ctx.getAllowedFolders());
          const needle = query.toLowerCase();
          const matches: Array<{ name: string; path: string; kind: string; size: string }> = [];

          const walk = (dir: string, depth: number) => {
            if (depth > 4 || matches.length >= 75) return;
            let entries: fs.Dirent[] = [];
            try {
              entries = fs.readdirSync(dir, { withFileTypes: true });
            } catch {
              return;
            }
            for (const entry of entries) {
              if (matches.length >= 75) break;
              if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
              const full = path.join(dir, entry.name);
              if (entry.name.toLowerCase().includes(needle)) {
                let size = 'Folder';
                if (!entry.isDirectory()) {
                  try {
                    size = formatBytes(fs.statSync(full).size);
                  } catch {
                    size = 'Unknown';
                  }
                }
                matches.push({
                  name: entry.name,
                  path: full,
                  kind: classifyFileKind(entry.name, entry.isDirectory()),
                  size,
                });
              }
              if (entry.isDirectory()) {
                walk(full, depth + 1);
              }
            }
          };

          walk(resolvedPath, 0);

          ctx.emitActivity({
            id: activityId,
            toolName: 'search_files_in_folder',
            friendlyLabel: `Found ${matches.length} matching items in "${shortName}"`,
            status: 'completed',
          });

          return { query, matches };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Search could not complete.';
          ctx.emitActivity({
            id: activityId,
            toolName: 'search_files_in_folder',
            friendlyLabel: message,
            status: 'error',
          });
          return { error: message };
        }
      },
    }),

    read_text_file: tool({
      description:
        'Reads the text contents of a plain-text, Markdown, CSV, JSON, HTML, or source file inside a shared folder.',
      parameters: z.object({
        filePath: z.string().describe('Full path to the file inside a shared folder'),
      }),
      execute: async ({ filePath }) => {
        const activityId = `act-${Date.now()}-read`;
        const fileName = path.basename(filePath);
        ctx.emitActivity({
          id: activityId,
          toolName: 'read_text_file',
          friendlyLabel: `Reading "${fileName}"...`,
          status: 'running',
        });

        try {
          const { resolvedPath } = assertAllowedPath(filePath, ctx.getAllowedFolders());
          const stat = fs.statSync(resolvedPath);
          if (stat.isDirectory()) {
            throw new Error(`"${fileName}" is a folder. Use list_folder_contents instead.`);
          }
          const maxBytes = 120 * 1024;
          const raw = fs.readFileSync(resolvedPath, 'utf8');
          const truncated = raw.length > maxBytes;
          const content = truncated ? `${raw.slice(0, maxBytes)}\n\n[Preview truncated at 120 KB]` : raw;

          ctx.emitActivity({
            id: activityId,
            toolName: 'read_text_file',
            friendlyLabel: `Finished reading "${fileName}"`,
            status: 'completed',
          });

          return {
            fileName,
            path: resolvedPath,
            size: formatBytes(stat.size),
            truncated,
            content,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unable to read file.';
          ctx.emitActivity({
            id: activityId,
            toolName: 'read_text_file',
            friendlyLabel: message,
            status: 'error',
          });
          return { error: message };
        }
      },
    }),

    create_subfolder: tool({
      description:
        'Creates a new subfolder inside a shared folder to help organize files neatly. Triggers user approval unless the folder is trusted.',
      parameters: z.object({
        folderPath: z.string().describe('Full path of the new subfolder to create'),
        reason: z.string().describe('Plain-English explanation of why this folder helps the user'),
      }),
      execute: async ({ folderPath, reason }) => {
        const activityId = `act-${Date.now()}-mkdir`;
        const folderName = path.basename(folderPath);
        try {
          const { resolvedPath, matchedFolder } = assertAllowedPath(
            folderPath,
            ctx.getAllowedFolders()
          );

          ctx.emitActivity({
            id: activityId,
            toolName: 'create_subfolder',
            friendlyLabel: `Asking permission to create folder "${folderName}"...`,
            status: 'running',
          });

          const approved = await ensureWritePermission(ctx, matchedFolder, {
            headline: `Create a new folder named "${folderName}"?`,
            whatWillHappen: `AuraDesk will create the folder "${folderName}" inside "${path.dirname(resolvedPath)}".`,
            whyExplanation: reason,
            targetPath: resolvedPath,
          });

          if (!approved) {
            ctx.emitActivity({
              id: activityId,
              toolName: 'create_subfolder',
              friendlyLabel: `Skipped creating folder "${folderName}"`,
              status: 'blocked',
            });
            return { status: 'declined_by_user', note: 'The user chose to block creating this folder.' };
          }

          fs.mkdirSync(resolvedPath, { recursive: true });
          ctx.emitActivity({
            id: activityId,
            toolName: 'create_subfolder',
            friendlyLabel: `Created folder "${folderName}"`,
            status: 'completed',
          });
          return { status: 'created', path: resolvedPath };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Could not create folder.';
          ctx.emitActivity({
            id: activityId,
            toolName: 'create_subfolder',
            friendlyLabel: message,
            status: 'error',
          });
          return { error: message };
        }
      },
    }),

    save_file_in_folder: tool({
      description:
        'Creates or updates a text/Markdown/CSV/HTML file inside a shared folder, pausing for Plain-English user approval first.',
      parameters: z.object({
        filePath: z.string().describe('Full path where the file should be saved'),
        content: z.string().describe('Complete text content to write into the file'),
        reason: z.string().describe('Plain-English explanation of why saving this file is helpful'),
      }),
      execute: async ({ filePath, content, reason }) => {
        const activityId = `act-${Date.now()}-write`;
        const fileName = path.basename(filePath);
        try {
          const { resolvedPath, matchedFolder } = assertAllowedPath(
            filePath,
            ctx.getAllowedFolders()
          );
          const exists = fs.existsSync(resolvedPath);

          ctx.emitActivity({
            id: activityId,
            toolName: 'save_file_in_folder',
            friendlyLabel: exists
              ? `Waiting for approval to update "${fileName}"...`
              : `Waiting for approval to save "${fileName}"...`,
            status: 'running',
          });

          const approved = await ensureWritePermission(ctx, matchedFolder, {
            headline: exists ? `Update "${fileName}"?` : `Save new file "${fileName}"?`,
            whatWillHappen: exists
              ? `AuraDesk will replace the contents of "${fileName}" in "${path.dirname(resolvedPath)}".`
              : `AuraDesk will create "${fileName}" in "${path.dirname(resolvedPath)}".`,
            whyExplanation: reason,
            targetPath: resolvedPath,
            previewText: content.slice(0, 1200),
            riskLevel: exists ? 'caution' : 'gentle',
          });

          if (!approved) {
            ctx.emitActivity({
              id: activityId,
              toolName: 'save_file_in_folder',
              friendlyLabel: `Blocked saving "${fileName}"`,
              status: 'blocked',
            });
            return { status: 'declined_by_user', note: 'The user declined saving this file.' };
          }

          fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
          fs.writeFileSync(resolvedPath, content, 'utf8');

          ctx.emitActivity({
            id: activityId,
            toolName: 'save_file_in_folder',
            friendlyLabel: exists ? `Updated "${fileName}"` : `Saved "${fileName}"`,
            status: 'completed',
          });
          return { status: exists ? 'updated' : 'created', path: resolvedPath };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Could not save file.';
          ctx.emitActivity({
            id: activityId,
            toolName: 'save_file_in_folder',
            friendlyLabel: message,
            status: 'error',
          });
          return { error: message };
        }
      },
    }),

    move_or_rename_file: tool({
      description:
        'Moves or renames a file inside shared folders (without overwriting existing files), pausing for user approval first.',
      parameters: z.object({
        sourcePath: z.string().describe('Current full path of the file'),
        destinationPath: z.string().describe('New full path for the file'),
        reason: z.string().describe('Plain-English explanation of why moving or renaming helps'),
      }),
      execute: async ({ sourcePath, destinationPath, reason }) => {
        const activityId = `act-${Date.now()}-move`;
        const srcName = path.basename(sourcePath);
        const destName = path.basename(destinationPath);
        try {
          const srcCheck = assertAllowedPath(sourcePath, ctx.getAllowedFolders());
          const destCheck = assertAllowedPath(destinationPath, ctx.getAllowedFolders());

          if (!fs.existsSync(srcCheck.resolvedPath)) {
            throw new Error(`Could not find "${srcName}" at the expected location.`);
          }
          if (fs.existsSync(destCheck.resolvedPath)) {
            throw new Error(
              `A file named "${destName}" already exists in "${path.dirname(destCheck.resolvedPath)}".`
            );
          }

          ctx.emitActivity({
            id: activityId,
            toolName: 'move_or_rename_file',
            friendlyLabel: `Waiting for approval to move "${srcName}"...`,
            status: 'running',
          });

          const approved = await ensureWritePermission(ctx, destCheck.matchedFolder, {
            headline:
              srcName === destName
                ? `Move "${srcName}" to "${path.basename(path.dirname(destCheck.resolvedPath))}"?`
                : `Rename "${srcName}" to "${destName}"?`,
            whatWillHappen: `From: ${srcCheck.resolvedPath}\nTo: ${destCheck.resolvedPath}`,
            whyExplanation: reason,
            targetPath: destCheck.resolvedPath,
          });

          if (!approved) {
            ctx.emitActivity({
              id: activityId,
              toolName: 'move_or_rename_file',
              friendlyLabel: `Skipped moving "${srcName}"`,
              status: 'blocked',
            });
            return { status: 'declined_by_user' };
          }

          fs.mkdirSync(path.dirname(destCheck.resolvedPath), { recursive: true });
          fs.renameSync(srcCheck.resolvedPath, destCheck.resolvedPath);

          ctx.emitActivity({
            id: activityId,
            toolName: 'move_or_rename_file',
            friendlyLabel: `Moved "${srcName}" to "${destName}"`,
            status: 'completed',
          });
          return { status: 'moved', from: srcCheck.resolvedPath, to: destCheck.resolvedPath };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Could not move file.';
          ctx.emitActivity({
            id: activityId,
            toolName: 'move_or_rename_file',
            friendlyLabel: message,
            status: 'error',
          });
          return { error: message };
        }
      },
    }),

    move_file_to_trash: tool({
      description:
        'Moves an unwanted file to the operating system Recycle Bin / Trash (recoverable, never permanent deletion). Always asks the user first.',
      parameters: z.object({
        filePath: z.string().describe('Full path of the file to move to Trash / Recycle Bin'),
        reason: z.string().describe('Plain-English explanation of why this file can be trashed'),
      }),
      execute: async ({ filePath, reason }) => {
        const activityId = `act-${Date.now()}-trash`;
        const fileName = path.basename(filePath);
        try {
          const { resolvedPath, matchedFolder } = assertAllowedPath(
            filePath,
            ctx.getAllowedFolders()
          );
          if (!fs.existsSync(resolvedPath)) {
            throw new Error(`"${fileName}" does not exist.`);
          }

          ctx.emitActivity({
            id: activityId,
            toolName: 'move_file_to_trash',
            friendlyLabel: `Asking before moving "${fileName}" to Recycle Bin...`,
            status: 'running',
          });

          const approved = await ensureWritePermission(ctx, matchedFolder, {
            headline: `Move "${fileName}" to your Recycle Bin?`,
            whatWillHappen: `"${fileName}" will be moved to your system Recycle Bin / Trash so you can still restore it anytime if you change your mind.`,
            whyExplanation: reason,
            targetPath: resolvedPath,
            riskLevel: 'caution',
            alwaysAsk: true,
          });

          if (!approved) {
            ctx.emitActivity({
              id: activityId,
              toolName: 'move_file_to_trash',
              friendlyLabel: `Kept "${fileName}" untouched`,
              status: 'blocked',
            });
            return { status: 'declined_by_user' };
          }

          await ctx.trashFile(resolvedPath);
          ctx.emitActivity({
            id: activityId,
            toolName: 'move_file_to_trash',
            friendlyLabel: `Moved "${fileName}" to Recycle Bin`,
            status: 'completed',
          });
          return { status: 'moved_to_trash', path: resolvedPath };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Could not move file to Trash.';
          ctx.emitActivity({
            id: activityId,
            toolName: 'move_file_to_trash',
            friendlyLabel: message,
            status: 'error',
          });
          return { error: message };
        }
      },
    }),
  };
}
