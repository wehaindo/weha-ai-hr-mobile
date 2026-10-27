# Deployment (web/PWA)

The web/PWA build is a **pure static export** (`next build` → `out/`,
`output: "export"` in `next.config.ts`). Deployment follows the same process
as [weha-framework](../../weha-framework): GitHub Actions builds on the
runner and ships the finished output to the server over **rsync** — the
server only receives files and serves them; it never runs `npm`,
`prisma` or `next build`.

The workflow lives in [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml):

```
push to main (or manual dispatch)
  └─ verify   — reuses the CI workflow (tsc, lint, unit tests, build)
  └─ deploy   — environment "production" (manual approval button)
       ├─ check deploy credentials (fail fast on missing secrets)
       ├─ prepare server (APP_DIR, safety checks, warn on missing .env)
       ├─ fetch $APP_DIR/.env   (NEXT_PUBLIC_* are inlined at build time,
       │                         so the server is the single source of truth)
       ├─ npm ci + npm run build (static export into out/)
       ├─ verify build output   (index.html, manifest.json, _next/static)
       ├─ rsync out/ → server   (--delete; guarded against foreign dirs)
       └─ verify deployment     (files present; RELEASE_SHA recorded)
```

## GitHub configuration

Repository → **Settings → Secrets and variables → Actions**:

| Kind | Name | Value |
|---|---|---|
| Secret (required) | `SSH_HOST` | server hostname / IP |
| Secret (required) | `SSH_USER` | deploy user (needs write access to `APP_DIR`) |
| Secret (required) | `SSH_PRIVATE_KEY` | private key (OpenSSH format; the matching public key must be in `~/.ssh/authorized_keys`) |
| Secret (optional) | `SSH_PORT` | ssh port, default `22` |
| Variable (optional) | `APP_DIR` | deploy directory, default `/var/www/weha/weha-ai-hrd-mobile` |

Under **Environments** create `production` and (recommended) add reviewers —
that is what shows the *Approve* button before every deploy. Secrets can also
be scoped to this environment instead of the repository.

## Server preparation (once)

```bash
# 1. Deploy directory (writable by the SSH_USER)
sudo mkdir -p /var/www/weha/weha-ai-hrd-mobile
sudo chown -R $USER /var/www/weha/weha-ai-hrd-mobile

# 2. Build-time environment — NEXT_PUBLIC_ERP_BASE_URL is compiled into the
#    bundle, so this file decides which backend the PWA talks to.
cd /var/www/weha/weha-ai-hrd-mobile
cp .env.example .env        # from the repo, then edit:
echo 'NEXT_PUBLIC_ERP_BASE_URL=http://192.168.1.180:3278' > .env
```

The deploy **refuses** to rsync with `--delete` into a non-empty directory
that has no `index.html` (i.e. not a previous deploy).

### nginx (static export)

`next build` emits one HTML file per route (`out/dashboard.html`, …), so the
vhost needs `$uri.html` in `try_files`:

```nginx
server {
  listen 80;
  server_name ess.example.com;          # e.g. the device-facing hostname
  root /var/www/weha/weha-ai-hrd-mobile;
  index index.html;

  gzip on;
  gzip_types text/css application/javascript application/json image/svg+xml;

  # Hashed build assets: safe to cache forever.
  location /_next/static/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  # The shell and the PWA manifest must refresh on every deploy.
  location = /index.html   { add_header Cache-Control "no-cache"; }
  location = /manifest.json { add_header Cache-Control "no-cache"; }

  # Route pages: /dashboard → dashboard.html (static export, no server).
  location / {
    try_files $uri $uri.html $uri/ =404;
  }

  error_page 404 /404.html;
}
```

## What ships

Only `out/` — HTML, hashed JS/CSS, icons, `manifest.json` and a
`RELEASE_SHA` marker (which commit is serving). No `.env`, no source, no
`node_modules`.

## Notes

- **`NEXT_PUBLIC_*` inlining**: `NEXT_PUBLIC_ERP_BASE_URL` (and
  `NEXT_PUBLIC_APP_TARGET`) are baked in at **build time** — changing the
  backend URL means editing `$APP_DIR/.env` on the server and re-running the
  deploy (Actions → Deploy → Run workflow).
- **Rollback**: `git revert <bad commit>` and push — the deploy pipeline
  rebuilds and re-ships the previous state.
- **First run**: dispatch the workflow manually (*Actions → Deploy → Run
  workflow*) after configuring the secrets; a missing secret fails fast at
  *Check deploy credentials* with instructions.
- CI runs twice per push (standalone + as the deploy gate) — the same
  accepted trade-off as weha-framework.
- Electron and Capacitor builds are unaffected: they consume the same `out/`
  locally (`npm run electron:build`, `npm run cap:sync:mobile`).
