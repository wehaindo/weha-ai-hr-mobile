import type { DeviceBridge } from '@/platform';

// Runtime seed for the framework's example integrations (migrations stay schema
// only, so tests that build a fresh DB aren't polluted with seed rows). Runs
// idempotently at sync boot.

// Same entity id the Testing module's `seedTestIntegrations` uses, so if both
// ever run they resolve to one row instead of colliding on entity_type (UNIQUE).
const PRODUCT_ENTITY_ID = 'int-test_products';

/**
 * Seed the "Products (WEHA)" device-auth integration — pulls Products from the
 * framework's external API (`GET /api/device/PRODUCT`) using the activated
 * device token + tenant. Skips when a `test_products` integration already exists.
 *
 * Field maps target the framework's default `Product` shape (no `responseMapping`);
 * if the tenant's PRODUCT config renames fields, adjust them in Integrations → Fields.
 */
export async function seedProductIntegration(bridge: DeviceBridge): Promise<void> {
  const existing = await bridge.db.query<{ id: string }>(
    "SELECT id FROM integration_entities WHERE entity_type = 'test_products'"
  );
  if (existing.length > 0) return;

  const now = new Date().toISOString();
  await bridge.db.execute(
    `INSERT INTO integration_entities
       (id, entity_type, name, type, status, base_url, api_key, sync_source, endpoint, sync_direction, schedule, page_size, enabled, created_at, updated_at)
     VALUES (?, 'test_products', 'Products (WEHA)', 'rest', 'idle', '', NULL, 'device', 'PRODUCT', 'pull', '5m', 100, 1, ?, ?)`,
    [PRODUCT_ENTITY_ID, now, now]
  );

  // local column ← external field (pull direction).
  const fieldMaps: Array<[source: string, target: string]> = [
    ['code', 'sku'],
    ['name', 'name'],
    ['price', 'salePrice'],
    ['is_active', 'isActive'],
    ['notes', 'description'],
  ];
  for (const [source, target] of fieldMaps) {
    await bridge.db.execute(
      `INSERT INTO integration_field_maps
         (id, integration_entity_id, entity_type, source_field, target_field, direction, created_at, updated_at)
       VALUES (?, ?, 'test_products', ?, ?, 'pull', ?, ?)`,
      [`fm-product-${source}`, PRODUCT_ENTITY_ID, source, target, now, now]
    );
  }
}

interface IdentitySeed {
  entityType: string;
  entityId: string;
  name: string;
  /** Backend external-API config code (see weha-framework seed:device-sync). */
  configCode: string;
  /** local column ← external field. `updatedAt` is omitted on purpose — the
   *  write path owns `updated_at`, and mapping it would duplicate the column. */
  fieldMaps: Array<[source: string, target: string]>;
}

const IDENTITY_SEEDS: IdentitySeed[] = [
  {
    entityType: 'employees',
    entityId: 'int-employees',
    name: 'Employees (WEHA)',
    configCode: 'EMPLOYEES',
    fieldMaps: [
      ['id', 'id'],
      ['employee_id', 'employeeId'],
      ['first_name', 'firstName'],
      ['last_name', 'lastName'],
      ['name', 'name'],
      ['email', 'email'],
      ['phone', 'phone'],
      ['position', 'position'],
      ['status', 'status'],
      ['is_active', 'isActive'],
      ['role', 'role'],
      ['department', 'department'],
      ['device_pin_hash', 'devicePinHash'],
    ],
  },
  {
    entityType: 'portal_users',
    entityId: 'int-portal_users',
    name: 'Portal Users (WEHA)',
    configCode: 'PORTAL_USERS',
    fieldMaps: [
      ['id', 'id'],
      ['email', 'email'],
      ['name', 'name'],
      ['phone', 'phone'],
      ['employee_id', 'employeeId'],
      ['is_active', 'isActive'],
      ['first_name', 'firstName'],
      ['last_name', 'lastName'],
      ['position', 'position'],
      ['password_hash', 'passwordHash'],
    ],
  },
];

/**
 * Seed the device-sync identity integrations (EMPLOYEES + PORTAL_USERS) —
 * device-auth pulls from `GET /api/device/{code}`. Idempotent: skips any
 * entity_type that already exists. Field maps mirror the backend configs'
 * `responseMapping`.
 */
export async function seedIdentityIntegrations(bridge: DeviceBridge): Promise<void> {
  for (const seed of IDENTITY_SEEDS) {
    const existing = await bridge.db.query<{ id: string }>(
      'SELECT id FROM integration_entities WHERE entity_type = ?',
      [seed.entityType]
    );
    if (existing.length > 0) continue;

    const now = new Date().toISOString();
    await bridge.db.execute(
      `INSERT INTO integration_entities
         (id, entity_type, name, type, status, base_url, api_key, sync_source, endpoint, sync_direction, schedule, page_size, enabled, created_at, updated_at)
       VALUES (?, ?, ?, 'rest', 'idle', '', NULL, 'device', ?, 'pull', '5m', 100, 1, ?, ?)`,
      [seed.entityId, seed.entityType, seed.name, seed.configCode, now, now]
    );

    for (const [source, target] of seed.fieldMaps) {
      await bridge.db.execute(
        `INSERT INTO integration_field_maps
           (id, integration_entity_id, entity_type, source_field, target_field, direction, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'pull', ?, ?)`,
        [`fm-${seed.entityType}-${source}`, seed.entityId, seed.entityType, source, target, now, now]
      );
    }
  }
}
