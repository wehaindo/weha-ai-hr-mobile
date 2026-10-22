import type { Migration } from '../migrate';

// Offline attendance queue (BRD FR-09): durable capture evidence + idempotent
// submission state. `payload` is immutable capture evidence; server-authoritative
// outcomes land in `status`/`attendance_type`/`rejection_reason`.
export const migration0026AttendanceQueue: Migration = {
  id: '0026_attendance_queue',
  up: (db) => {
    db.execute(`
      CREATE TABLE IF NOT EXISTS attendance_queue (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        method TEXT NOT NULL,
        payload TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'queued',
        attendance_type TEXT,
        rejection_reason TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        captured_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.execute(`CREATE INDEX IF NOT EXISTS idx_attendance_queue_status ON attendance_queue(status, id)`);
  },
};
