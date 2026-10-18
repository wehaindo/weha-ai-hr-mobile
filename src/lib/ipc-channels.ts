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
  // hardware capability
  HARDWARE_OPEN_DRAWER: 'hardware:open-drawer',
  HARDWARE_SERIAL: 'hardware:serial',
  HARDWARE_DISCOVER: 'hardware:discover',
  HARDWARE_TEST: 'hardware:test',
  HARDWARE_EXCHANGE: 'hardware:exchange',
  // realtime capability
  REALTIME_CONNECT: 'realtime:connect',
  REALTIME_DISCONNECT: 'realtime:disconnect',
  REALTIME_SEND_EVENT: 'realtime:send-event',
  REALTIME_SEND_HEARTBEAT: 'realtime:send-heartbeat',
  REALTIME_SET_STATUS: 'realtime:set-status',
  REALTIME_GET_STATUS: 'realtime:get-status',
  // cloud capability
  CLOUD_REQUEST: 'cloud:request',
  CLOUD_GOOGLE_OAUTH: 'cloud:google-oauth',
  // backup capability
  BACKUP_SAVE_TO_FILE: 'backup:save-to-file',
  BACKUP_OPEN_FILE: 'backup:open-file',
  // display capability
  DISPLAY_OPEN: 'display:open',
  DISPLAY_CLOSE: 'display:close',
  DISPLAY_IS_OPEN: 'display:is-open',
  // push events (main → renderer)
  EVENT_DB_CHANGED: 'db:changed',
  EVENT_COMMAND: 'command',
  EVENT_WINDOW_STATE: 'window:state',
  EVENT_SYNC_STATUS: 'sync:status',
  EVENT_REALTIME_STATUS: 'realtime:status',
  EVENT_REALTIME_COMMAND: 'realtime:command',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
