// Scaffolds a new device app identity: rewrites device.config.ts, package.json
// and electron-builder.yml in place.
//
// Interactive:  npm run init-app
// Non-interactive:
//   npm run init-app -- --name "My Device" --id com.weha.mydevice --port 3020 --brand "My Device Brand"

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const root = path.join(__dirname, '..');

interface Answers {
  appName: string;
  appId: string;
  port: string;
  sidebarTitle: string;
  erpBaseUrl: string;
  dbName: string;
}

function parseArgs(): Partial<Answers> {
  const args = process.argv.slice(2);
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, '');
    const value = args[i + 1];
    if (key && value) result[key] = value;
  }
  return {
    appName: result.name,
    appId: result.id,
    port: result.port,
    sidebarTitle: result.brand,
    erpBaseUrl: result.erp,
    dbName: result.db,
  };
}

function ask(rl: readline.Interface, question: string, fallback: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(`${question} (${fallback}): `, (answer) => {
      resolve(answer.trim() || fallback);
    });
  });
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function replaceOnce(content: string, pattern: RegExp, replacement: string, label: string): string {
  if (!pattern.test(content)) {
    throw new Error(`Could not find ${label} to replace — was the file modified?`);
  }
  return content.replace(pattern, replacement);
}

async function main(): Promise<void> {
  const partial = parseArgs();
  let answers: Answers;

  const interactive = !partial.appName && process.stdin.isTTY;
  if (interactive) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const appName = await ask(rl, 'App name', 'My Device App');
    const appId = await ask(rl, 'App id (reverse-DNS)', `com.weha.${slugify(appName).replace(/-/g, '')}`);
    const port = await ask(rl, 'Dev server port', '3000');
    const sidebarTitle = await ask(rl, 'Sidebar/brand title', appName);
    const erpBaseUrl = await ask(rl, 'ERP base URL', 'https://erp.example.com');
    const dbName = await ask(rl, 'Database file name', 'device.db');
    rl.close();
    answers = { appName, appId, port, sidebarTitle, erpBaseUrl, dbName };
  } else {
    if (!partial.appName) {
      console.error('Nothing to do: pass --name (plus optional --id/--port/--brand/--erp/--db) for non-interactive use.');
      process.exit(1);
    }
    answers = {
      appName: partial.appName,
      appId: partial.appId ?? `com.weha.${slugify(partial.appName).replace(/-/g, '')}`,
      port: partial.port ?? '3000',
      sidebarTitle: partial.sidebarTitle ?? partial.appName,
      erpBaseUrl: partial.erpBaseUrl ?? 'https://erp.example.com',
      dbName: partial.dbName ?? 'device.db',
    };
  }

  // device.config.ts
  const configPath = path.join(root, 'device.config.ts');
  let config = fs.readFileSync(configPath, 'utf8');
  config = replaceOnce(config, /appName: '[^']*'/, `appName: '${answers.appName.replace(/'/g, "\\'")}'`, 'appName');
  config = replaceOnce(config, /appId: '[^']*'/, `appId: '${answers.appId}'`, 'appId');
  config = replaceOnce(config, /port: \d+/, `port: ${answers.port}`, 'port');
  config = replaceOnce(
    config,
    /sidebarTitle: '[^']*'/,
    `sidebarTitle: '${answers.sidebarTitle.replace(/'/g, "\\'")}'`,
    'sidebarTitle'
  );
  config = replaceOnce(
    config,
    /baseUrl: process\.env\.NEXT_PUBLIC_ERP_BASE_URL \?\? '[^']*'/,
    `baseUrl: process.env.NEXT_PUBLIC_ERP_BASE_URL ?? '${answers.erpBaseUrl.replace(/'/g, "\\'")}'`,
    'erp.baseUrl'
  );
  config = replaceOnce(config, /dbName: '[^']*'/, `dbName: '${answers.dbName}'`, 'dbName');
  fs.writeFileSync(configPath, config);

  // package.json
  const pkgPath = path.join(root, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name: string; scripts: Record<string, string> };
  pkg.name = slugify(answers.appName);
  for (const key of Object.keys(pkg.scripts)) {
    pkg.scripts[key] = pkg.scripts[key].replace(/--port \d+/, `--port ${answers.port}`);
    pkg.scripts[key] = pkg.scripts[key].replace(/localhost:\d+/, `localhost:${answers.port}`);
    if (key === 'preview') {
      pkg.scripts[key] = pkg.scripts[key].replace(/-l \d+/, `-l ${answers.port}`);
    }
  }
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  // electron-builder.yml
  const builderPath = path.join(root, 'electron-builder.yml');
  let builder = fs.readFileSync(builderPath, 'utf8');
  builder = replaceOnce(builder, /^appId: .*$/m, `appId: ${answers.appId}`, 'electron-builder appId');
  builder = replaceOnce(builder, /^productName: .*$/m, `productName: ${answers.appName}`, 'electron-builder productName');
  fs.writeFileSync(builderPath, builder);

  console.log(`
Device app identity configured:
  name:     ${answers.appName}
  app id:   ${answers.appId}
  port:     ${answers.port}
  brand:    ${answers.sidebarTitle}
  erp url:  ${answers.erpBaseUrl}
  db file:  ${answers.dbName}

Next steps:
  1. npm install
  2. npm run dev            (web) or npm run dev:electron
  3. Sign in with the seeded admin account (PIN 1234) and change the PIN
`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
