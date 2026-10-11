import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { aroundChange, comparePeriods, nightsInRange, periodStats, recentVersusPrevious, type ChangeEvent, type EventType, type NightSummary, type PeriodStats } from '@opencpap/core';
import { Delta } from '../../components/Delta';
import { InfoTip } from '../../components/InfoTip';
import { formatHours, formatNightDate, formatNumber } from '../../format';
import { href, useRoute, type DateRange } from '../../router';
import { useData } from '../../state';
import { describeChanges, settingLabel, settingValue } from '../changes/format';
import { EVENT_COLOR, EVENT_ORDER } from '../night/Timeline';
import { IconWarn } from '../../components/icons';

const go = (a: DateRange, b: DateRange) => { window.location.hash = href.compare(a, b); };
const pct = (v: number | undefined, lang: string) => (v === undefined ? '—' : `${formatNumber(v * 100, lang, 0)} %`);

export function ComparePage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const route = useRoute();
  const { nights, changes, asOf } = useData();
  const last = asOf;

  // defaults: the last 30 nights against the 30 before
  const defaults = useMemo(() => (last ? recentVersusPrevious(last, 30) : undefined), [last]);
  const a = (route.name === 'compare' && route.a) || defaults?.a;
  const b = (route.name === 'compare' && route.b) || defaults?.b;

  const data = useMemo(() => {
    if (!a || !b) return undefined;
    const na = nightsInRange(nights, a[0], a[1]), nb = nightsInRange(nights, b[0], b[1]);
    const sa = periodStats(na), sb = periodStats(nb);
    return { na, nb, cmp: comparePeriods(sa, sb) };
  }, [nights, a, b]);

  if (!last || !a || !b) return <div className="card">{t('dashboard.emptyBody')}</div>;

  const setA = (r: DateRange) => go(r, b);
  const setB = (r: DateRange) => go(a, r);
  const preset = (end: string, days: number) => { const p = recentVersusPrevious(end, days); go(p.a, p.b); };
  const first = nights[0]?.date, max = last;
  const overlap = a[1] >= b[0] && b[1] >= a[0];

  const settingKeys = (() => {
    if (!data) return [] as string[];
    const sa = data.na[0]?.settings ?? {}, sb = data.nb[0]?.settings ?? {};
    return [...new Set([...Object.keys(sa), ...Object.keys(sb)])].sort((x, y) => settingLabel(x, t).localeCompare(settingLabel(y, t)));
  })();
  const inside = changes.filter((c) => (c.date >= a[0] && c.date <= a[1]) || (c.date >= b[0] && c.date <= b[1]));

  return (
    <div className="stack">
      <div className="page-head"><div><h1>{t('compare.title')}</h1><p className="sub">{t('compare.intro')}</p></div></div>

      <section className="card stack" aria-labelledby="cmp-pick">
        <h2 id="cmp-pick" className="sr-only">{t('compare.presets')}</h2>
        <div className="two-col">
          <PeriodPicker label={t('compare.periodA')} value={a} min={first} max={max} onChange={setA} />
          <PeriodPicker label={t('compare.periodB')} value={b} min={first} max={max} onChange={setB} />
        </div>
        <div className="row">
          <span className="muted">{t('compare.presets')}:</span>
          <button className="btn secondary small" type="button" onClick={() => preset(last, 30)}>{t('compare.preset30')}</button>
          <button className="btn secondary small" type="button" onClick={() => preset(last, 90)}>{t('compare.preset90')}</button>
          <ChangePreset changes={changes} />
          <button className="btn secondary small" type="button" onClick={() => go(b, a)}>{t('compare.swap')}</button>
          <a className="btn secondary small" href={href.report(b)}>{t('compare.reportFor')}</a>
        </div>
        {overlap && <p className="banner warn" role="note">{t('compare.overlap')}</p>}
      </section>

      {data && data.cmp.a.nights > 0 && data.cmp.b.nights > 0 ? (
        <>
          <section className="card" aria-labelledby="cmp-table">
            <h2 id="cmp-table" className="sr-only">{t('compare.title')}</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t('compare.metric')}</th>
                    <th scope="col" className="num">A<span className="sr-only"> ({formatNightDate(a[0], lang, 'short')} – {formatNightDate(a[1], lang, 'short')})</span></th>
                    <th scope="col" className="num">B</th>
                    <th scope="col" className="num">{t('compare.change')}</th>
                  </tr>
                </thead>
                <tbody>
                  <Row label={t('compare.nights')} a={String(data.cmp.a.nights)} b={String(data.cmp.b.nights)} />
                  <Row label={t('compare.usage')} a={fmtH(data.cmp.a.usageMean)} b={fmtH(data.cmp.b.usageMean)} change={<Delta value={data.cmp.b.usageMean} baseline={data.cmp.a.usageMean} goodWhen="up" suffix={t('metric.unitHours')} lang={lang} />} info={t('explain.usage')} />
                  <Row label={t('compare.over4')} a={pct(data.cmp.a.compliance, lang)} b={pct(data.cmp.b.compliance, lang)} change={<Delta value={pctNum(data.cmp.b.compliance)} baseline={pctNum(data.cmp.a.compliance)} digits={0} goodWhen="up" suffix="%" lang={lang} />} info={t('explain.compliance')} />
                  <Row label={t('compare.ahi')} a={formatNumber(data.cmp.a.ahi, lang)} b={formatNumber(data.cmp.b.ahi, lang)} change={<Delta value={data.cmp.b.ahi} baseline={data.cmp.a.ahi} digits={2} goodWhen="down" suffix={t('metric.unitPerHour')} lang={lang} />} info={t('explain.ahi')} />
                  <Row label={t('compare.ahiMedian')} a={formatNumber(data.cmp.a.ahiMedian, lang)} b={formatNumber(data.cmp.b.ahiMedian, lang)} change={<Delta value={data.cmp.b.ahiMedian} baseline={data.cmp.a.ahiMedian} digits={2} goodWhen="down" suffix={t('metric.unitPerHour')} lang={lang} />} />
                  <Row label={t('compare.leakP95')} a={formatNumber(data.cmp.a.leakP95, lang)} b={formatNumber(data.cmp.b.leakP95, lang)} change={<Delta value={data.cmp.b.leakP95} baseline={data.cmp.a.leakP95} suffix={t('metric.unitLeak')} lang={lang} />} info={t('explain.leak')} />
                  <Row label={t('compare.leakMedian')} a={formatNumber(data.cmp.a.leakMedian, lang)} b={formatNumber(data.cmp.b.leakMedian, lang)} change={<Delta value={data.cmp.b.leakMedian} baseline={data.cmp.a.leakMedian} suffix={t('metric.unitLeak')} lang={lang} />} />
                </tbody>
              </table>
            </div>
          </section>

          <section className="card stack" aria-labelledby="cmp-rates">
            <h2 id="cmp-rates" style={{ margin: 0 }}>{t('compare.rates')}</h2>
            <RateBars a={data.cmp.a} b={data.cmp.b} />
          </section>
        </>
      ) : <div className="banner warn" role="status">{t('compare.noData')}</div>}

      {data && (
        <section className="card stack" aria-labelledby="cmp-settings">
          <h2 id="cmp-settings" style={{ margin: 0 }}>{t('compare.settings')}</h2>
          <p className="muted">{t('compare.settingsHint')}</p>
          <SettingsDiff keys={settingKeys} na={data.na[0]} nb={data.nb[0]} />
          <h3>{t('compare.changesInside')}</h3>
          {inside.length === 0 ? <p>{t('compare.none')}</p> : <ul className="plain">{inside.map((c) => <li key={c.date}><a href={href.night(c.date)}>{formatNightDate(c.date, lang)}</a> — {describeChanges(c, t, lang, 4)}</li>)}</ul>}
        </section>
      )}
      <p className="muted" style={{ fontSize: '0.88rem' }}>{t('compare.caution')}</p>
    </div>
  );
}

