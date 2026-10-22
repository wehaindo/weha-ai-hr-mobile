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

/** Open display windows tracked by display id (for the navbar display toggles). */
const displayWindows = new Map<string, BrowserWindow>();

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

/**
 * Open a display window (fullscreen on an external display) tracked by id.
 * Reuses createWindow; focuses the existing window if already open.
 */
export function openDisplay(id: string, href: string): void {
  const existing = displayWindows.get(id);
  if (existing && !existing.isDestroyed()) {
    existing.focus();
    return;
  }
  const win = createWindow(href, { fullscreen: true, frame: false });
  displayWindows.set(id, win);
  win.on('closed', () => displayWindows.delete(id));
}

/** Close the display window for an id (no-op if not open). */
export function closeDisplay(id: string): void {
  const win = displayWindows.get(id);
  if (win && !win.isDestroyed()) win.close();
  displayWindows.delete(id);
}

/** Whether the display window for an id is open. */
export function isDisplayOpen(id: string): boolean {
  const win = displayWindows.get(id);
  return !!win && !win.isDestroyed();
}

/** Broadcast an event to every open window (renderer bridge `events.on`). */
export function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}
