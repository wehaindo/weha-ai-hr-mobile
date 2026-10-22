// Cloud-destination sync barrel — shared infra + orderline source registry.
// A destination (Google/Supabase/Grist) supplies a CloudAdapter to the generic
// CloudSyncWorker; the device app registers an orderline source for rows.

export * from './shared';
export * from './worker';
export * from './google/client';
export * from './google/config';
export * from './google/worker';
export * from './supabase/validator';
export * from './supabase/orderline';
export * from './supabase/requeue';
export * from './supabase/client';
export * from './supabase/config';
export * from './supabase/worker';
export * from './grist/client';
export * from './grist/config';
export * from './grist/worker';
export * from './enqueue';
