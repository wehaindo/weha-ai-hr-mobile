import type { Migration } from '../migrate';

// Drop the redundant printer_profiles table — printers are managed by the
// richer hardware_devices registry (types receipt_printer/kitchen_printer/
// label_printer) since the Printers settings page was consolidated into
// Hardware. print_queue stays; its profile_id references a hardware_devices id.
export const migration0017DropPrinterProfiles: Migration = {
  id: '0017_drop_printer_profiles',
  up: (db) => {
    db.execute('DROP TABLE IF EXISTS printer_profiles');
  },
};
