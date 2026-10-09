import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { settingsChanges, type ChangeEvent, type NightSummary } from '@opencpap/core';
import type { EquipmentRow, JournalRow } from './db/db';
import { DEMO_DEVICE_ID, repository } from './db/repository';

interface DataState {
  nights: NightSummary[];
  devices: { deviceId: string; manufacturer: string; model: string; sessions: number }[];
  /** notes by night date */
  journal: Map<string, JournalRow>;
  equipment: EquipmentRow[];
  /** nights on which the therapy settings differ from the previous night */
  changes: ChangeEvent[];
  /** date of the latest night: "today" for ages and reminders, so results do not depend on the clock */
  asOf: string | undefined;
  loading: boolean;
  /** True when the only data is the synthetic demo device. */
  demoOnly: boolean;
  reload: () => Promise<void>;
  /** cheaper reloads after editing notes or equipment */
  reloadJournal: () => Promise<void>;
  reloadEquipment: () => Promise<void>;
}

const Ctx = createContext<DataState | null>(null);

/** Loads night summaries, notes and equipment from IndexedDB and reloads them after imports, edits or deletions. */
export function DataProvider({ children }: { children: ReactNode }) {
  const [nights, setNights] = useState<NightSummary[]>([]);
  const [devices, setDevices] = useState<DataState['devices']>([]);
  const [journal, setJournal] = useState<Map<string, JournalRow>>(new Map());
  const [equipment, setEquipment] = useState<EquipmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [n, d, j, e] = await Promise.all([repository.nights(), repository.devices(), repository.journal(), repository.equipment()]);
    setNights(n);
    setDevices(d);
    setJournal(new Map(j.map((r) => [r.date, r])));
    setEquipment(e);
    setLoading(false);
  }, []);

  const reloadJournal = useCallback(async () => { setJournal(new Map((await repository.journal()).map((r) => [r.date, r]))); }, []);
  const reloadEquipment = useCallback(async () => { setEquipment(await repository.equipment()); }, []);

  useEffect(() => {
    void (async () => {
      await reload();
      // sessions imported before the breath analysis existed get it in the background
      if ((await repository.backfillAnalysis()) > 0) await reload();
    })();
  }, [reload]);

  const value = useMemo<DataState>(
    () => ({
      nights, devices, journal, equipment, loading, reload, reloadJournal, reloadEquipment,
      changes: settingsChanges(nights),
      asOf: nights.at(-1)?.date,
      demoOnly: devices.length > 0 && devices.every((d) => d.deviceId === DEMO_DEVICE_ID),
    }),
    [nights, devices, journal, equipment, loading, reload, reloadJournal, reloadEquipment],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): DataState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData must be used inside <DataProvider>');
  return v;
}
