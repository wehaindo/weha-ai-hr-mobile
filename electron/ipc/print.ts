// Raw printer transport: TCP (port 9100 raw socket) primary, Windows driver fallback.

import { ipcMain } from 'electron';
import * as net from 'net';
import { sendToWindowsDriver } from '../services/windows-print';

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
