import type { Migration } from '../migrate';

// Sample transaction tables — the template a device app copies when it needs
// to record transactions (POS sales, orders, service tickets, …). The
// `sample_` prefix marks it as framework example data: rename the tables for
// your app. Follows framework conventions: SQLite, TEXT ids (16-char hex from
// generateId()), ISO-8601 timestamps, money = INTEGER minor units, booleans
// = 0/1. Header + lines with ON DELETE CASCADE, saved atomically via
// bridge.db.batch().
export const migration0021SampleTransactions: Migration = {
  id: '0021_sample_transactions',
  up: (db) => {
    db.execute(`
      CREATE TABLE sample_transactions (
        id TEXT PRIMARY KEY,
        reference TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK (status IN ('COMPLETED', 'CANCELLED')),
        customer_name TEXT,
        total INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    db.execute(`CREATE INDEX idx_sample_transactions_status ON sample_transactions(status)`);
    db.execute(`CREATE INDEX idx_sample_transactions_created_at ON sample_transactions(created_at)`);

    db.execute(`
      CREATE TABLE sample_transaction_lines (
        id TEXT PRIMARY KEY,
        transaction_id TEXT NOT NULL REFERENCES sample_transactions(id) ON DELETE CASCADE,
        description TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price INTEGER NOT NULL DEFAULT 0,
        line_total INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    db.execute(`CREATE INDEX idx_sample_transaction_lines_transaction ON sample_transaction_lines(transaction_id)`);
  },
};
