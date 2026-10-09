import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { NightSummary } from '@opencpap/core';
import { DEMO_DEVICE_ID, repository } from './db/repository';

interface DataState {
  nights: NightSummary[];
  devices: { deviceId: string; manufacturer: string; model: string; sessions: number }[];
  loading: boolean;
  /** True when the only data is the synthetic demo device. */
  demoOnly: boolean;
  reload: () => Promise<void>;
}

const Ctx = createContext<DataState | null>(null);

/** Loads night summaries from IndexedDB and reloads them after imports or deletions. */
export function DataProvider({ children }: { children: ReactNode }) {
  const [nights, setNights] = useState<NightSummary[]>([]);
  const [devices, setDevices] = useState<DataState['devices']>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [n, d] = await Promise.all([repository.nights(), repository.devices()]);
    setNights(n);
    setDevices(d);
    setLoading(false);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const value = useMemo<DataState>(
    () => ({ nights, devices, loading, reload, demoOnly: devices.length > 0 && devices.every((d) => d.deviceId === DEMO_DEVICE_ID) }),
    [nights, devices, loading, reload],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): DataState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData must be used inside <DataProvider>');
  return v;
}
