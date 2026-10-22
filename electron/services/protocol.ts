// app:// custom protocol — serves the static export (out/) with path routing,
// so /settings/users works in packaged builds without a web server or hash routing.

import * as fs from 'fs';
import * as path from 'path';
import { app, net, protocol } from 'electron';
import { pathToFileURL } from 'url';

export function registerAppSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
  ]);
}

function resolveStaticFile(pathname: string): string {
  const outDir = path.join(app.getAppPath(), 'out');
  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const candidates = [
    path.join(outDir, safePath),
    path.join(outDir, `${safePath}.html`),
    path.join(outDir, safePath, 'index.html'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  // SPA fallback — client router takes over.
  return path.join(outDir, 'index.html');
}

export function setupProtocolHandler(): void {
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    const filePath = resolveStaticFile(decodeURIComponent(url.pathname));
    return net.fetch(pathToFileURL(filePath).toString());
  });
}
