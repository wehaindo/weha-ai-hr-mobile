// Hardware device I/O for the main process: cash drawer, serial/USB send,
// device discovery, and connectivity probes. This is the main-process half of
// the DeviceBridge `hardware` capability — device *records* live in the DB and
// are managed over bridge.db; only real I/O lives here.

import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';

// ESC/POS cash-drawer pulse: ESC p 0 25 255 (drawer 1, 25/255 pulse width).
export const DRAWER_COMMAND = Uint8Array.from([0x1b, 0x70, 0x00, 0x19, 0xff]);

export interface DiscoveredDevice {
  name: string;
  port_path?: string;
  system_name?: string;
  vid?: string;
  pid?: string;
}

export interface SerialTarget {
  port_path: string;
  baud_rate?: number;
}

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

/** Send bytes to a driver/TCP target, choosing the transport by target shape. */
function sendToTarget(target: string, bytes: Uint8Array): Promise<void> {
  return target.includes(':') ? sendRawTcp(target, bytes) : sendToWindowsDriver(target, bytes);
}

// serialport is an optional native dependency. If it isn't installed we throw a
// clear, actionable error instead of crashing the main process.
function loadSerialport(): {
  SerialPort: new (opts: { path: string; baudRate: number }) => {
    open(): void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(event: string, cb: (...args: any[]) => void): void;
    write(data: Uint8Array, cb?: (err?: Error) => void): void;
    close(cb?: (err?: Error) => void): void;
  };
  list(): Promise<Array<{ path: string; manufacturer?: string; serialNumber?: string; vendorId?: string; productId?: string }>>;
} | null {
  try {
    // Optional native dependency — not installed in every build.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('serialport');
  } catch {
    return null;
  }
}

function sendSerial(target: SerialTarget, bytes: Uint8Array): Promise<void> {
  const mod = loadSerialport();
  if (!mod) {
    return Promise.reject(
      new Error('Serial printing requires the optional "serialport" package (npm i serialport). TCP and Windows-driver targets work without it.')
    );
  }
  return new Promise((resolve, reject) => {
    const port = new mod.SerialPort({ path: target.port_path, baudRate: target.baud_rate ?? 9600 });
    let settled = false;
    const fail = (err: Error) => {
      if (!settled) {
        settled = true;
        try {
          port.close(() => {});
        } catch {
          /* ignore */
        }
        reject(err);
      }
    };
    port.on('error', (err: unknown) => fail(err instanceof Error ? err : new Error(String(err))));
    port.on('open', () => {
      port.write(bytes, (err) => {
        if (err) fail(err ?? new Error('Serial write failed'));
        else {
          settled = true;
          port.close(() => resolve());
        }
      });
    });
  });
}

function listSerialPorts(): Promise<DiscoveredDevice[]> {
  const mod = loadSerialport();
  if (!mod) return Promise.resolve([]);
  return mod
    .list()
    .then((ports) =>
      ports.map((p) => ({
        name: p.path,
        port_path: p.path,
        manufacturer: p.manufacturer,
        vid: p.vendorId,
        pid: p.productId,
      })) as unknown as DiscoveredDevice[]
    )
    .catch(() => []);
}

function listWindowsPrinters(): Promise<DiscoveredDevice[]> {
  if (process.platform !== 'win32') return Promise.resolve([]);
  return new Promise((resolve) => {
    const ps = 'Get-Printer | Select-Object -ExpandProperty Name';
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], (err, stdout) => {
      if (err) return resolve([]);
      const names = stdout
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      resolve(names.map((name) => ({ name, system_name: name })));
    });
  });
}

