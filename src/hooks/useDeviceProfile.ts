'use client';

import { useEffect, useState } from 'react';

export type DeviceType = 'phone' | 'tablet' | 'desktop' | 'pos' | 'kiosk';
export type DeviceTier = 'small' | 'medium' | 'large';

export interface DeviceProfile {
  type: DeviceType;
  tier: DeviceTier;
  isTouch: boolean;
  width: number;
  height: number;
}

function detect(): DeviceProfile {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  let type: DeviceType;
  if (width < 640) type = 'phone';
  else if (width < 1024 && isTouch) type = 'tablet';
  else if (width >= 1900 && height >= 1080) type = 'kiosk';
  else if (width >= 1024 && (isTouch || width >= 1366)) type = 'pos';
  else type = 'desktop';

  const tier: DeviceTier = width < 1024 ? 'small' : width < 1600 ? 'medium' : 'large';
  return { type, tier, isTouch, width, height };
}

/** Live device profile — re-detects on resize (debounced). */
export function useDeviceProfile(): DeviceProfile | null {
  const [profile, setProfile] = useState<DeviceProfile | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const update = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setProfile(detect()), 150);
    };
    update();
    window.addEventListener('resize', update);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('resize', update);
    };
  }, []);

  return profile;
}
