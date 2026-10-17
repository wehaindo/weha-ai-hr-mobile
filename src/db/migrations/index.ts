import type { Migration } from '../migrate';
import { migration0001Core } from './0001_core';
import { migration0002Permissions } from './0002_permissions';
import { migration0003Print } from './0003_print';
import { migration0004Seed } from './0004_seed';

// Framework migrations — run on every platform before the app boots.
// App-specific migrations: append here (create one file per migration).
export const frameworkMigrations: Migration[] = [
  migration0001Core,
  migration0002Permissions,
  migration0003Print,
  migration0004Seed,
];
