// Raw printer transport: TCP (port 9100 raw socket) primary, Windows driver fallback.

import { ipcMain } from 'electron';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';

function sendRawTcp(target: string, bytes: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const [host, portRaw] = target.split(':');
    const port = Number(portRaw ?? 9100);
    const socket = net.createConnection({ host, port }, () => {
      socket.write(Buffer.from(bytes));
      socket.end();
    });
    socket.setTimeout(10000, () => {
      socket.destroy();
      reject(new Error(`Printer timeout: ${target}`));
    });
    socket.on('error', (err) => reject(err));
    socket.on('close', (hadError) => {
      if (!hadError) resolve();
    });
  });
}

function sendToWindowsDriver(printerName: string, bytes: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(os.tmpdir(), `print-${Date.now()}.prn`);
    fs.writeFileSync(tmpFile, Buffer.from(bytes));
    const ps = `Get-Content -LiteralPath '${tmpFile}' -AsByteStream | Out-Printer -Name '${printerName.replace(/'/g, "''")}'`;
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], (err) => {
      fs.unlink(tmpFile, () => {});
      if (err) reject(err);
      else resolve();
    });
  });
}

export function registerPrintIpc(): void {
  ipcMain.handle('print:raw', async (_event, payload: { target: string; bytes: Uint8Array }) => {
    const bytes = Uint8Array.from(payload.bytes);
    // host:port targets go over raw TCP; anything else is treated as a Windows printer name.
    if (payload.target.includes(':')) {
      await sendRawTcp(payload.target, bytes);
    } else {
      await sendToWindowsDriver(payload.target, bytes);
    }
  });
}
