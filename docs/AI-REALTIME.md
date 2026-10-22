# Connect weha-device-framework to AI Realtime

Step-by-step guide to making the device app publish its presence and simple
events (`device.active`, `device.heartbeat`, `session.login`, `session.logout`)
into the **WEHA AI Realtime** platform (`ai-realtime` repo).

## How the connection works

```
 weha-device-framework (browser / Electron renderer, http://localhost:3180)
        │  Socket.IO, auth: { token: "whrt_..." }
        ▼
 ai-realtime gateway (http://localhost:4002, path /socket.io)
        │  authorizes the credential + topic, stamps identity,
        ▼  fans the event out to subscribers
 subscribers (other devices, dashboards, command centers)
```

- The device authenticates with an **application credential** (`whrt_...`
  token) presented in the Socket.IO handshake.
- Every event is published to one registered **topic** (tenant-scoped name,
  e.g. `tenant:<TENANT_ID>:device.events`) through the gateway's
  `event:publish` contract.
- The gateway tracks connection presence server-side; the framework's events
  are the application-level signal on top of it.

Both stacks must be running. See the prerequisites below.

## Prerequisites

1. **ai-realtime up** (API `:4001`, gateway `:4002`, worker `:4003`,
   Postgres + Redis):

   ```bash
   cd ../ai-realtime
   pnpm infra:up && pnpm db:generate && pnpm db:migrate && pnpm dev
   ```

   All four health checks must be ready:
   `curl http://localhost:4002/health/ready`

2. **weha-device-framework up**: `npm run dev` (serves on
   `http://localhost:3180`).

3. The gateway must allow the device app's origin. The local `.env` already
   has it:

   ```
   ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3180
   ```

   Restart the gateway after changing it.

## Step 1 — Create the platform objects (ai-realtime side)

Everything below can be done in the dashboard (`http://localhost:3000`) or via
the admin API with curl. The API version is shown; the seeded development
admin comes from `ai-realtime/.env` (`SEED_ADMIN_EMAIL` /
`SEED_ADMIN_PASSWORD`, default `admin@example.com` / `change-me-seed-password`).

> Run `pnpm db:seed` (from the ai-realtime repo) if the admin does not exist
> yet, and **change the seed password** before any real use.

### 1.1 Log in (session + CSRF)

```bash
curl -s -c cookies.txt -X POST http://localhost:4001/api/v1/auth/login \
  -H "content-type: application/json" \
  -d "{\"identifier\":\"admin@example.com\",\"password\":\"change-me-seed-password\"}"
```

The response contains `csrfToken`; every mutating call below must send it as
the `x-csrf-token` header (the session travels in the cookie jar).

### 1.2 Create a tenant

```bash
curl -s -b cookies.txt -X POST http://localhost:4001/api/v1/admin/tenants \
  -H "content-type: application/json" -H "x-csrf-token: <CSRF_TOKEN>" \
  -d "{\"name\":\"WEHA Demo\",\"code\":\"weha\"}"
```

Note the returned `id` — it is `<TENANT_ID>` in the rest of this guide.

### 1.3 Create an application

```bash
curl -s -b cookies.txt -X POST http://localhost:4001/api/v1/admin/tenants/<TENANT_ID>/applications \
  -H "content-type: application/json" -H "x-csrf-token: <CSRF_TOKEN>" \
  -d "{\"name\":\"Device Framework\",\"code\":\"device-framework\",\"type\":\"device\",\"environment\":\"DEVELOPMENT\"}"
```

Note the returned `id` — it is `<APPLICATION_ID>` below.

### 1.4 Grant the application its operational permissions

New applications get **no** permissions by default (deny by default). The
device app needs `realtime:connect` to open the socket and `event:publish` to
send events (plus `event:subscribe` if it should receive events):