const pctNum = (v?: number) => (v === undefined ? undefined : v * 100);
const fmtH = (v?: number) => (v === undefined ? '—' : formatHours(v));

function PeriodPicker({ label, value, min, max, onChange }: { label: string; value: DateRange; min?: string; max?: string; onChange: (r: DateRange) => void }) {
  const { t } = useTranslation();
  return (
    <fieldset className="period">
      <legend>{label}</legend>
      <label className="field"><span>{t('compare.from')}</span><input type="date" value={value[0]} min={min} max={max} onChange={(e) => e.target.value && onChange([e.target.value, value[1] < e.target.value ? e.target.value : value[1]])} /></label>
      <label className="field"><span>{t('compare.to')}</span><input type="date" value={value[1]} min={min} max={max} onChange={(e) => e.target.value && onChange([value[0] > e.target.value ? e.target.value : value[0], e.target.value])} /></label>
    </fieldset>
  );
}

function ChangePreset({ changes }: { changes: ChangeEvent[] }) {
  const { t, i18n } = useTranslation();
  if (changes.length === 0) return <span className="muted">{t('compare.presetChangeNone')}</span>;
  return (
    <label className="row">
      <span className="sr-only">{t('compare.presetChange')}</span>
      <select value="" onChange={(e) => { if (e.target.value) { const p = aroundChange(e.target.value, 30); go(p.a, p.b); } }} aria-label={t('compare.presetChange')}>
        <option value="">{t('compare.presetChange')}…</option>
        {[...changes].reverse().map((c) => <option key={c.date} value={c.date}>{t('compare.presetChangeLabel', { date: formatNightDate(c.date, i18n.language, 'short'), what: describeChanges(c, t, i18n.language, 1) })}</option>)}
      </select>
    </label>
  );
}

