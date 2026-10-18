// Printer adapter — resolves connection config from a hardware device and
// dispatches bytes over the DeviceBridge. Bytes are compiled in the renderer
// (see escpos-buffer.ts / receipt-renderer.ts); this module only routes them.

import type { DeviceBridge } from '@/platform';
import { buildEscPosBytes, DRAWER_COMMAND, type PrintContentItem } from './escpos-buffer';

export type ConnectionType = 'serial' | 'network' | 'windows';

export interface PrinterConnectionConfig {
  type: ConnectionType;
  port_path?: string;
  baud_rate?: number;
  ip?: string;
  port?: number;
  timeout_ms?: number;
  system_name?: string;
}

export interface PrintResult {
  success: boolean;
  error?: string;
  printer_id: string;
  connection_type: ConnectionType;
  timestamp: string;
}

export interface PrinterCapabilities {
  supports_barcode: boolean;
  supports_qrcode: boolean;
  supports_image: boolean;
  supports_graphics: boolean;
  max_width_chars: number;
  paper_width_mm: number;
  dpi: number;
}

const DEFAULT_CAPABILITIES: Record<number, PrinterCapabilities> = {
  58: { supports_barcode: true, supports_qrcode: false, supports_image: false, supports_graphics: false, max_width_chars: 28, paper_width_mm: 58, dpi: 203 },
  76: { supports_barcode: true, supports_qrcode: false, supports_image: false, supports_graphics: false, max_width_chars: 36, paper_width_mm: 76, dpi: 203 },
  80: { supports_barcode: true, supports_qrcode: true, supports_image: true, supports_graphics: true, max_width_chars: 42, paper_width_mm: 80, dpi: 203 },
  112: { supports_barcode: true, supports_qrcode: true, supports_image: true, supports_graphics: true, max_width_chars: 56, paper_width_mm: 112, dpi: 203 },
};

/** Build the bridge `print.raw` target for a connection config. */
export function targetFromConnection(config: PrinterConnectionConfig): string {
  switch (config.type) {
    case 'network':
      return `${config.ip ?? ''}:${config.port ?? 9100}`;
    case 'serial':
      // Serial is dispatched via bridge.hardware.serial, not a target string.
      return `serial:${config.port_path ?? ''}@${config.baud_rate ?? 9600}`;
    case 'windows':
    default:
      return config.system_name ?? '';
  }
}

export class PrinterAdapter {
  /** Printer capabilities for a paper width. */
  static getCapabilities(paperWidthMm: number): PrinterCapabilities {
    return DEFAULT_CAPABILITIES[paperWidthMm] || DEFAULT_CAPABILITIES[80];
  }

  /** Resolve a connection config from a hardware device record. */
  static resolveConnection(connectionType: string, connectionConfig: string): PrinterConnectionConfig {
    try {
      const config = JSON.parse(connectionConfig);
      switch (connectionType) {
        case 'serial':
        case 'bluetooth':
          return { type: 'serial', port_path: config.port_path, baud_rate: config.baud_rate || 9600 };
        case 'network':
          return { type: 'network', ip: config.ip, port: config.port || 9100, timeout_ms: config.timeout_ms || 10000 };
        case 'usb':
          return { type: 'windows', system_name: config.system_name };
        default:
          return { type: 'windows', system_name: config.system_name };
      }
    } catch {
      return { type: 'windows' };
    }
  }

  /** Dispatch a compiled content array to a connection via the bridge. */
  static async print(
    bridge: DeviceBridge,
    content: PrintContentItem[],
    connection: PrinterConnectionConfig,
    options?: { printer_id?: string }
  ): Promise<PrintResult> {
    const timestamp = new Date().toISOString();
    try {
      const bytes = buildEscPosBytes(content);
      await dispatchBytes(bridge, bytes, connection);
      return { success: true, printer_id: options?.printer_id || 'unknown', connection_type: connection.type, timestamp };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        printer_id: options?.printer_id || 'unknown',
        connection_type: connection.type,
        timestamp,
      };
    }
  }

  /** Dispatch raw ZPL code to a (Zebra) connection via the bridge. */
  static async printZpl(
    bridge: DeviceBridge,
    zplCode: string,
    connection: PrinterConnectionConfig,
    options?: { printer_id?: string }
  ): Promise<PrintResult> {
    const timestamp = new Date().toISOString();
    const encoder = new TextEncoder();
    try {
      await dispatchBytes(bridge, encoder.encode(zplCode), connection);
      return { success: true, printer_id: options?.printer_id || 'unknown', connection_type: connection.type, timestamp };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        printer_id: options?.printer_id || 'unknown',
        connection_type: connection.type,
        timestamp,
      };
    }
  }

  /** Open a cash drawer attached to a printer connection. */
  static async openDrawer(bridge: DeviceBridge, connection: PrinterConnectionConfig): Promise<PrintResult> {
    const timestamp = new Date().toISOString();
    try {
      await dispatchBytes(bridge, DRAWER_COMMAND, connection);
      return { success: true, printer_id: 'drawer', connection_type: connection.type, timestamp };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        printer_id: 'drawer',
        connection_type: connection.type,
        timestamp,
      };
    }
  }
}

/** Route compiled bytes to the right bridge capability by connection type. */
async function dispatchBytes(
  bridge: DeviceBridge,
  bytes: Uint8Array,
  connection: PrinterConnectionConfig
): Promise<void> {
  if (connection.type === 'serial') {
    await bridge.hardware.serial({ port_path: connection.port_path ?? '', baud_rate: connection.baud_rate }, bytes);
    return;
  }
  await bridge.print.raw(targetFromConnection(connection), bytes);
}
