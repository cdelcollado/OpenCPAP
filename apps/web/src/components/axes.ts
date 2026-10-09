import type uPlot from 'uplot';
import { formatClock, formatClockSeconds } from '../format';

/** Wall-clock axis labels in the user's locale (24 h for ca/es, 12 h for en); seconds only when zoomed in far. */
export const clockAxisValues = (lang: string): uPlot.Axis.Values => (_u, splits, _axis, _space, incr) =>
  splits.map((v) => (incr < 60 ? formatClockSeconds(v * 1000, lang) : formatClock(v * 1000, lang)));

/** Day labels ("8 Oct") for the dashboard's calendar axes. */
export const dayAxisValues = (lang: string): uPlot.Axis.Values => (_u, splits) =>
  splits.map((v) => new Intl.DateTimeFormat(lang, { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(v * 1000));
