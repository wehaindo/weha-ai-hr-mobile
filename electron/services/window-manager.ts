// Window manager — main window (frameless) + generic secondary windows.
// All windows share the database in this process via the generic bridge.

import { app, BrowserWindow, screen } from 'electron';
import * as path from 'path';
import deviceConfig from '../../device.config';

const isDev = !app.isPackaged;

export interface SecondaryWindowOptions {
  width?: number;
  height?: number;
  fullscreen?: boolean;
  frame?: boolean;
}

let mainWindow: BrowserWindow | null = null;

function windowUrl(route: string): string {
  const normalized = route.startsWith('/') ? route : `/${route}`;
  if (isDev) return `http://localhost:${deviceConfig.port}${normalized}`;
  return `app://bundle${normalized}`;
}

function createWindow(route: string, options: SecondaryWindowOptions = {}): BrowserWindow {
  const win = new BrowserWindow({
    width: options.width ?? 1280,
    height: options.height ?? 800,
    frame: options.frame ?? false,
    titleBarStyle: options.frame ? 'default' : 'hidden',
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  const external = screen.getAllDisplays().find((d) => !d.internal);
  if (options.fullscreen && external) {
    const { x, y, width, height } = external.bounds;
    win.setBounds({ x, y, width, height });
    win.setFullScreen(true);
  }

  void win.loadURL(windowUrl(route));
  return win;
}

export function createMainWindow(): BrowserWindow {
  mainWindow = createWindow('/', { width: 1280, height: 800 });

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:state', { maximized: true });
  });
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:state', { maximized: false });
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
  return mainWindow;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function openSecondaryWindow(route: string, options: SecondaryWindowOptions = {}): void {
  createWindow(route, options);
}

/** Broadcast an event to every open window (renderer bridge `events.on`). */
export function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}
