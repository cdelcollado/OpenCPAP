/**
 * Reference ranges shown next to a metric. They are orientative reading aids, not targets set for a patient, and the
 * sources are still being confirmed (see docs/reference-ranges.md): every value here is *unverified*.
 *
 * A range only applies to the device family it was written for. The leak range is a ResMed figure (95th-percentile
 * unintentional leak); Philips reports total leak, which includes the intentional vent flow, so it has no range here.
 */

/** Three-state status shown next to a metric that has a reference. */
export type RefState = 'good' | 'warn' | 'bad';

/** Device family used to choose a reference. `other` covers demo data and any loader without a known manufacturer. */
export type DeviceFamily = 'philips' | 'resmed' | 'other';

export const REFERENCE = {
  /** AHI in events per hour: below `normal` is within range; from `severe` on it is out of range. */
  ahi: { normal: 5, severe: 15 },
  /** Usage in hours per night: at least this many hours is within range. */
  usageHours: 4,
  /** Share of nights that should reach `usageHours` (a common payer rule, not a clinical target). */
  complianceShare: 0.7,
  /**
   * Leak in L/min, judged on the 70th percentile of the night (time-weighted). ResMed's seal rule: below 24 is
   * a good seal (unintentional leak). For Philips (total leak, vent flow included) the 30 to 50 L/min band is the
   * maintainer's working range, not yet a sourced value: 30 to 50 is within range, above 50 up to `problem` is
   * attention, and above `problem` (sustained) is out of range. `problem` is 60 (the maintainer's conservative
   * reading of 60 to 70 L/min, where a Philips device may struggle to hold the pressure).
   */
  leakResmed: 24,
  leakPhilips: { min: 30, max: 50, problem: 60 },
  /** ODI4 (desaturations of 4 % or more per hour), adult polysomnography bands. */
  odi4: { normal: 5, severe: 15 },
} as const;

/** Maps a manufacturer string (as stored on a session) to the family whose reference applies. */
export function deviceFamily(manufacturer: string | undefined): DeviceFamily {
  if (!manufacturer) return 'other';
  if (/philips|respironics/i.test(manufacturer)) return 'philips';
  if (/resmed/i.test(manufacturer)) return 'resmed';
  return 'other';
}

/** AHI state: within range below 5 per hour, attention from 5 to 15, out of range from 15. */
export function ahiReference(ahi: number | undefined): RefState | undefined {
  if (ahi === undefined || Number.isNaN(ahi)) return undefined;
  return ahi < REFERENCE.ahi.normal ? 'good' : ahi < REFERENCE.ahi.severe ? 'warn' : 'bad';
}

/** Usage state: at least 4 hours is within range, less is attention. */
export function usageReference(hours: number | undefined): RefState | undefined {
  if (hours === undefined || Number.isNaN(hours)) return undefined;
  return hours >= REFERENCE.usageHours ? 'good' : 'warn';
}

/**
 * Leak state from the night's 70th-percentile leak (L/min).
 * ResMed: below 24 is within range, 24 or more is out of range (unintentional leak).
 * Philips: 30 to 50 within range; above 50 up to 60 attention; above 60 out of range (total leak, vent included;
 * working band from the maintainer, not yet sourced). Unknown families have no range.
 */
export function leakReference(p70: number | undefined, family: DeviceFamily): RefState | undefined {
  if (p70 === undefined || Number.isNaN(p70)) return undefined;
  if (family === 'resmed') return p70 < REFERENCE.leakResmed ? 'good' : 'bad';
  if (family === 'philips') {
    const { min, max, problem } = REFERENCE.leakPhilips;
    return p70 >= min && p70 <= max ? 'good' : p70 > problem ? 'bad' : 'warn';
  }
  return undefined;
}

/** ODI4 state: same bands as the AHI, for desaturations per hour. */
export function odi4Reference(odi4: number | undefined): RefState | undefined {
  if (odi4 === undefined || Number.isNaN(odi4)) return undefined;
  return odi4 < REFERENCE.odi4.normal ? 'good' : odi4 < REFERENCE.odi4.severe ? 'warn' : 'bad';
}
