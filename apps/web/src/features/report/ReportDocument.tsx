import { useTranslation } from 'react-i18next';
import { ahiReference, deviceFamily, equipmentStatus, isMajor, leakReference, percentile, periodStats, REFERENCE, usageReference, type ChangeEvent, type EquipmentItem, type NightSummary, type PeriodStats } from '@opencpap/core';
import { leakNote } from '../../components/leakNote';
import { RefBadge } from '../../components/RefBadge';
import type { JournalRow } from '../../db/db';
import { formatHours, formatNightDate, formatNumber } from '../../format';
import { describeChanges, settingLabel, settingValue } from '../changes/format';
import { EVENT_ORDER } from '../night/Timeline';
import { SvgChart } from './SvgCharts';

export interface ReportOptions { includeNotes: boolean; includeNights: boolean; includeEquipment: boolean; includeCompare: boolean }

export interface ReportInput {
  from: string;
  to: string;
  nights: NightSummary[];
  /** previous period of the same length, when comparison is on */
  previous?: { from: string; to: string; nights: NightSummary[] };
  changes: ChangeEvent[];
  equipment: EquipmentItem[];
  journal: JournalRow[];
  asOf: string;
  device: string;
  patient: string;
  generated: string;
  totalDays: number;
  options: ReportOptions;
}

const MOODS = ['😣', '🙁', '😐', '🙂', '😄'];

