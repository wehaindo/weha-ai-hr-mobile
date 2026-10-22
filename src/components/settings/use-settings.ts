'use client';

// Reusable settings hooks — back a group of scalar settings onto the
// device_settings KV (bridge.kv) with `${prefix}.${key}` namespacing. Every
// settings tab uses these so pages stay small and consistent, and a device app
// can add a tab by declaring defaults + fields.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useBridge } from '@/platform';

/** Load + save a group of settings under one KV prefix. */
export function useSettingsGroup<T extends Record<string, unknown>>(
  prefix: string,
  defaults: T
): {
  values: T;
  set: <K extends keyof T>(key: K, value: T[K]) => void;
  save: () => Promise<void>;
  loading: boolean;
  reset: () => void;
} {
  const bridge = useBridge();
  const [values, setValues] = useState<T>(defaults);
  const [loading, setLoading] = useState(true);
  const loadedRef = useRef(false);

  // Load each `${prefix}.${key}` on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next: Record<string, unknown> = { ...defaults };
      for (const key of Object.keys(defaults)) {
        try {
          const stored = await bridge.kv.get<unknown>(`${prefix}.${key}`);
          if (stored !== null && stored !== undefined) next[key] = stored;
        } catch {
          /* keep default */
        }
      }
      if (!cancelled) {
        setValues(next as T);
        loadedRef.current = true;
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge, prefix]);

  const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const save = useCallback(async () => {
    for (const [key, value] of Object.entries(values)) {
      await bridge.kv.set(`${prefix}.${key}`, value);
    }
  }, [bridge, prefix, values]);

  const reset = useCallback(() => setValues(defaults), [defaults]);

  return { values, set, save, loading, reset };
}

/** Load + save a single setting by full KV key. */
export function useSetting<T>(
  key: string,
  defaultValue: T
): { value: T; setValue: (v: T) => Promise<void>; loading: boolean } {
  const bridge = useBridge();
  const [value, setValueState] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await bridge.kv.get<T>(key);
        if (!cancelled && stored !== null && stored !== undefined) setValueState(stored);
      } catch {
        /* keep default */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bridge, key]);

  const setValue = useCallback(
    async (v: T) => {
      setValueState(v);
      await bridge.kv.set(key, v);
    },
    [bridge, key]
  );

  return { value, setValue, loading };
}
