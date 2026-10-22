// Live event monitor for the WEHA AI Realtime integration.
// Subscribes to a topic and prints every event envelope as it arrives.
//
// Usage (from the weha-device-framework folder):
//   set AI_RT_TOKEN=whrt_...
//   set AI_RT_TOPIC=tenant:<TENANT_ID>:device.events
//   node scripts/monitor-ai-realtime.js
// Optional: set AI_RT_URL (default http://localhost:4002)

const { io } = require('socket.io-client');

const url = process.env.AI_RT_URL ?? 'http://localhost:4002';
const token = process.env.AI_RT_TOKEN;
const topic = process.env.AI_RT_TOPIC;

if (!token || !topic) {
  console.error('Missing AI_RT_TOKEN and/or AI_RT_TOPIC. Example:');
  console.error('  set AI_RT_TOKEN=whrt_...');
  console.error('  set AI_RT_TOPIC=tenant:<TENANT_ID>:device.events');
  process.exit(1);
}

const socket = io(url, {
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  auth: {
    token,
    clientId: 'event-monitor',
    deviceId: 'event-monitor',
    clientType: 'monitor',
  },
});

socket.on('connect', () => {
  console.log(`[monitor] connected to ${url} (socket ${socket.id})`);
  socket.emit('event:subscribe', { channel: topic }, (ack) => {
    console.log(`[monitor] subscribed to ${topic}:`, JSON.stringify(ack));
    console.log('[monitor] waiting for events... (Ctrl+C to stop)');
  });
});

socket.on('event', (envelope) => {
  const at = envelope.occurredAt ?? envelope.publishedAt ?? '';
  console.log(
    `[${new Date().toISOString()}] ${envelope.type} | app=${envelope.appId} event=${envelope.eventId} | ${JSON.stringify(envelope.data)} ${at}`
  );
});

socket.on('connect_error', (err) => {
  console.error(`[monitor] connect_error: ${err.message}`, JSON.stringify(err.data ?? {}));
});

socket.on('disconnect', (reason) => {
  console.log(`[monitor] disconnected: ${reason} (reconnecting...)`);
});
