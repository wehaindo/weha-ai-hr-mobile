// Generic bridge/IPC channel names. The framework deliberately has a small,
// fixed set — app-specific data flows through db:query / db:execute.

export const IPC_CHANNELS = {
  DB_QUERY: 'db:query',
  DB_EXECUTE: 'db:execute',
  DB_BATCH: 'db:batch',
  KV_GET: 'kv:get',
  KV_SET: 'kv:set',
  KV_REMOVE: 'kv:remove',
  APP_INFO: 'app:info',
  APP_NOTIFY: 'app:notify',
  WINDOW_OPEN: 'window:open',
  WINDOW_CONTROL: 'window:control',
  PRINT_RAW: 'print:raw',
  // push events (main → renderer)
  EVENT_DB_CHANGED: 'db:changed',
  EVENT_COMMAND: 'command',
  EVENT_WINDOW_STATE: 'window:state',
  EVENT_SYNC_STATUS: 'sync:status',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
