import { readEdf, type EdfData, type SessionSettings } from '@opencpap/core';

/**
 * `STR.edf` is ResMed's daily summary: one EDF record per day (noon to noon, 86 400 s) holding the therapy settings
 * and the statistics the device computed. Label names follow OSCAR's resmed_loader.cpp (`STR_Channels`); all of them are
 * *unverified* against a real card here, so every lookup is optional and a missing label just means "not reported".
 */
export interface StrDay {
  /** noon at the start of the record, epoch ms (device clock) */
  start: number;
  settings: SessionSettings;
  /** device-computed daily figures, when present */
  summary: { usageHours?: number; ahi?: number; obstructiveIndex?: number; centralIndex?: number; hypopneaIndex?: number; unclassifiedIndex?: number; leak95?: number; leakMedian?: number };
}

const DAY_MS = 86_400_000;

/** Reads the days of an already-parsed `STR.edf`. */
export function strDays(edf: EdfData): StrDay[] {
  const sig = (label: string) => edf.signals.find((s) => s.label === label);
  const at = (label: string, day: number, k = 0): number | undefined => {
    const s = sig(label);
    if (!s || k >= s.samplesPerRecord) return undefined;
    const v = s.samples[day * s.samplesPerRecord + k];
    return v === undefined || Number.isNaN(v) ? undefined : v;
  };
  const days: StrDay[] = [];
  for (let d = 0; d < edf.records; d++) {
    const mode = at('Mode', d);
    const settings: SessionSettings = {};
    const set = (key: string, v: number | undefined) => { if (v !== undefined && v >= 0) settings[key] = +v.toFixed(2); };
    if (mode !== undefined) {
      const m = Math.round(mode);
      // 0 = CPAP and 1 = APAP (auto-titrating) follow OSCAR; other codes (bilevel, ASV, AirSense 11 modes) are kept as a raw code.
      settings.mode = m === 0 ? 'cpap' : m === 1 ? 'auto-cpap' : `Mode ${m}`;
      if (m === 0) set('pressure', at('S.C.Press', d));
      if (m === 1) { set('pressureMin', at('S.A.MinPress', d)); set('pressureMax', at('S.A.MaxPress', d)); }
    }
    // pressure relief (EPR) is stored under the same keys as Philips' Flex so the app shows and compares both alike
    const epr = at('S.EPR.EPREnable', d);
    if (epr !== undefined) { settings.flexMode = epr > 0 ? 'epr' : 'none'; if (epr > 0) set('flexLevel', at('S.EPR.Level', d)); }
    set('rampTimeMinutes', at('S.RampTime', d));
    set('rampPressure', at('S.A.StartPress', d));
    const dur = at('Duration', d) ?? at('OnDuration', d);
    days.push({
      start: edf.startMs + d * DAY_MS,
      settings,
      summary: {
        usageHours: dur !== undefined ? dur / 60 : undefined,
        ahi: at('AHI', d), obstructiveIndex: at('OAI', d), centralIndex: at('CAI', d), hypopneaIndex: at('HI', d), unclassifiedIndex: at('UAI', d),
        leak95: at('Leak.95', d) !== undefined ? at('Leak.95', d)! * 60 : undefined,
        leakMedian: at('Leak.50', d) !== undefined ? at('Leak.50', d)! * 60 : undefined,
      },
    });
  }
  return days;
}

export function parseStr(bytes: Uint8Array): StrDay[] {
  return strDays(readEdf(bytes));
}

/** The day record a timestamp falls into (records start at noon), or undefined. */
export function dayFor(days: readonly StrDay[], t: number): StrDay | undefined {
  return days.find((d) => t >= d.start && t < d.start + DAY_MS);
}
