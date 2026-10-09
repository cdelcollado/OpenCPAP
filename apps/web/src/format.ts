/**
 * Formatting helpers. Timestamps in the model are device wall-clock time encoded as UTC, so every date/time is
 * formatted with `timeZone: 'UTC'` to show exactly what the device recorded.
 */

export function formatDuration(hours: number): { h: number; min: number } {
  const total = Math.max(0, Math.round(hours * 60));
  return { h: Math.floor(total / 60), min: total % 60 };
}

/** "7 h 05 min" */
export function formatHours(hours: number): string {
  const { h, min } = formatDuration(hours);
  return `${h} h ${String(min).padStart(2, '0')} min`;
}

export function formatNumber(value: number | undefined, lang: string, digits = 1): string {
  if (value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

/** Wall-clock time "23:05" from a model timestamp (ms). */
export function formatClock(ms: number, lang: string): string {
  return new Intl.DateTimeFormat(lang, { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false }).format(ms);
}

/** Wall-clock time with seconds "23:05:10". */
export function formatClockSeconds(ms: number, lang: string): string {
  return new Intl.DateTimeFormat(lang, { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(ms);
}

/** Night date label from YYYY-MM-DD, e.g. "Sat, 5 Mar 2026". */
export function formatNightDate(date: string, lang: string, style: 'long' | 'short' = 'long'): string {
  const ms = Date.parse(`${date}T12:00:00Z`);
  return new Intl.DateTimeFormat(lang, {
    timeZone: 'UTC',
    ...(style === 'long' ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' }),
  } as Intl.DateTimeFormatOptions).format(ms);
}

export function formatBytes(bytes: number, lang: string): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${new Intl.NumberFormat(lang, { maximumFractionDigits: i === 0 ? 0 : 1 }).format(v)} ${units[i]}`;
}

/** Adds `days` to a YYYY-MM-DD string. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400_000).toISOString().slice(0, 10);
}
