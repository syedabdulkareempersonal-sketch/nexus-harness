import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, shell } from 'electron';
import { AuraDatabase } from './db/database';
import { AiRouter } from './ai/router';
import { registerIpcHandlers } from './ipc';
import { McpClientManager } from './mcp/mcpManager';
import { SafetyGate } from './security/safetyGate';

let mainWindow: BrowserWindow | null = null;
let database: AuraDatabase | null = null;
let mcpManager: McpClientManager | null = null;

const isSmokeVerify = process.env.AURADESK_VERIFY_SMOKE === '1';
const smokeReportPath = process.env.AURADESK_SMOKE_REPORT || '';

function getIconPath(): string | undefined {
  const candidates = [
    path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    path.join(process.resourcesPath || '', 'icon.png'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

async function createMainWindow(): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    title: 'AuraDesk',
    backgroundColor: '#FAF8F5',
    icon: getIconPath(),
    autoHideMenuBar: true,
    show: !isSmokeVerify,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Intercept popups & external navigations safely
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        void shell.openExternal(parsed.toString());
      }
    } catch {
      // ignore invalid URL
    }
    return { action: 'deny' };
  });

  const consoleErrors: string[] = [];
  win.webContents.on('console-message', (event) => {
    const evt = event as unknown as { level?: string | number; message?: string };
    if (evt.level === 'error' || evt.level === 3) {
      consoleErrors.push(String(evt.message || 'Renderer error'));
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    await win.loadURL(devServerUrl);
  } else {
    const indexHtml = path.join(__dirname, '..', 'dist', 'index.html');
    await win.loadFile(indexHtml);
  }

  if (!isSmokeVerify) {
    win.show();
  } else {
    // Wait briefly for React hydration + IPC bootstrap(), then write verification report
    setTimeout(async () => {
      try {
        if (process.env.AURADESK_VERIFY_E2E === '1') {
          await win.webContents.executeJavaScript(`
            (async () => {
              await window.auradesk.verifyAndSaveProvider({ providerId: 'demo' });
              await window.auradesk.updateSettings({ onboardingCompleted: true, activeProviderId: 'demo' });
              window.location.reload();
            })()
          `);
          await new Promise((r) => setTimeout(r, 1200));
          await win.webContents.executeJavaScript(`
            (async () => {
              await window.auradesk.sendMessage({
                content: 'Hi! My name is Priya Nair and I prefer concise bullet summaries. Prepare a project brief.'
              });
            })()
          `);
          await new Promise((r) => setTimeout(r, 1800));
        }

        const domCheck = await win.webContents.executeJavaScript(`
          (async () => {
            const state = await window.auradesk.bootstrap();
            return {
              title: document.title,
              hasRootContent: Boolean(document.getElementById('root') && document.getElementById('root').innerHTML.length > 100),
              textPreview: document.body.innerText.slice(0, 400),
              bridgeAvailable: typeof window.auradesk === 'object',
              conversationsCount: state.conversations.length,
              artifactsCount: state.artifacts.length,
              memoriesCount: state.memories.length
            };
          })()
        `);
        if (smokeReportPath) {
          fs.writeFileSync(
            smokeReportPath,
            JSON.stringify(
              {
                ok: consoleErrors.length === 0 && domCheck.hasRootContent && domCheck.bridgeAvailable,
                consoleErrors,
                domCheck,
              },
              null,
              2
            ),
            'utf8'
          );
        }
      } catch (err) {
        if (smokeReportPath) {
          fs.writeFileSync(
            smokeReportPath,
            JSON.stringify({
              ok: false,
              error: err instanceof Error ? err.message : String(err),
              consoleErrors,
            }),
            'utf8'
          );
        }
      } finally {
        app.quit();
      }
    }, 1800);
  }

  win.on('closed', () => {
    mainWindow = null;
  });

  return win;
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock && !isSmokeVerify) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  void app.whenReady().then(async () => {
    const userDataDir = isSmokeVerify
      ? path.join(app.getPath('temp'), 'auradesk-smoke-profile')
      : app.getPath('userData');
    const dbPath = path.join(userDataDir, 'auradesk.sqlite');

    database = new AuraDatabase(dbPath);
    mcpManager = new McpClientManager(database);
    const safetyGate = new SafetyGate();
    const aiRouter = new AiRouter(database, mcpManager, safetyGate, async (fullPath) => {
      await shell.trashItem(fullPath);
    });

    registerIpcHandlers({
      getMainWindow: () => mainWindow,
      db: database,
      mcpManager,
      safetyGate,
      aiRouter,
    });

    mainWindow = await createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createMainWindow().then((w) => {
          mainWindow = w;
        });
      }
    });
  });
}

let shuttingDown = false;
app.on('before-quit', (event) => {
  if (shuttingDown) return;
  shuttingDown = true;
  event.preventDefault();
  void (async () => {
    try {
      await mcpManager?.shutdownAll();
    } finally {
      database?.close();
      app.exit(0);
    }
  })();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
