import type { Migration } from '../migrate';

// ECR/payment-terminal support, adopted from ai-pos. Adds an audit log for
// terminal transactions and allows `payment_terminal` in hardware_devices.type.
// Terminal config lives in the existing hardware_devices registry (JSON
// connection_config with bank/port_path/baud_rate/ip/port). SQLite cannot ALTER
// a CHECK constraint, so hardware_devices is rebuilt with the extended type list.
export const migration0009Ecr: Migration = {
  id: '0009_ecr',
  up: (db) => {
    db.execute(`
      CREATE TABLE ecr_logs (
        id TEXT PRIMARY KEY,
        terminal_id TEXT,
        command TEXT NOT NULL,
        request_data TEXT,
        response_data TEXT,
        status TEXT NOT NULL CHECK (status IN ('info', 'approved', 'declined', 'error')),
        details TEXT,
        created_at TEXT NOT NULL
      )
    `);
    db.execute(`CREATE INDEX idx_ecr_logs_terminal ON ecr_logs(terminal_id, created_at)`);

    // Rebuild hardware_devices to accept type='payment_terminal'.
    const cols = db
      .query<{ name: string }>('PRAGMA table_info(hardware_devices)')
      .map((c) => c.name)
      .filter(Boolean);

    const hasPaymentTerminal = db
      .query<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'hardware_devices'")
      .some((r) => r.sql.includes("'payment_terminal'"));

    if (!hasPaymentTerminal && cols.length > 0) {
      // Rebuild via a scratch table, then rename IT into place. We never rename
      // hardware_devices itself, so other tables' FKs (hardware_logs.device_id,
      // hardware_templates.assigned_printer_id) keep resolving to the name
      // "hardware_devices" and are never aliased to a dropped temp table.
      db.execute(`
        CREATE TABLE hardware_devices_build (
          id TEXT PRIMARY KEY,
          uuid TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN (
            'receipt_printer', 'kitchen_printer', 'label_printer',
            'cash_drawer', 'scanner', 'terminal', 'payment_terminal',
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
      db.execute(
        `INSERT INTO hardware_devices_build (${cols.join(', ')}) SELECT ${cols.join(', ')} FROM hardware_devices`
      );
      db.execute('DROP TABLE hardware_devices');
      db.execute('ALTER TABLE hardware_devices_build RENAME TO hardware_devices');
      db.execute(`CREATE INDEX IF NOT EXISTS idx_hardware_devices_type ON hardware_devices(type)`);
      db.execute(`CREATE INDEX IF NOT EXISTS idx_hardware_devices_status ON hardware_devices(status)`);
    }
  },
};
