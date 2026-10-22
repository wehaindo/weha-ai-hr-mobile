'use client';

// Boot-time registration for the Testing module: wires the test models into the
// per-entity + Data Hub sync registries so the sync engines can push them. Runs
// once on mount (gated on the `testing` module flag). Mounted in AppRuntime.

import { useEffect } from 'react';
import deviceConfig from '@/device.config';
import { registerTestSyncEntities } from './seed';

export function useTestingBoot(): void {
  useEffect(() => {
    if (deviceConfig.modules.testing) {
      registerTestSyncEntities();
    }
  }, []);
}
