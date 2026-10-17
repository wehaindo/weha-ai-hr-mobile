// Shared hardware/print types used by lib/print and lib/hardware.

export type HardwareDeviceType =
  | 'receipt_printer'
  | 'kitchen_printer'
  | 'label_printer'
  | 'cash_drawer'
  | 'scanner'
  | 'terminal'
  | 'customer_display'
  | 'kds_display'
  | 'other';

export type HardwareConnectionType = 'usb' | 'network' | 'bluetooth' | 'serial' | 'cloud';

export type HardwareDeviceStatus = 'online' | 'offline' | 'error' | 'busy' | 'paused';

export type HardwareProtocolType = 'printer' | 'terminal' | 'display' | 'scanner';

export type HardwareTemplateType = 'receipt' | 'label' | 'ticket' | 'report';

export interface HardwareDevice {
  id: string;
  uuid: string;
  name: string;
  type: HardwareDeviceType;
  connection_type: HardwareConnectionType;
  connection_config: string; // JSON string
  capabilities: string; // JSON string
  status: HardwareDeviceStatus;
  last_seen_at: string | null;
  error_message: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  firmware_version: string | null;
  is_default: number;
  is_active: number;
  assigned_to: string | null;
  location: string | null;
  created_at: string;
  updated_at: string;
}

export interface HardwareDeviceConfig {
  id: string;
  device_id: string;
  config_key: string;
  config_value: string | null;
  config_type: 'string' | 'number' | 'boolean' | 'json';
  created_at: string;
  updated_at: string;
}

export interface HardwareProtocol {
  id: string;
  code: string;
  name: string;
  type: HardwareProtocolType;
  description: string | null;
  config_schema: string; // JSON string
  command_templates: string; // JSON string
  is_system: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface HardwareTemplate {
  id: string;
  name: string;
  type: HardwareTemplateType;
  device_type: string;
  content: string;
  variables: string; // JSON string array
  paper_width: number;
  paper_height: number | null;
  is_default: number;
  is_active: number;
  created_at: string;
  updated_at: string;
  schema_version?: string;
}