/** The printable report. Pure presentation of `ReportInput`: everything printed here is computed in @opencpap/core. */
export function ReportDocument({ r }: { r: ReportInput }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const s = periodStats(r.nights);
  const p: PeriodStats | undefined = r.previous && r.previous.nights.length ? periodStats(r.previous.nights) : undefined;
  const last = r.nights.at(-1);
  const family = deviceFamily(last?.manufacturer);
  /** Reference cell: an optional three-state badge, then the reference text (never a status alone). */
  const ref = (state: ReturnType<typeof ahiReference>, text?: string) => (
    <td className="ref">{state && <RefBadge state={state} />}{text && <div className="muted">{text}</div>}</td>
  );
  const n1 = (v: number | undefined, d = 1) => formatNumber(v, lang, d);
  const pct = (v: number | undefined) => (v === undefined ? '—' : `${formatNumber(v * 100, lang, 0)} %`);
  const hrs = (v: number | undefined) => (v === undefined ? '—' : formatHours(v));
  const changesInRange = r.changes.filter((c) => c.date >= r.from && c.date <= r.to);
  const markers = changesInRange.map((c) => c.date);
  const pressure = last?.pressure ? (last.pressure.min === last.pressure.max ? `${n1(last.pressure.max)} ${t('metric.unitPressure')}` : `${n1(last.pressure.min)}–${n1(last.pressure.max)} ${t('metric.unitPressure')}`) : '—';
  const types = EVENT_ORDER.filter((e) => (s.rates[e] ?? 0) > 0 || (p?.rates[e] ?? 0) > 0);
  const totals: Record<string, number> = {};
  for (const n of r.nights) for (const [k, v] of Object.entries(n.counts)) totals[k] = (totals[k] ?? 0) + v;
  const med = (xs: (number | undefined)[]) => { const v = xs.filter((x): x is number => x !== undefined && !Number.isNaN(x)); return v.length ? percentile(v, 50) : undefined; };
  const oxi = r.nights.filter((n) => n.oximetry);
  const br = r.nights.filter((n) => n.breathing);
  const notes = r.options.includeNotes ? r.journal.filter((j) => j.date >= r.from && j.date <= r.to).sort((a, b) => (a.date < b.date ? -1 : 1)) : [];

  return (
    <article className="report" aria-labelledby="report-title">
      <header className="report-head">
        <h1 id="report-title">{t('report.docTitle')}</h1>
        <p>{t('report.docPeriod', { from: formatNightDate(r.from, lang), to: formatNightDate(r.to, lang) })}</p>
        {r.patient && <p>{t('report.docPatient', { name: r.patient })}</p>}
        {r.device && <p>{t('report.docDevice', { device: r.device })}</p>}
        <p className="muted">{t('report.docGenerated', { date: r.generated })}</p>
      </header>

      {r.nights.length === 0 ? <p>{t('report.noData')}</p> : (
        <>
          <section>
            <h2>{t('report.summary')}</h2>
            <p className="muted">{t('report.nightsWithData', { count: s.nights, total: r.totalDays })}</p>
            <table className="report-table summary">
              <colgroup>
                <col style={{ width: '42%' }} />
                <col style={{ width: '16%' }} />
                {p && r.previous && <col style={{ width: '16%' }} />}
                <col style={{ width: p && r.previous ? '26%' : '42%' }} />
              </colgroup>
              <thead><tr><th scope="col">{t('compare.metric')}</th><th scope="col" className="num">{formatNightDate(r.from, lang, 'short')} – {formatNightDate(r.to, lang, 'short')}</th>{p && r.previous && <th scope="col" className="num">{t('report.vsPrevious', { from: formatNightDate(r.previous.from, lang, 'short'), to: formatNightDate(r.previous.to, lang, 'short') })}</th>}<th scope="col">{t('reference.column')}</th></tr></thead>
              <tbody>
                <tr><th scope="row">{t('compare.usage')}</th><td className="num">{hrs(s.usageMean)}</td>{p && <td className="num">{hrs(p.usageMean)}</td>}{ref(usageReference(s.usageMean), t('reference.usage', { hours: REFERENCE.usageHours }))}</tr>
                <tr><th scope="row">{t('compare.over4')}</th><td className="num">{s.nightsOverMin} / {s.nights} ({pct(s.compliance)})</td>{p && <td className="num">{p.nightsOverMin} / {p.nights} ({pct(p.compliance)})</td>}{ref(undefined, t('reference.compliance', { hours: REFERENCE.usageHours, share: REFERENCE.complianceShare * 100 }))}</tr>
                <tr><th scope="row">{t('compare.ahi')}</th><td className="num">{n1(s.ahi, 2)}</td>{p && <td className="num">{n1(p.ahi, 2)}</td>}{ref(ahiReference(s.ahi), t('reference.ahi', { normal: REFERENCE.ahi.normal }))}</tr>
                <tr><th scope="row">{t('compare.ahiMedian')}</th><td className="num">{n1(s.ahiMedian, 2)}</td>{p && <td className="num">{n1(p.ahiMedian, 2)}</td>}{ref(ahiReference(s.ahiMedian))}</tr>
                <tr><th scope="row">{t('compare.leakP95')} ({t('metric.unitLeak')})</th><td className="num">{n1(s.leakP95)}</td>{p && <td className="num">{n1(p.leakP95)}</td>}{ref(leakReference(s.leakP70, family), leakNote(t, family))}</tr>
                <tr><th scope="row">{t('metric.pressure')}</th><td className="num">{pressure}</td>{p && <td />}{ref(undefined, t('reference.none'))}</tr>
              </tbody>
            </table>
            {r.options.includeCompare && !p && <p className="muted">{t('report.noPrevious')}</p>}
            <p className="muted">{t('reference.footnote')}</p>
            {oxi.length > 0 && (
              <p><b>{t('report.oximetry')}:</b> {t('report.oximetryLine', { count: oxi.length, mean: n1(oxi.reduce((a, n) => a + (n.oximetry!.spo2Mean ?? 0), 0) / oxi.length), min: n1(Math.min(...oxi.map((n) => n.oximetry!.spo2Min ?? 100)), 0), t90: n1(med(oxi.map((n) => n.oximetry!.t90))), odi: n1(oxi.reduce((a, n) => a + (n.oximetry!.odi3 ?? 0), 0) / oxi.length) })}</p>
            )}
            {br.length > 0 && (
              <p><b>{t('report.breathing')}:</b> {t('report.breathingLine', { count: br.length, rate: n1(med(br.map((n) => n.breathing!.rate))), flat: n1(med(br.map((n) => n.breathing!.flatShare === undefined ? undefined : n.breathing!.flatShare * 100)), 0), cv: n1(med(br.map((n) => n.breathing!.periodCv === undefined ? undefined : n.breathing!.periodCv * 100)), 0) })}</p>
            )}
          </section>

          <section>
            <h2>{t('report.trends')}</h2>
            <SvgChart kind="bars" label={t('dashboard.usageChart')} unit={t('metric.unitHours')} color="var(--m-usage)" lang={lang} from={r.from} to={r.to} points={r.nights.map((n) => ({ date: n.date, value: n.usageHours }))} reference={4} markers={markers} />
            <SvgChart kind="bars" label={t('dashboard.ahiChart')} unit={t('metric.unitPerHour')} color="var(--m-ahi)" lang={lang} from={r.from} to={r.to} points={r.nights.map((n) => ({ date: n.date, value: n.ahi ?? null }))} reference={5} markers={markers} />
            <SvgChart kind="line" label={t('dashboard.leakChart')} unit={t('metric.unitLeak')} color="var(--m-leak)" lang={lang} from={r.from} to={r.to} points={r.nights.map((n) => ({ date: n.date, value: n.leak?.p95 ?? null }))} markers={markers} />
            <p className="muted small">{t('report.refHint')} {markers.length > 0 && t('dashboard.markersHint')}</p>
          </section>

          <section>
            <h2>{t('report.events')}</h2>
            <p className="muted">{t('report.eventsHint')}</p>
            <table className="report-table">
              <thead><tr><th scope="col">{t('metric.events')}</th><th scope="col" className="num">{t('night.count')}</th><th scope="col" className="num">{t('compare.rates')}</th>{p && <th scope="col" className="num">{t('report.vsPrevious', { from: formatNightDate(r.previous!.from, lang, 'short'), to: formatNightDate(r.previous!.to, lang, 'short') })}</th>}</tr></thead>
              <tbody>{types.map((e) => <tr key={e}><th scope="row">{t(`event.${e}`)}</th><td className="num">{totals[e] ?? 0}</td><td className="num">{n1(s.rates[e], 2)}</td>{p && <td className="num">{n1(p.rates[e] ?? 0, 2)}</td>}</tr>)}</tbody>
            </table>
          </section>

          <section>
            <h2>{t('report.settingsNow')}</h2>
            <dl className="kv">
              {Object.entries(last?.settings ?? {}).filter(([k]) => isMajor(k) || ['humidifierMode', 'humidifierLevel', 'tubingDiameterMm', 'maskResistance'].includes(k)).map(([k, v]) => (
                <div key={k}><dt>{settingLabel(k, t)}</dt><dd>{settingValue(k, v as string | number | boolean, t, lang)}</dd></div>
              ))}
            </dl>
            <h3>{t('report.changes')}</h3>
            {changesInRange.length === 0 ? <p>{t('report.noChanges')}</p> : <ul className="plain">{changesInRange.map((c) => <li key={c.date}><b>{formatNightDate(c.date, lang)}</b> — {describeChanges(c, t, lang, 5)}</li>)}</ul>}
          </section>

          {r.options.includeEquipment && r.equipment.length > 0 && (
            <section>
              <h2>{t('report.equipment')}</h2>
              <table className="report-table">
                <thead><tr><th scope="col">{t('equipment.name')}</th><th scope="col">{t('equipment.kindLabel')}</th><th scope="col">{t('equipment.startDate')}</th><th scope="col" className="num">{t('equipment.interval')}</th><th scope="col">{t('equipment.status')}</th></tr></thead>
                <tbody>{r.equipment.filter((e) => !e.endDate).map((e) => { const st = equipmentStatus(e, r.asOf); return <tr key={e.id}><th scope="row">{e.name}</th><td>{t(`equipment.kind.${e.kind}`)}</td><td>{formatNightDate(e.startDate, lang)}</td><td className="num">{e.intervalDays}</td><td>{t(`equipment.state.${st.state}`)} · {t('equipment.age', { count: st.ageDays })}</td></tr>; })}</tbody>
              </table>
            </section>
          )}

          {notes.length > 0 && (
            <section>
              <h2>{t('report.notes')}</h2>
              <ul className="plain report-notes">
                {notes.map((j) => (
                  <li key={j.date}>
                    <b>{formatNightDate(j.date, lang)}</b>{j.mood ? ` ${MOODS[j.mood - 1]} ${t(`journal.mood${j.mood}`)}` : ''}{j.tags.length ? ` · ${j.tags.join(', ')}` : ''}
                    {j.note && <div className="note-text">{j.note}</div>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {r.options.includeNights && (
            <section>
              <h2>{t('report.nightsTable')}</h2>
              <table className="report-table compact">
                <thead><tr><th scope="col">{t('common.date')}</th><th scope="col" className="num">{t('metric.usage')}</th><th scope="col" className="num">{t('metric.ahi')}</th><th scope="col" className="num">OA</th><th scope="col" className="num">CA</th><th scope="col" className="num">H</th><th scope="col" className="num">RERA</th><th scope="col" className="num">{t('metric.leakP95')}</th></tr></thead>
                <tbody>{r.nights.map((n) => <tr key={n.date}><th scope="row">{formatNightDate(n.date, lang)}</th><td className="num">{formatHours(n.usageHours)}</td><td className="num">{n1(n.ahi)}</td><td className="num">{n.counts.obstructive ?? 0}</td><td className="num">{n.counts.central ?? 0}</td><td className="num">{n.counts.hypopnea ?? 0}</td><td className="num">{n.counts.rera ?? 0}</td><td className="num">{n1(n.leak?.p95)}</td></tr>)}</tbody>
              </table>
            </section>
          )}
        </>
      )}
      <footer className="report-foot">
        <p>{t('report.limits')}</p>
        <p>{t('footer.disclaimer')}</p>
      </footer>
    </article>
  );
}
