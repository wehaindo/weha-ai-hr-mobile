// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createEngine, type DatabaseEngine } from '@/db/engine';
import { MemoryBlobStore } from '@/db/persistence';

async function makeEngine(store = new MemoryBlobStore()): Promise<{ engine: DatabaseEngine; store: MemoryBlobStore }> {
  const engine = await createEngine(store);
  return { engine, store };
}

describe('DatabaseEngine', () => {
  it('creates tables, inserts and queries rows mapped by column name', async () => {
    const { engine } = await makeEngine();
    engine.execute('CREATE TABLE t (id TEXT PRIMARY KEY, n INTEGER)');
    engine.execute('INSERT INTO t (id, n) VALUES (?, ?)', ['a', 1]);
    engine.execute('INSERT INTO t (id, n) VALUES (?, ?)', ['b', 2]);

    const rows = engine.query<{ id: string; n: number }>('SELECT id, n FROM t ORDER BY id');
    expect(rows).toEqual([
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
    ]);
  });

  it('maps rows by column name, resilient to column order', async () => {
    const { engine } = await makeEngine();
    engine.execute('CREATE TABLE t (a TEXT, b TEXT)');
    engine.execute('INSERT INTO t (a, b) VALUES (?, ?)', ['x', 'y']);
    engine.execute('ALTER TABLE t ADD COLUMN c TEXT');

    const rows = engine.query<Record<string, string>>('SELECT * FROM t');
    expect(rows[0]).toMatchObject({ a: 'x', b: 'y', c: null });
  });

  it('batch applies statements atomically and rolls back on failure', async () => {
    const { engine } = await makeEngine();
    engine.execute('CREATE TABLE t (id TEXT PRIMARY KEY)');
    engine.execute("INSERT INTO t (id) VALUES ('keep')");

    expect(() =>
      engine.batch([
        { sql: 'INSERT INTO t (id) VALUES (?)', params: ['one'] },
        { sql: 'INSERT INTO t (id) VALUES (?)', params: ['one'] }, // duplicate PK → fail
      ])
    ).toThrow();

    const rows = engine.query<{ id: string }>('SELECT id FROM t');
    expect(rows.map((r) => r.id)).toEqual(['keep']);
  });

  it('transaction commits on success and rolls back on throw', async () => {
    const { engine } = await makeEngine();
    engine.execute('CREATE TABLE t (id TEXT PRIMARY KEY)');

    const result = engine.transaction(() => {
      engine.execute("INSERT INTO t (id) VALUES ('a')");
      return 'ok';
    });
    expect(result).toBe('ok');

    expect(() =>
      engine.transaction(() => {
        engine.execute("INSERT INTO t (id) VALUES ('b')");
        throw new Error('boom');
      })
    ).toThrow('boom');

    expect(engine.query('SELECT id FROM t')).toEqual([{ id: 'a' }]);
  });

  it('persists through the blob store and reloads', async () => {
    const store = new MemoryBlobStore();
    const { engine } = await makeEngine(store);
    engine.execute('CREATE TABLE t (id TEXT PRIMARY KEY)');
    engine.execute("INSERT INTO t (id) VALUES ('persisted')");
    await engine.flush();
    engine.close();

    const { engine: reloaded } = await makeEngine(store);
    const rows = reloaded.query<{ id: string }>('SELECT id FROM t');
    expect(rows).toEqual([{ id: 'persisted' }]);
  });
});
