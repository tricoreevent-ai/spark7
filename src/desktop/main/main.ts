import { app, BrowserWindow, ipcMain } from 'electron';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { pathToFileURL } from 'url';

let mainWindow: BrowserWindow | null;
let packagedServerBootstrapped = false;
let desktopLogPath = '';

const SERVER_HOST = '127.0.0.1';
const SERVER_PORT = Number(process.env.PORT) || 3000;
const SERVER_URL = `http://${SERVER_HOST}:${SERVER_PORT}`;
const PACKAGED_CLIENT_URL = pathToFileURL(path.join(__dirname, '../../client/index.html')).toString();

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const setupDesktopLogging = () => {
  const logDir = path.join(app.getPath('userData'), 'logs');
  desktopLogPath = path.join(logDir, 'sarva-desktop.log');
  fs.mkdirSync(logDir, { recursive: true });

  const originalConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  const writeLog = (level: 'INFO' | 'WARN' | 'ERROR', args: unknown[]) => {
    const line = `[${new Date().toISOString()}] [${level}] ${args
      .map((value) => {
        if (value instanceof Error) return value.stack || value.message;
        if (typeof value === 'string') return value;
        try {
          return JSON.stringify(value);
        } catch {
          return String(value);
        }
      })
      .join(' ')}\n`;
    fs.appendFileSync(desktopLogPath, line, 'utf8');
  };

  console.log = (...args: unknown[]) => {
    writeLog('INFO', args);
    originalConsole.log(...args);
  };

  console.warn = (...args: unknown[]) => {
    writeLog('WARN', args);
    originalConsole.warn(...args);
  };

  console.error = (...args: unknown[]) => {
    writeLog('ERROR', args);
    originalConsole.error(...args);
  };

  console.log(`Desktop log file: ${desktopLogPath}`);
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const isServerReady = (): Promise<boolean> =>
  new Promise((resolve) => {
    const req = http.get(`${SERVER_URL}/api/health`, (res) => {
      res.resume();
      resolve((res.statusCode || 500) < 500);
    });

    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });

    req.on('error', () => resolve(false));
  });

const isFrontendServedByServer = (): Promise<boolean> =>
  new Promise((resolve) => {
    const req = http.get(SERVER_URL, (res) => {
      const contentType = String(res.headers['content-type'] || '').toLowerCase();
      res.resume();
      resolve((res.statusCode || 500) < 500 && contentType.includes('text/html'));
    });

    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });

    req.on('error', () => resolve(false));
  });

const waitForServer = async (timeoutMs = 20000): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isServerReady()) {
      return true;
    }
    await sleep(500);
  }
  return false;
};

const ensurePackagedServer = async (): Promise<string> => {
  if (await isServerReady()) {
    return SERVER_URL;
  }

  if (!packagedServerBootstrapped) {
    packagedServerBootstrapped = true;
    process.env.SERVE_CLIENT = 'true';
    const serverEntry = path.join(__dirname, '../../server/start.js');
    require(serverEntry);
  }

  const ready = await waitForServer();
  if (!ready) {
    throw new Error(`Local backend did not start on ${SERVER_URL} within 20 seconds.`);
  }

  return SERVER_URL;
};

async function createWindow() {
  const isDev = !app.isPackaged;
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  try {
    await mainWindow.loadURL('data:text/html;charset=utf-8,<html><body style="font-family:Segoe UI,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">Starting SPARK AI...</body></html>');

    const startUrl = isDev
      ? 'http://localhost:5173'
      : (await ensurePackagedServer(), (await isFrontendServedByServer()) ? SERVER_URL : PACKAGED_CLIENT_URL);

    await mainWindow.loadURL(startUrl);

    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  } catch (error) {
    const message = escapeHtml(error instanceof Error ? error.message : String(error));
    await mainWindow.loadURL(`data:text/html;charset=utf-8,<html><body style="font-family:Segoe UI,sans-serif;background:#0f172a;color:#fecaca;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;padding:24px;"><div><h2 style="margin:0 0 12px;">SPARK AI failed to start</h2><p style="margin:0;color:#e2e8f0;">${message}</p></div></body></html>`);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  setupDesktopLogging();
  void createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    void createWindow();
  }
});

// IPC handlers for cross-process communication
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-log-path', () => {
  return desktopLogPath;
});
