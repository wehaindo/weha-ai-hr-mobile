import type { Migration } from '../migrate';
import { migration0001Core } from './0001_core';
import { migration0002Permissions } from './0002_permissions';
import { migration0003Print } from './0003_print';
import { migration0004Seed } from './0004_seed';
import { migration0005Hardware } from './0005_hardware';
import { migration0006HardwarePermissions } from './0006_hardware_permissions';
import { migration0007Integration } from './0007_integration';
import { migration0008Datahub } from './0008_datahub';
import { migration0009Ecr } from './0009_ecr';
import { migration0010IntegrationPermissions } from './0010_integration_permissions';
import { migration0011Google } from './0011_google';
import { migration0012Grist } from './0012_grist';
import { migration0013Supabase } from './0013_supabase';
import { migration0014CloudPermissions } from './0014_cloud_permissions';
import { migration0015AiVoice } from './0015_ai_voice';
import { migration0016SettingsPermissions } from './0016_settings_permissions';
import { migration0017DropPrinterProfiles } from './0017_drop_printer_profiles';
import { migration0018TestingModels } from './0018_testing_models';
import { migration0019TestingPermission } from './0019_testing_permission';
import { migration0020UserCredentials } from './0020_user_credentials';

// Framework migrations — run on every platform before the app boots.
// App-specific migrations: append here (create one file per migration).
export const frameworkMigrations: Migration[] = [
  migration0001Core,
  migration0002Permissions,
  migration0003Print,
  migration0004Seed,
  migration0005Hardware,
  migration0006HardwarePermissions,
  migration0007Integration,
  migration0008Datahub,
  migration0009Ecr,
  migration0010IntegrationPermissions,
  migration0011Google,
  migration0012Grist,
  migration0013Supabase,
  migration0014CloudPermissions,
  migration0015AiVoice,
  migration0016SettingsPermissions,
  migration0017DropPrinterProfiles,
  migration0018TestingModels,
  migration0019TestingPermission,
  migration0020UserCredentials,
];
