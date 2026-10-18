import type { Migration } from '../migrate';

// Hardware device registry + print templates + audit log, adopted from ai-pos.
// Device records are plain rows managed over bridge.db; only device I/O goes
// through the DeviceBridge hardware capability.
export const migration0005Hardware: Migration = {
  id: '0005_hardware',
  up: (db) => {
    db.execute(`
      CREATE TABLE hardware_devices (
        id TEXT PRIMARY KEY,
        uuid TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN (
          'receipt_printer', 'kitchen_printer', 'label_printer',
          'cash_drawer', 'scanner', 'terminal',
          'customer_display', 'kds_display', 'other'
        )),
        connection_type TEXT NOT NULL CHECK (connection_type IN (
          'usb', 'network', 'bluetooth', 'serial', 'cloud'
        )),
        connection_config TEXT NOT NULL DEFAULT '{}',
        capabilities TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN (
          'online', 'offline', 'error', 'busy', 'paused'
        )),
        last_seen_at TEXT,
        error_message TEXT,
        manufacturer TEXT,
        model TEXT,
        serial_number TEXT,
        firmware_version TEXT,
        is_default INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        assigned_to TEXT,
        location TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    db.execute(`CREATE INDEX idx_hardware_devices_type ON hardware_devices(type)`);
    db.execute(`CREATE INDEX idx_hardware_devices_status ON hardware_devices(status)`);

    db.execute(`
      CREATE TABLE hardware_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('receipt', 'label', 'ticket', 'report')),
        device_type TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        variables TEXT NOT NULL DEFAULT '[]',
        paper_width INTEGER NOT NULL DEFAULT 80,
        paper_height INTEGER,
        is_default INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        schema_version TEXT NOT NULL DEFAULT '1.0',
        template_json TEXT,
        assigned_printer_id TEXT REFERENCES hardware_devices(id),
        version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    db.execute(`CREATE INDEX idx_hardware_templates_type ON hardware_templates(type, is_active)`);

    db.execute(`
      CREATE TABLE hardware_logs (
        id TEXT PRIMARY KEY,
        device_id TEXT REFERENCES hardware_devices(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('success', 'error', 'warning')),
        message TEXT,
        details TEXT,
        created_at TEXT NOT NULL
      )
    `);
    db.execute(`CREATE INDEX idx_hardware_logs_created ON hardware_logs(created_at)`);
  },
};