function testTarget(target: string): Promise<{ ok: boolean; message?: string }> {
  // Serial path: COMx or /dev/* → try to open the port.
  if (/^COM\d+$/i.test(target) || target.startsWith('/dev/')) {
    const mod = loadSerialport();
    if (!mod) return Promise.resolve({ ok: false, message: 'Serial test requires the optional "serialport" package.' });
    return new Promise((resolve) => {
      const port = new mod.SerialPort({ path: target, baudRate: 9600 });
      const done = (ok: boolean, message: string) => {
        try {
          port.close(() => resolve({ ok, message }));
        } catch {
          resolve({ ok, message });
        }
      };
      port.on('open', () => done(true, `Opened ${target}`));
      port.on('error', (err: unknown) => resolve({ ok: false, message: err instanceof Error ? err.message : String(err) }));
    });
  }

  // TCP target: attempt a short connection.
  if (target.includes(':')) {
    return new Promise((resolve) => {
      const [host, portRaw] = target.split(':');
      const port = Number(portRaw ?? 9100);
      const socket = net.createConnection({ host, port });
      const finish = (ok: boolean, message: string) => {
        socket.destroy();
        resolve({ ok, message });
      };
      socket.setTimeout(5000, () => finish(false, `Timeout connecting to ${target}`));
      socket.on('connect', () => finish(true, `Connected to ${host}:${port}`));
      socket.on('error', (err) => resolve({ ok: false, message: err.message }));
    });
  }

  // Windows driver name: check it exists in the printer list.
  return listWindowsPrinters().then((printers) => {
    const found = printers.some((p) => p.system_name === target);
    return found
      ? { ok: true, message: `Printer "${target}" found` }
      : { ok: false, message: `Printer "${target}" not found` };
  });
}

// ETX (0x03) terminates an ECR/EDC response packet.
const ETX = 0x03;

/** Send bytes over TCP and read until an ETX-delimited packet is complete. */
function exchangeTcp(ip: string, port: number, bytes: Uint8Array, timeoutMs: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: ip, port });
    let buffer = Buffer.alloc(0);
    let settled = false;

    const finish = (err?: Error, packet?: Buffer) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve(Uint8Array.from(packet!));
    };

    socket.on('connect', () => socket.write(Buffer.from(bytes)));
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const etx = buffer.indexOf(ETX);
      if (etx !== -1) finish(undefined, buffer.subarray(0, etx + 1));
    });
    socket.on('error', (err) => finish(err));
    socket.setTimeout(timeoutMs, () => finish(new Error(`ECR exchange timeout (${ip}:${port})`)));
  });
}

/** Send bytes over serial and read until an ETX-delimited packet is complete. */
function exchangeSerial(target: SerialTarget, bytes: Uint8Array, timeoutMs: number): Promise<Uint8Array> {
  const mod = loadSerialport();
  if (!mod) {
    return Promise.reject(
      new Error('Serial exchange requires the optional "serialport" package (npm i serialport).')
    );
  }
  return new Promise((resolve, reject) => {
    const port = new mod.SerialPort({ path: target.port_path, baudRate: target.baud_rate ?? 9600 });
    let buffer = Buffer.alloc(0);
    let settled = false;

    const finish = (err?: Error, packet?: Buffer) => {
      if (settled) return;
      settled = true;
      try {
        port.close(() => {});
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else resolve(Uint8Array.from(packet!));
    };

    port.on('error', (err: unknown) => finish(err instanceof Error ? err : new Error(String(err))));
    port.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      const etx = buffer.indexOf(ETX);
      if (etx !== -1) finish(undefined, buffer.subarray(0, etx + 1));
    });
    port.on('open', () => {
      port.write(bytes, (err) => {
        if (err) finish(err ?? new Error('Serial write failed'));
      });
    });
    setTimeout(() => finish(new Error(`ECR serial exchange timeout (${target.port_path})`)), timeoutMs);
  });
}

export const hardwareService = {
  async openDrawer(target: string): Promise<void> {
    await sendToTarget(target, DRAWER_COMMAND);
  },
  async serial(target: SerialTarget, bytes: Uint8Array): Promise<void> {
    await sendSerial(target, Uint8Array.from(bytes));
  },
  async discover(): Promise<DiscoveredDevice[]> {
    const [serial, printers] = await Promise.all([listSerialPorts(), listWindowsPrinters()]);
    return [...serial, ...printers];
  },
  async test(target: string): Promise<{ ok: boolean; message?: string }> {
    return testTarget(target);
  },
  async exchange(
    target: SerialTarget | { ip: string; port: number },
    bytes: Uint8Array,
    options?: { timeoutMs?: number }
  ): Promise<Uint8Array> {
    const timeoutMs = options?.timeoutMs ?? 60000;
    if ('port_path' in target) return exchangeSerial(target, Uint8Array.from(bytes), timeoutMs);
    return exchangeTcp(target.ip, target.port, Uint8Array.from(bytes), timeoutMs);
  },
};