```bash
curl -s -b cookies.txt -X PUT http://localhost:4001/api/v1/admin/tenants/<TENANT_ID>/applications/<APPLICATION_ID>/permissions \
  -H "content-type: application/json" -H "x-csrf-token: <CSRF_TOKEN>" \
  -d "{\"permissions\":[\"realtime:connect\",\"event:publish\",\"event:subscribe\"]}"
```

### 1.5 Issue a credential (`whrt_...` token)

```bash
curl -s -b cookies.txt -X POST http://localhost:4001/api/v1/admin/tenants/<TENANT_ID>/applications/<APPLICATION_ID>/credentials \
  -H "content-type: application/json" -H "x-csrf-token: <CSRF_TOKEN>" \
  -d "{\"name\":\"device-framework local\"}"
```

The response carries the raw token (`whrt_...`) **exactly once** — copy it
now; it is never shown again. This is `<WHRT_TOKEN>` below.

### 1.6 Register the topic

Topic names must be tenant channel names: `tenant:<TENANT_ID>:<stream>`. No
payload schema is needed — a topic without a schema accepts any payload.

```bash
curl -s -b cookies.txt -X POST http://localhost:4001/api/v1/admin/tenants/<TENANT_ID>/topics \
  -H "content-type: application/json" -H "x-csrf-token: <CSRF_TOKEN>" \
  -d "{\"tenantId\":\"<TENANT_ID>\",\"name\":\"tenant:<TENANT_ID>:device.events\",\"description\":\"Device framework lifecycle events\"}"
```

Note the returned `id` — it is `<TOPIC_ID>` below.

### 1.7 Allow the application to publish (and subscribe on) the topic

```bash
curl -s -b cookies.txt -X POST http://localhost:4001/api/v1/admin/tenants/<TENANT_ID>/topic-policies \
  -H "content-type: application/json" -H "x-csrf-token: <CSRF_TOKEN>" \
  -d "{\"applicationId\":\"<APPLICATION_ID>\",\"topicId\":\"<TOPIC_ID>\",\"permissions\":[\"publish\",\"subscribe\"],\"effect\":\"ALLOW\"}"
```

## Step 2 — Configure the device app (framework side)

1. Open **Settings → Realtime** (`http://localhost:3180/settings/realtime`).
2. In the **AI Realtime** card enter:

   | Field        | Value                                              |
   | ------------ | -------------------------------------------------- |
   | Gateway URL  | `http://localhost:4002`                            |
   | Credential   | `<WHRT_TOKEN>` (the `whrt_...` value from 1.5)     |
   | Topic        | `tenant:<TENANT_ID>:device.events` (from 1.6)      |

3. Click **Save & Connect**.

The values are stored per device in SQLite (`device_settings` keys
`aiRealtime.url`, `aiRealtime.token`, `aiRealtime.topic`) — the credential
never lives in `device.config.ts`. On every app boot the integration
auto-connects when a token is present (module switch:
`deviceConfig.modules.aiRealtime`).

What happens next:

- `device.active` is published immediately on connect.
- `device.heartbeat` follows every 60 s while connected
  (`deviceConfig.aiRealtime.heartbeatMs`).
- `session.login` / `session.logout` are published when a user signs in or
  out.

## Step 3 — Verify

**From the app:** open **Settings → Realtime**. The **AI Realtime** card shows
a live connection-status badge (`connected`, `connecting`, `error`, ...). Click
**Send Test Event** — it publishes a `device.test` event to the configured
topic and reports the gateway's ack in a toast. `Test event delivered
(eventId ...)` means the round-trip (device → gateway → ack) works;
`Test event failed: <code>` names the problem (see Troubleshooting).

**Quickest:** watch the gateway logs — a connect plus an
`event published ... topic: tenant:<TENANT_ID>:device.events` line appears as
soon as the device connects. Or query presence with the admin session:

```bash
curl -s -b cookies.txt http://localhost:4001/api/v1/admin/tenants/<TENANT_ID>/presence
```

**End-to-end:** run this subscriber (any machine that can reach the gateway).
Save as `subscribe-test.js` and run it from the `weha-device-framework` folder
(so `socket.io-client` resolves from `node_modules`):

```js
const { io } = require('socket.io-client');

