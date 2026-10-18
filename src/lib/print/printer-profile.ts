// Printer profile — type definitions & lookup helpers.

import type { HardwareDevice } from '@/types';

export type PrinterProtocol = 'escpos' | 'star' | 'epson' | 'zpl';
export type PrinterConnection = 'usb' | 'network' | 'bluetooth' | 'serial';

/** A printer profile derived from a hardware device (paper width, dpi, caps). */
export interface DevicePrinterProfile {
  id: string;
  name: string;
  device_id: string;
  paper_width_mm: number;
  dpi: number;
  protocol: PrinterProtocol;
  connection: PrinterConnection;
  supports_barcode: boolean;
  supports_qrcode: boolean;
  supports_image: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

const DEFAULT_PROFILES: Record<number, Partial<DevicePrinterProfile>> = {
  58: { paper_width_mm: 58, dpi: 203, protocol: 'escpos', supports_barcode: true, supports_qrcode: false, supports_image: false },
  76: { paper_width_mm: 76, dpi: 203, protocol: 'escpos', supports_barcode: true, supports_qrcode: false, supports_image: false },
  80: { paper_width_mm: 80, dpi: 203, protocol: 'escpos', supports_barcode: true, supports_qrcode: true, supports_image: true },
  112: { paper_width_mm: 112, dpi: 203, protocol: 'escpos', supports_barcode: true, supports_qrcode: true, supports_image: true },
};

export class PrinterProfileManager {
  /** Default profile settings for a paper width. */
  static getDefaultProfile(paperWidthMm: number): Partial<DevicePrinterProfile> {
    return DEFAULT_PROFILES[paperWidthMm] || DEFAULT_PROFILES[80];
  }

  /** Create a printer profile from a hardware device record. */
  static fromHardwareDevice(device: HardwareDevice, paperWidthMm?: number): DevicePrinterProfile {
    const config = JSON.parse(device.connection_config || '{}');
    const width = paperWidthMm || config.paper_width || 80;
    const defaults = this.getDefaultProfile(width);

    return {
      id: `pp_${device.id}`,
      name: device.name,
      device_id: device.id,
      paper_width_mm: width,
      dpi: defaults.dpi || 203,
      protocol: defaults.protocol || 'escpos',
      connection: device.connection_type as PrinterConnection,
      supports_barcode: defaults.supports_barcode ?? true,
      supports_qrcode: defaults.supports_qrcode ?? false,
      supports_image: defaults.supports_image ?? false,
      is_default: device.is_default === 1,
      created_at: device.created_at,
      updated_at: device.updated_at,
    };
  }

  /** Connection details for printing. */
  static getConnectionDetails(device: HardwareDevice): {
    type: 'serial' | 'network' | 'windows';
    port_path?: string;
    baud_rate?: number;
    ip?: string;
    port?: number;
    system_name?: string;
  } {
    const config = JSON.parse(device.connection_config || '{}');

    switch (device.connection_type) {
      case 'serial':
      case 'bluetooth':
        return { type: 'serial', port_path: config.port_path, baud_rate: config.baud_rate || 9600 };
      case 'network':
        return { type: 'network', ip: config.ip, port: config.port || 9100 };
      case 'usb':
        return { type: 'windows', system_name: config.system_name };
      default:
        return { type: 'windows', system_name: config.system_name };
    }
  }

  /** Whether a device looks like a Zebra (ZPL) printer. */
  static isZplPrinter(device: HardwareDevice): boolean {
    const model = (device.model || '').toLowerCase();
    const manufacturer = (device.manufacturer || '').toLowerCase();
    return model.includes('zebra') || manufacturer.includes('zebra') || model.startsWith('zd') || model.startsWith('zt');
  }

  /** Recommended paper width for a printer model. */
  static getRecommendedPaperWidth(device: HardwareDevice): number {
    const model = (device.model || '').toLowerCase();
    if (model.includes('58') || model.includes('32')) return 58;
    if (model.includes('76')) return 76;
    if (model.includes('112')) return 112;
    return 80;
  }
}
