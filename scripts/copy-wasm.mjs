// Copies sql.js WASM into public/ so the static export can fetch it at runtime.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(root, 'public'), { recursive: true });
copyFileSync(join(root, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'), join(root, 'public', 'sql-wasm.wasm'));
console.log('sql-wasm.wasm copied to public/');
