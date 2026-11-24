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
    width: 1400,
    height: 880,
    minWidth: 1020,
    minHeight: 660,
    title: 'AuraDesk',
    frame: process.platform === 'darwin',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    backgroundColor: '#ECF1F8',
    icon: getIconPath(),
    autoHideMenuBar: true,
    show: !isSmokeVerify,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: !isSmokeVerify,
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
          await new Promise((r) => setTimeout(r, 2400));
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
          const screenshotDir = process.env.AURADESK_SMOKE_SCREENSHOT_DIR;
          if (screenshotDir) {
            fs.mkdirSync(screenshotDir, { recursive: true });
            const workspaceShot = await win.webContents.capturePage();
            fs.writeFileSync(path.join(screenshotDir, 'win12-workspace.png'), workspaceShot.toPNG());

            // Open AI Engines modal and capture screenshot
            await win.webContents.executeJavaScript(`
              (() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const engineBtn = btns.find(b => b.textContent && b.textContent.includes('AI Engines'));
                if (engineBtn) engineBtn.click();
              })()
            `);
            await new Promise((r) => setTimeout(r, 400));
            const settingsShot = await win.webContents.capturePage();
            fs.writeFileSync(path.join(screenshotDir, 'win12-ai-engines.png'), settingsShot.toPNG());

            // Switch to Midnight Mica Dark Mode and capture screenshot
            await win.webContents.executeJavaScript(`
              (() => {
                const closeBtn = document.querySelector('button[aria-label="Close AI Engines dialog"]');
                if (closeBtn instanceof HTMLElement) closeBtn.click();
                document.documentElement.classList.add('dark');
              })()
            `);
            await new Promise((r) => setTimeout(r, 500));
            const darkShot = await win.webContents.capturePage();
            fs.writeFileSync(path.join(screenshotDir, 'win12-midnight.png'), darkShot.toPNG());
          }

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
