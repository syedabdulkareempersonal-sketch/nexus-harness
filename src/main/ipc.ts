import fs from 'node:fs';
import path from 'node:path';
import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { marked } from 'marked';
import type { AuraDatabase } from './db/database';
import { AiRouter, detectLocalOllama } from './ai/router';
import type { McpClientManager } from './mcp/mcpManager';
import type { SafetyGate } from './security/safetyGate';
import { parseDocumentBuffer } from './tools/documentTools';
import type {
  AppBootstrapPayload,
  AppSettings,
  ArtifactItem,
  ExportArtifactFormat,
  ExportArtifactResult,
  FolderTrustMode,
  ProviderId,
  SaveArtifactInput,
  SaveMcpServerInput,
  SaveMemoryInput,
  SaveWorkflowInput,
  SafetyDecision,
  SendMessageInput,
  StreamEvent,
  VerifyProviderInput,
} from '@shared/types';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPrintableHtml(artifact: ArtifactItem): string {
  if (artifact.kind === 'html') {
    return artifact.content;
  }

  let bodyHtml = '';
  if (artifact.kind === 'code') {
    bodyHtml = `<pre><code>${escapeHtml(artifact.content)}</code></pre>`;
  } else {
    bodyHtml = marked.parse(artifact.content, { async: false }) as string;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(artifact.title)}</title>
  <style>
    @page { margin: 20mm 18mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      color: #18181B;
      background: #FFFFFF;
      line-height: 1.65;
      font-size: 14px;
      max-width: 740px;
      margin: 0 auto;
      padding: 24px;
    }
    h1, h2, h3 {
      color: #111215;
      letter-spacing: -0.02em;
      line-height: 1.25;
      margin-top: 1.5em;
      margin-bottom: 0.5em;
    }
    h1 { font-size: 26px; margin-top: 0; border-bottom: 1px solid #E5E0D8; padding-bottom: 12px; }
    h2 { font-size: 19px; }
    h3 { font-size: 16px; }
    table { width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 13px; }
    th, td { border: 1px solid #DDD7CE; padding: 9px 12px; text-align: left; }
    th { background: #FAF8F5; font-weight: 600; }
    pre {
      background: #F6F4F0;
      border: 1px solid #E5E0D8;
      border-radius: 8px;
      padding: 14px;
      overflow-x: auto;
      font-family: "Cascadia Mono", Consolas, monospace;
      font-size: 12.5px;
    }
    code {
      font-family: "Cascadia Mono", Consolas, monospace;
      background: #F3EFEA;
      padding: 2px 5px;
      border-radius: 4px;
      font-size: 0.92em;
    }
    pre code { background: transparent; padding: 0; }
    blockquote {
      margin: 16px 0;
      padding-left: 16px;
      border-left: 1px solid #B8501E;
      color: #524E48;
    }
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;
}

async function renderHtmlToPdfBuffer(html: string): Promise<Buffer> {
  const pdfWin = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    await pdfWin.loadURL(dataUrl);
    const pdfBytes = await pdfWin.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
    });
    return Buffer.from(pdfBytes);
  } finally {
    if (!pdfWin.isDestroyed()) {
      pdfWin.destroy();
    }
  }
}

