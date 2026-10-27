// Shared sql.js database engine — runs in the Electron main process and in the
// renderer (web / Capacitor). Rows are ALWAYS mapped by column name (getAsObject),
// never by position, so ALTER TABLE migrations stay safe.

import initSqlJs, { type BindParams, type Database, type SqlJsStatic } from 'sql.js';

export interface BlobStore {
  load(): Promise<Uint8Array | null>;
  save(data: Uint8Array): Promise<void>;
}

/** Minimal browser surface used to flush on page hide — typed structurally so
 * this file still compiles in the Electron main process (no DOM lib). */
interface BrowserGlobals {
  window?: { addEventListener(type: string, listener: () => void): void };
  document?: {
    addEventListener(type: string, listener: () => void): void;
    visibilityState: string;
  };
}
const browser = globalThis as unknown as BrowserGlobals;

export interface SqlStatement {
  sql: string;
  params?: unknown[];
}

export interface DatabaseEngine {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[];
  execute(sql: string, params?: unknown[]): void;
  /** Atomically apply several statements (no interactive reads inside). */
  batch(statements: SqlStatement[]): void;
  /** Interactive transaction — only valid in-process (migrations/seeds/tests). */
  transaction<T>(fn: () => T): T;
  /** Persist immediately and return the current snapshot. */
  flush(): Promise<Uint8Array>;
  close(): void;
}

let sqlModule: SqlJsStatic | null = null;

export async function loadSqlJs(locateFile?: (file: string) => string): Promise<SqlJsStatic> {
  if (!sqlModule) {
    sqlModule = await initSqlJs(locateFile ? { locateFile } : undefined);
  }
  return sqlModule;
}

const SAVE_DEBOUNCE_MS = 400;

export async function createEngine(
  store: BlobStore,
  locateFile?: (file: string) => string
): Promise<DatabaseEngine> {
  const SQL = await loadSqlJs(locateFile);
  const existing = await store.load();
  const db: Database = existing ? new SQL.Database(existing) : new SQL.Database();

  db.run('PRAGMA foreign_keys = ON;');

  let dirty = false;
  let saving: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const persist = (): Promise<void> => {
    if (saving) {
      return saving.then(() => (dirty ? persist() : undefined));
    }
    if (!dirty) return Promise.resolve();
    dirty = false;
    const data = db.export();
    saving = store.save(data).catch((err) => {
      dirty = true;
      throw err;
    }).finally(() => {
      saving = null;
    });
    return saving;
  };

  const scheduleSave = () => {
    dirty = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      persist().catch((err) => console.error('[db] persist failed:', err));
    }, SAVE_DEBOUNCE_MS);
  };

  // Persist pending writes before the page goes away: the debounce timer dies
  // with the page context, so a reload right after a write (e.g. the
  // mobile_auth_sessions row written at login) would otherwise lose it.
  // (browser.window is undefined in the Electron main process — skipped there.)
  if (browser.window && browser.document) {
    const flushNow = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      persist().catch(() => {
        /* best-effort during unload */
      });
    };
    browser.window.addEventListener('pagehide', flushNow);
    browser.document.addEventListener('visibilitychange', () => {
      if (browser.document?.visibilityState === 'hidden') flushNow();
    });
  }

  const engine: DatabaseEngine = {
    query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
      const stmt = db.prepare(sql);
      try {
        stmt.bind(params as BindParams);
        const rows: T[] = [];
        while (stmt.step()) {
          rows.push(stmt.getAsObject() as T);
        }
        return rows;
      } finally {
        stmt.free();
      }
    },

    execute(sql: string, params: unknown[] = []): void {
      db.run(sql, params as BindParams);
      scheduleSave();
    },

    batch(statements: SqlStatement[]): void {
      db.run('BEGIN');
      try {
        for (const stmt of statements) {
          db.run(stmt.sql, (stmt.params ?? []) as BindParams);
        }
        db.run('COMMIT');
      } catch (err) {
        try {
          db.run('ROLLBACK');
        } catch {
          /* connection state already broken */
        }
        throw err;
      }
      scheduleSave();
    },

    transaction<T>(fn: () => T): T {
      db.run('BEGIN');
      let result: T;
      try {
        result = fn();
        db.run('COMMIT');
      } catch (err) {
        try {
          db.run('ROLLBACK');
        } catch {
          /* connection state already broken */
        }
        throw err;
      }
      scheduleSave();
      return result;
    },

    async flush(): Promise<Uint8Array> {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      dirty = true;
      await persist();
      return db.export();
    },

    close(): void {
      if (timer) clearTimeout(timer);
      db.close();
    },
  };

  return engine;
}
