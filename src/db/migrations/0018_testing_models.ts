import type { Migration } from '../migrate';

// Testing fixtures, adopted from weha-framework's "Testing module". A generic,
// seeded fixture set (products/orders/order-lines/lookups) for exercising the
// device framework's integration surfaces (per-entity sync, Data Hub, cloud
// orderline) against real rows. Adapted to framework conventions: SQLite, TEXT
// ids, ISO timestamps, money = INTEGER minor units, booleans = 0/1.
export const migration0018TestingModels: Migration = {
  id: '0018_testing_models',
  up: (db) => {
    db.execute(`
      CREATE TABLE test_products (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN ('RAW', 'FINISHED', 'SERVICE', 'DIGITAL')),
        price INTEGER NOT NULL DEFAULT 0,
        quantity INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        launched_at TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    db.execute(`CREATE INDEX idx_test_products_category ON test_products(category)`);
    db.execute(`CREATE INDEX idx_test_products_is_active ON test_products(is_active)`);

    db.execute(`
      CREATE TABLE test_orders (
        id TEXT PRIMARY KEY,
        reference TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK (status IN ('DRAFT', 'CONFIRMED', 'COMPLETED', 'CANCELLED')),
        customer_name TEXT NOT NULL,
        total INTEGER NOT NULL DEFAULT 0,
        ordered_at TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    db.execute(`CREATE INDEX idx_test_orders_status ON test_orders(status)`);

    db.execute(`
      CREATE TABLE test_order_lines (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES test_orders(id) ON DELETE CASCADE,
        sku TEXT NOT NULL,
        description TEXT,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price INTEGER NOT NULL DEFAULT 0,
        line_total INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    db.execute(`CREATE INDEX idx_test_order_lines_order ON test_order_lines(order_id)`);

    db.execute(`
      CREATE TABLE test_lookups (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  },
};