function Row({ label, a, b, change, info }: { label: string; a: string; b: string; change?: React.ReactNode; info?: string }) {
  return <tr><th scope="row">{label} {info && <InfoTip text={info} />}</th><td className="num">{a}</td><td className="num">{b}</td><td className="num">{change ?? ''}</td></tr>;
}

/** Events per hour of use for both periods, as paired bars: A in the muted tone, B in the event's colour. */
function RateBars({ a, b }: { a: PeriodStats; b: PeriodStats }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const types = EVENT_ORDER.filter((e) => (a.rates[e] ?? 0) > 0 || (b.rates[e] ?? 0) > 0);
  const max = Math.max(0.01, ...types.flatMap((e) => [a.rates[e] ?? 0, b.rates[e] ?? 0]));
  if (types.length === 0) return <p className="muted">{t('night.noEvents')}</p>;
  return (
    <div className="rate-bars">
      {types.map((e: EventType) => (
        <div className="rate-row" key={e}>
          <span>{t(`event.${e}`)}</span>
          <div className="pair">
            <div className="bar"><span className="track"><i style={{ width: `${((a.rates[e] ?? 0) / max) * 100}%`, background: 'var(--chart-muted)' }} /></span><b>A {formatNumber(a.rates[e] ?? 0, lang, 2)}</b></div>
            <div className="bar"><span className="track"><i style={{ width: `${((b.rates[e] ?? 0) / max) * 100}%`, background: EVENT_COLOR[e] }} /></span><b>B {formatNumber(b.rates[e] ?? 0, lang, 2)}</b></div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SettingsDiff({ keys, na, nb }: { keys: string[]; na?: NightSummary; nb?: NightSummary }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  if (!na || !nb) return null;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th scope="col">{t('compare.metric')}</th><th scope="col">A</th><th scope="col">B</th></tr></thead>
        <tbody>
          {keys.map((k) => {
            const x = na.settings[k], y = nb.settings[k];
            const differs = x !== y && x !== undefined && y !== undefined;
            return (
              <tr key={k} className={differs ? 'differs' : undefined}>
                <th scope="row">{settingLabel(k, t)}{differs && <span className="badge badge-warn" style={{ marginLeft: '0.5rem' }}><IconWarn />{t('changes.marker')}</span>}</th>
                <td>{x === undefined ? '—' : settingValue(k, x, t, lang)}</td>
                <td>{y === undefined ? '—' : settingValue(k, y, t, lang)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
