import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { NightSummary } from '@opencpap/core';
import { readColors, useThemeVersion } from '../../components/Chart';
import { heatRamp } from '../../color';
import { formatHours, formatNightDate, formatNumber } from '../../format';
import { href } from '../../router';
import { daysInMonth, firstWeekday, heatDomain, heatValue, monthsBetween, type HeatMetric } from './metrics';

const BINS = 6; // few classes read better than a continuous ramp (and blur past ~7)

/** One cell per night, coloured on a single-hue ramp by the chosen measure. Each cell links to its night. */
export function CalendarHeatmap({ nights, metric }: { nights: NightSummary[]; metric: HeatMetric }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const theme = useThemeVersion();
  const byDate = useMemo(() => new Map(nights.map((n) => [n.date, n])), [nights]);
  const [lo, hi] = useMemo(() => heatDomain(nights, metric), [nights, metric]);
  const colors = useMemo(() => readColors(), [theme]);
  const hue = metric === 'usage' ? colors.usage : metric === 'ahi' ? colors.ahi : colors.leak;
  const ramp = useMemo(() => heatRamp(colors.surface2, hue, BINS), [colors, hue]);

  if (nights.length === 0) return null;
  const months = monthsBetween(nights[0]!.date, nights.at(-1)!.date);
  const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(lang, { weekday: 'narrow', timeZone: 'UTC' }).format(Date.UTC(2024, 0, 1 + i)));
  const fmt = (v: number) => (metric === 'usage' ? formatHours(v) : metric === 'ahi' ? `${formatNumber(v, lang)}${t('metric.unitPerHour')}` : `${formatNumber(v, lang, 0)} ${t('metric.unitLeak')}`);

  return (
    <div>
      <div className="heat" role="group" aria-label={t('dashboard.calendar')}>
        {months.map((m) => {
          const [y, mo] = m.split('-').map(Number) as [number, number];
          const title = new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(y, mo - 1, 1));
          const blanks = firstWeekday(m);
          return (
            <div className="heat-month" key={m}>
              <h3>{title}</h3>
              <div className="heat-grid">
                {weekdays.map((d, i) => <span className="heat-dow" key={`d${i}`} aria-hidden="true">{d}</span>)}
                {Array.from({ length: blanks }, (_, i) => <span className="heat-cell blank" key={`b${i}`} />)}
                {Array.from({ length: daysInMonth(m) }, (_, i) => {
                  const day = i + 1;
                  const date = `${m}-${String(day).padStart(2, '0')}`;
                  const n = byDate.get(date);
                  const v = n ? heatValue(n, metric) : undefined;
                  if (!n || v === undefined) return <span className="heat-cell" key={date} aria-hidden="true">{''}</span>;
                  const bin = Math.max(0, Math.min(BINS - 1, Math.floor(((v - lo) / (hi - lo || 1)) * BINS)));
                  const step = ramp[bin]!;
                  return (
                    <a key={date} className="heat-cell has" href={href.night(date)} style={{ background: step.bg, color: step.ink }}
                      title={`${formatNightDate(date, lang)}: ${fmt(v)}`} aria-label={`${formatNightDate(date, lang)}: ${fmt(v)}`}>
                      {day}
                    </a>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="scale" aria-hidden="true">
        <span>{fmt(lo)}</span>
        <span className="ramp">{ramp.map((r, i) => <i key={i} style={{ background: r.bg }} />)}</span>
        <span>{fmt(hi)}</span>
      </div>
    </div>
  );
}