const socket = io('http://localhost:4002', {
  path: '/socket.io',
  auth: { token: 'whrt_...' }, // an event:subscribe-capable credential
});

socket.on('connect', () => {
  socket.emit('event:subscribe', { channel: 'tenant:<TENANT_ID>:device.events' }, (ack) => {
    console.log('subscribe ack:', ack);
  });
});

socket.on('event', (envelope) => {
  console.log(envelope.type, envelope.data);
});

socket.on('connect_error', (err) => console.error('connect_error:', err.message));
```

You should see `device.active`, then `device.heartbeat` every minute, and
`session.login` when you sign in on the device app.

## Events published by the framework

| Type               | When                                        | Data                                                     |
| ------------------ | ------------------------------------------- | -------------------------------------------------------- |
| `device.active`    | Every (re)connect to the gateway             | `{ deviceId, activeAt }`                                  |
| `device.heartbeat` | While connected, every `heartbeatMs` (60 s) | `{ deviceId, status: 'online', at }`                      |
| `session.login`    | A user signs in (PIN or username/password)  | `{ deviceId, userId, displayName, role, at }`             |
| `session.logout`   | A user signs out                            | `{ deviceId, userId, at }`                                |
| `device.test`      | **Send Test Event** button (Settings → Realtime) | `{ deviceId, message, at }`                         |

Custom events: `getAiRealtimeClient()?.publish('my.event.type', { ... })` from
`@/integration/ai-realtime` (the topic must allow the application to publish;
types must be dotted lowercase like `pos.sale.completed`).

## Configuration reference

| Where                          | Key                                                  | Meaning                                    |
| ------------------------------ | ---------------------------------------------------- | ------------------------------------------ |
| `device.config.ts`             | `aiRealtime.url` (env `NEXT_PUBLIC_AI_REALTIME_URL`) | Gateway base URL (default `http://localhost:4002`) |
| `device.config.ts`             | `aiRealtime.topic`                                   | Default topic name                         |
| `device.config.ts`             | `aiRealtime.heartbeatMs`                             | Heartbeat cadence (default 60000)          |
| `device.config.ts`             | `modules.aiRealtime`                                 | Master switch                             |
| Settings → Realtime (SQLite `device_settings`) | `aiRealtime.url` / `aiRealtime.token` / `aiRealtime.topic` | Per-device overrides; the `whrt_` credential only lives here |

## Troubleshooting

| Symptom (gateway / client)                     | Cause & fix                                                                                          |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `connect_error: origin_not_allowed`            | The device app's origin is missing from `ALLOWED_ORIGINS` in `ai-realtime/.env`; add it and restart the gateway. |
| `AUTHENTICATION_FAILED` on connect             | Token missing/revoked/wrong, or the application lacks `realtime:connect` (step 1.4).                  |
| `APPLICATION_DISABLED` / `TENANT_DISABLED`     | The application or tenant was deactivated.                                                            |
| Publish ack `ok: false, code: TOPIC_FORBIDDEN` | No ALLOW `publish` policy for this application on the topic (step 1.7), or the topic is inactive.      |
| Publish ack `ok: false, code: EVENT_INVALID`   | The topic name does not match the tenant channel pattern or is empty in settings.                      |
| Nothing connects; settings saved               | With no `aiRealtime.token` stored the integration stays off by design — save the credential and press **Save & Connect**. |
| Connection refused to :4002                    | Gateway not running (or still on an old port from a stale process — check `netstat`, restart the stack). |
| Events published but nothing arrives at a subscriber | The subscriber's credential lacks `event:subscribe` permission (step 1.4) or the topic policy (step 1.7). |
