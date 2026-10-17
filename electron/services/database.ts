// Database service: sql.js engine in the Electron main process with atomic,
// debounced file persistence under app.getPath('userData') (never inside asar).

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { createEngine, type BlobStore, type DatabaseEngine } from '../../src/db/engine';
import { runMigrations } from '../../src/db/migrate';
import { frameworkMigrations } from '../../src/db/migrations';
import deviceConfig from '../../device.config';

class FileBlobStore implements BlobStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<Uint8Array | null> {
    if (!fs.existsSync(this.filePath)) return null;
    const buffer = await fs.promises.readFile(this.filePath);
    return new Uint8Array(buffer);
  }

  async save(data: Uint8Array): Promise<void> {
    // Atomic write: temp file + rename, so a crash never leaves a half-written DB.
    const tmpPath = `${this.filePath}.tmp`;
    await fs.promises.writeFile(tmpPath, Buffer.from(data));
    await fs.promises.rename(tmpPath, this.filePath);
    console.log(`[db] persisted ${data.byteLength} bytes → ${this.filePath}`);
  }
}

function locateWasm(file: string): string {
  const unpacked = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'sql.js', 'dist', file);
  if (fs.existsSync(unpacked)) return unpacked;
  const devPath = path.join(app.getAppPath(), 'node_modules', 'sql.js', 'dist', file);
  if (fs.existsSync(devPath)) return devPath;
  return path.join(path.dirname(require.resolve('sql.js')), file);
}

let engine: DatabaseEngine | null = null;

export function getDbPath(): string {
  return path.join(app.getPath('userData'), deviceConfig.dbName);
}

export async function initDatabase(): Promise<DatabaseEngine> {
  const dbPath = getDbPath();
  console.log(`[db] path: ${dbPath}`);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const store = new FileBlobStore(dbPath);
  engine = await createEngine(store, locateWasm);
  const result = runMigrations(engine, frameworkMigrations);
  if (result.applied.length > 0) {
    console.log(`[db] applied migrations: ${result.applied.join(', ')}`);
  }
  return engine;
}

export function getDb(): DatabaseEngine {
  if (!engine) throw new Error('Database not initialized');
  return engine;
}

export async function shutdownDatabase(): Promise<void> {
  if (!engine) return;
  await engine.flush();
  engine.close();
  engine = null;
}
