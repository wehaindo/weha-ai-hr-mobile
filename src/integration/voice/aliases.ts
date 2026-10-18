// Product alias service — a spoken name → target map for voice→product
// resolution, stored in product_aliases via the DeviceBridge. Generic: a device
// app resolves the `target` against its own catalog.

import type { DeviceBridge } from '@/platform';

function randomHex(len: number): string {
  const bytes = new Uint8Array(len / 2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function now(): string {
  return new Date().toISOString();
}

export interface ProductAliasRow {
  id: string;
  alias: string;
  target: string;
  created_at: string;
  updated_at: string;
}

export class ProductAliasService {
  constructor(private bridge: DeviceBridge) {}

  async list(): Promise<ProductAliasRow[]> {
    return this.bridge.db.query<ProductAliasRow>('SELECT * FROM product_aliases ORDER BY alias ASC');
  }

  async add(alias: string, target: string): Promise<void> {
    const trimmedAlias = alias.trim();
    const trimmedTarget = target.trim();
    if (!trimmedAlias || !trimmedTarget) throw new Error('Alias and target are required');

    // Upsert on the unique alias.
    const existing = await this.bridge.db.query<{ id: string }>('SELECT id FROM product_aliases WHERE alias = ?', [trimmedAlias]);
    if (existing.length > 0) {
      await this.bridge.db.execute('UPDATE product_aliases SET target = ?, updated_at = ? WHERE id = ?', [
        trimmedTarget,
        now(),
        existing[0].id,
      ]);
    } else {
      await this.bridge.db.execute('INSERT INTO product_aliases (id, alias, target, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [
        randomHex(16),
        trimmedAlias,
        trimmedTarget,
        now(),
        now(),
      ]);
    }
  }

  async remove(id: string): Promise<void> {
    await this.bridge.db.execute('DELETE FROM product_aliases WHERE id = ?', [id]);
  }

  /** Resolve a spoken phrase to a target via the alias map (exact, then prefix). */
  async resolve(phrase: string): Promise<string | null> {
    const exact = await this.bridge.db.query<{ target: string }>('SELECT target FROM product_aliases WHERE alias = ? LIMIT 1', [
      phrase.trim().toLowerCase(),
    ]);
    if (exact[0]) return exact[0].target;

    const prefix = await this.bridge.db.query<{ target: string }>(
      'SELECT target FROM product_aliases WHERE ? LIKE alias || \'%\' LIMIT 1',
      [phrase.trim().toLowerCase()]
    );
    return prefix[0]?.target ?? null;
  }
}