export function registerIpcHandlers(params: {
  getMainWindow: () => BrowserWindow | null;
  db: AuraDatabase;
  mcpManager: McpClientManager;
  safetyGate: SafetyGate;
  aiRouter: AiRouter;
}): void {
  const { getMainWindow, db, mcpManager, safetyGate, aiRouter } = params;

  const broadcast = (event: StreamEvent) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('auradesk:stream-event', event);
    }
  };

  safetyGate.onRequest((request) => {
    broadcast({ type: 'safety-request', request });
  });

  safetyGate.onResolved((requestId, decision) => {
    broadcast({ type: 'safety-resolved', requestId, decision });
  });

  ipcMain.handle('auradesk:bootstrap', (): AppBootstrapPayload => {
    return {
      settings: db.getSettings(),
      providers: db.listProviders(),
      conversations: db.listConversations(),
      allowedFolders: db.listAllowedFolders(),
      mcpServers: db.listMcpServers(),
      workflows: db.listWorkflows(),
      memories: db.listMemories(),
      artifacts: db.listArtifacts(),
    };
  });

  ipcMain.handle('auradesk:update-settings', (_evt, partial: Partial<AppSettings>) => {
    return db.updateSettings(partial);
  });

  ipcMain.handle('auradesk:verify-provider', async (_evt, input: VerifyProviderInput) => {
    return aiRouter.verifyAndSaveProvider(input);
  });

  ipcMain.handle('auradesk:disconnect-provider', (_evt, providerId: ProviderId) => {
    const cleared = db.clearProviderCredentials(providerId);
    const currentSettings = db.getSettings();
    if (currentSettings.activeProviderId === providerId && providerId !== 'demo') {
      const anotherVerified = db
        .listProviders()
        .find((p) => p.id !== providerId && p.isVerified && p.id !== 'demo');
      db.updateSettings({ activeProviderId: anotherVerified ? anotherVerified.id : 'demo' });
    }
    return cleared;
  });

  ipcMain.handle('auradesk:detect-ollama', async (_evt, customBaseUrl?: string) => {
    return detectLocalOllama(customBaseUrl);
  });

  ipcMain.handle(
    'auradesk:select-active-provider',
    (_evt, providerId: ProviderId, model?: string) => {
      if (model) {
        const existing = db.getProviderSecret(providerId).config;
        db.saveProviderCredentials({
          providerId,
          selectedModel: model,
          isVerified: existing.isVerified,
        });
      }
      return db.updateSettings({ activeProviderId: providerId });
    }
  );

  // Conversations & Streaming
  ipcMain.handle('auradesk:get-messages', (_evt, conversationId: string) => {
    return db.getMessages(conversationId);
  });

  ipcMain.handle(
    'auradesk:create-conversation',
    (_evt, title?: string, workflowId?: string | null) => {
      return db.createConversation(title, workflowId ?? null);
    }
  );

  ipcMain.handle('auradesk:rename-conversation', (_evt, id: string, title: string) => {
    return db.updateConversation(id, { title: title.trim() || 'Untitled Conversation' });
  });

  ipcMain.handle('auradesk:delete-conversation', (_evt, id: string) => {
    aiRouter.stopConversation(id);
    db.deleteConversation(id);
  });

  ipcMain.handle('auradesk:send-message', async (_evt, input: SendMessageInput) => {
    // Launch streaming asynchronously so IPC returns conversationId immediately
    let resolvedId = input.conversationId;
    if (!resolvedId) {
      const autoTitle =
        input.content.trim().slice(0, 52).replace(/\s+/g, ' ') ||
        input.attachments?.[0]?.name ||
        'New Conversation';
      const created = db.createConversation(autoTitle, input.workflowId ?? null);
      resolvedId = created.id;
    }

    void aiRouter.streamChatTurn({
      conversationId: resolvedId,
      content: input.content,
      attachments: input.attachments,
      workflowId: input.workflowId,
      emit: broadcast,
    });

    return { conversationId: resolvedId };
  });

  ipcMain.handle('auradesk:stop-generation', (_evt, conversationId: string) => {
    aiRouter.stopConversation(conversationId);
  });

  ipcMain.handle(
    'auradesk:resolve-safety',
    (_evt, requestId: string, decision: SafetyDecision) => {
      safetyGate.resolveRequest(requestId, decision);
    }
  );

  // Smart Folder Assistant
  ipcMain.handle('auradesk:pick-folder', async () => {
    const win = getMainWindow();
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: 'Choose a folder AuraDesk can see',
          buttonLabel: 'Share Folder with AuraDesk',
          properties: ['openDirectory', 'createDirectory'],
        })
      : await dialog.showOpenDialog({
          title: 'Choose a folder AuraDesk can see',
          properties: ['openDirectory', 'createDirectory'],
        });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return db.addAllowedFolder(result.filePaths[0], 'ask');
  });

  ipcMain.handle(
    'auradesk:update-folder-trust',
    (_evt, id: string, trustMode: FolderTrustMode) => {
      return db.updateFolderTrust(id, trustMode);
    }
  );

  ipcMain.handle('auradesk:remove-folder', (_evt, id: string) => {
    db.removeAllowedFolder(id);
  });

  // Document & PDF Analyst
  ipcMain.handle('auradesk:pick-documents', async () => {
    const win = getMainWindow();
    const options: Electron.OpenDialogOptions = {
      title: 'Select Documents to Analyze',
      buttonLabel: 'Attach to Chat',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Documents & Data',
          extensions: ['pdf', 'docx', 'csv', 'tsv', 'txt', 'md', 'json', 'html'],
        },
      ],
    };

    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) {
      return [];
    }

    const parsedList = [];
    for (const filePath of result.filePaths.slice(0, 6)) {
      const buffer = fs.readFileSync(filePath);
      const item = await parseDocumentBuffer({
        name: path.basename(filePath),
        buffer,
        filePath,
      });
      parsedList.push(item);
    }
    return parsedList;
  });

  ipcMain.handle(
    'auradesk:parse-dropped-document',
    async (
      _evt,
      payload: {
        name: string;
        mimeType: string;
        sizeBytes: number;
        base64Data: string;
        filePath?: string;
      }
    ) => {
      const buffer = Buffer.from(payload.base64Data, 'base64');
      return parseDocumentBuffer({
        name: payload.name,
        mimeType: payload.mimeType,
        buffer,
        filePath: payload.filePath,
      });
    }
  );

  // Visual MCP Store
  ipcMain.handle('auradesk:save-mcp-server', async (_evt, input: SaveMcpServerInput) => {
    const saved = db.saveMcpServer(input);
    if (saved.enabled) {
      await mcpManager.connectServer(saved.id);
    } else {
      await mcpManager.disconnectServer(saved.id);
    }
    return db.getMcpServerWithSecrets(saved.id).config;
  });

  ipcMain.handle('auradesk:toggle-mcp-server', async (_evt, id: string, enabled: boolean) => {
    db.updateMcpServerStatus(id, { enabled, lastStatus: enabled ? 'idle' : 'idle' });
    if (enabled) {
      await mcpManager.connectServer(id);
    } else {
      await mcpManager.disconnectServer(id);
      db.updateMcpServerStatus(id, { enabled: false, lastStatus: 'idle', lastError: null });
    }
    return db.getMcpServerWithSecrets(id).config;
  });

  ipcMain.handle('auradesk:test-mcp-server', async (_evt, id: string) => {
    return mcpManager.connectServer(id);
  });

  ipcMain.handle('auradesk:delete-mcp-server', async (_evt, id: string) => {
    await mcpManager.disconnectServer(id);
    db.deleteMcpServer(id);
  });

  // Live Visual Memory Board
  ipcMain.handle('auradesk:save-memory', (_evt, input: SaveMemoryInput) => {
    return db.saveMemory(input);
  });

  ipcMain.handle('auradesk:toggle-pin-memory', (_evt, id: string, pinned: boolean) => {
    const existing = db.listMemories().find((m) => m.id === id);
    if (!existing) throw new Error('Memory note not found');
    return db.saveMemory({
      id,
      content: existing.content,
      category: existing.category,
      colorTag: existing.colorTag,
      pinned,
      sourceConversationId: existing.sourceConversationId,
    });
  });

  ipcMain.handle('auradesk:delete-memory', (_evt, id: string) => {
    db.deleteMemory(id);
  });

  // 1-Click Workflow Studio
  ipcMain.handle('auradesk:save-workflow', (_evt, input: SaveWorkflowInput) => {
    return db.saveWorkflow(input);
  });

  ipcMain.handle('auradesk:delete-workflow', (_evt, id: string) => {
    db.deleteWorkflow(id);
  });

  // Split-View Artifact Canvas
  ipcMain.handle('auradesk:save-artifact', (_evt, input: SaveArtifactInput) => {
    return db.saveArtifact(input);
  });

  ipcMain.handle('auradesk:delete-artifact', (_evt, id: string) => {
    db.deleteArtifact(id);
  });

  ipcMain.handle(
    'auradesk:export-artifact',
    async (_evt, artifactId: string, format: ExportArtifactFormat): Promise<ExportArtifactResult> => {
      const artifact = db.getArtifact(artifactId);
      if (!artifact) {
        return { ok: false, message: 'Document could not be found.' };
      }

      const safeFileBase =
        artifact.title
          .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
          .replace(/\s+/g, '-')
          .slice(0, 60) || 'AuraDesk-Export';

      const extMap: Record<ExportArtifactFormat, { ext: string; label: string }> = {
        pdf: { ext: 'pdf', label: 'PDF Document' },
        markdown: { ext: 'md', label: 'Markdown Document' },
        html: { ext: 'html', label: 'Webpage (HTML)' },
      };

      const win = getMainWindow();
      const saveOpts: Electron.SaveDialogOptions = {
        title: `Export "${artifact.title}"`,
        defaultPath: `${safeFileBase}.${extMap[format].ext}`,
        filters: [{ name: extMap[format].label, extensions: [extMap[format].ext] }],
      };

      const saveRes = win
        ? await dialog.showSaveDialog(win, saveOpts)
        : await dialog.showSaveDialog(saveOpts);

      if (saveRes.canceled || !saveRes.filePath) {
        return { ok: false, canceled: true, message: 'Export canceled.' };
      }

      try {
        if (format === 'markdown') {
          fs.writeFileSync(saveRes.filePath, artifact.content, 'utf8');
        } else if (format === 'html') {
          const html = buildPrintableHtml(artifact);
          fs.writeFileSync(saveRes.filePath, html, 'utf8');
        } else {
          const html = buildPrintableHtml(artifact);
          const pdfBuffer = await renderHtmlToPdfBuffer(html);
          fs.writeFileSync(saveRes.filePath, pdfBuffer);
        }

        return {
          ok: true,
          savedPath: saveRes.filePath,
          message: `Saved to ${path.basename(saveRes.filePath)}`,
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : 'Could not export file.',
        };
      }
    }
  );

  // Native Window Controls (Windows 12 Pro Frameless Shell)
  ipcMain.handle('auradesk:window-minimize', () => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.minimize();
  });

  ipcMain.handle('auradesk:window-toggle-maximize', () => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return false;
    if (win.isMaximized()) {
      win.unmaximize();
      return false;
    }
    win.maximize();
    return true;
  });

  ipcMain.handle('auradesk:window-close', () => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.close();
  });

  ipcMain.handle('auradesk:window-is-maximized', () => {
    const win = getMainWindow();
    return Boolean(win && !win.isDestroyed() && win.isMaximized());
  });

  // Safe External URL opener
  ipcMain.handle('auradesk:open-external', async (_evt, rawUrl: string) => {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        await shell.openExternal(parsed.toString());
      }
    } catch {
      // Ignore malformed URLs safely
    }
  });
}
