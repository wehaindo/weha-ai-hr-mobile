import type { Migration } from '../migrate';

// Sample attendance events — the template a device app copies when it needs to
// record check-in / check-out punches. The `sample_` prefix marks it as framework
// example data: rename the table for your app. Follows framework conventions:
// TEXT ids (16-char hex from generateId()), ISO-8601 UTC timestamps, booleans =
// 0/1. Each row is one event; the device's current state ("in" vs "out") is
// derived from the most recent event for that user (see src/lib/attendance/status.ts).
// `sync_status` tracks the punch's server round-trip (pending → sending →
// processing → synced | failed) and `server_ref` holds the server-assigned
// reference on success — so an unsent punch stays visible after a crash.
export const migration0026SampleAttendance: Migration = {
  id: '0026_sample_attendance',
  up: (db) => {
    db.execute(`
      CREATE TABLE sample_attendance (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        user_name TEXT,
        action TEXT NOT NULL CHECK (action IN ('CHECK_IN', 'CHECK_OUT')),
        recorded_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        server_ref TEXT
      )
    `);
    db.execute(
      `CREATE INDEX idx_sample_attendance_user_recorded ON sample_attendance(user_id, recorded_at)`
    );
    db.execute(`CREATE INDEX idx_sample_attendance_recorded ON sample_attendance(recorded_at)`);
  },
};
