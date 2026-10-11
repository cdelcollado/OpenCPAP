import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { compliance, nightsInRange } from '@opencpap/core';
import { Badge } from '../../components/Badge';
import { InfoTip } from '../../components/InfoTip';
import { Meter } from '../../components/Meter';
import { IconWave } from '../../components/icons';
import { download, nightsCsv, summaryJson } from '../../exports';
import { formatNightDate } from '../../format';
import { href } from '../../router';
import { useData } from '../../state';
import { CalendarHeatmap } from './CalendarHeatmap';
import { Hero } from './Hero';
import { ChangesPanel } from '../changes/ChangesPanel';
import { Reminders } from '../equipment/Reminders';
import { AnomalyPanel } from './AnomalyPanel';
import { LlmCard } from '../llm/LlmCard';
import { BreathingTrends } from './BreathingTrends';
import { Distribution } from './Distribution';
import { NightsTable } from './NightsTable';
import { TrendCharts } from './TrendCharts';
import { baseline, type HeatMetric } from './metrics';

type RangeKey = '7' | '30' | '90' | 'all' | 'custom';
const RANGES: RangeKey[] = ['7', '30', '90', 'all', 'custom'];
const HEAT: HeatMetric[] = ['usage', 'ahi', 'leak'];

export function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="card empty">
      <div className="glyph"><IconWave /></div>
      <h1 style={{ margin: 0 }}>{t('dashboard.emptyTitle')}</h1>
      <p className="muted" style={{ maxWidth: '36rem' }}>{t('dashboard.emptyBody')}</p>
      <div className="btn-row" style={{ justifyContent: 'center' }}>
        <a className="btn large" href={href.import}>{t('dashboard.goImport')}</a>
      </div>
      <p className="muted">{t('dashboard.emptyPrivacy')}</p>
    </div>
  );
}

export function Dashboard() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { nights, loading, demoOnly, changes, asOf } = useData();
  const [range, setRange] = useState<RangeKey>('30');
  const [custom, setCustom] = useState<[string, string]>(['', '']);
  const [rolling, setRolling] = useState(true);
  const [heat, setHeat] = useState<HeatMetric>('usage');

  const visible = useMemo(() => {
    if (range === 'custom') return nightsInRange(nights, custom[0] || '0000-00-00', custom[1] || '9999-99-99');
    return range === 'all' ? nights : nights.slice(-Number(range));
  }, [nights, range, custom]);
  const last = nights.at(-1);
  const comp = useMemo(() => (last ? compliance(nights, last.date, 30) : undefined), [nights, last]);
  const base = useMemo(() => baseline(nights, 30), [nights]);

  if (loading) return <p>{t('common.loading')}</p>;
  if (!last || !comp) return <EmptyState />;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{t('dashboard.title')}</h1>
          <p className="sub">{t('dashboard.subtitle', { count: nights.length, date: formatNightDate(last.date, lang) })}</p>
        </div>
        <div className="btn-row">
          <button className="btn secondary" type="button" onClick={() => download(nightsCsv(nights), 'opencpap-nights.csv', 'text/csv;charset=utf-8')}>{t('dashboard.exportNights')}</button>
          <button className="btn secondary" type="button" onClick={() => asOf && download(summaryJson(nights, asOf), 'opencpap-summary.json', 'application/json')}>{t('dashboard.exportSummary')}</button>
        </div>
      </div>
      {demoOnly && <div className="banner" role="note" style={{ marginBottom: '1rem' }}>{t('dashboard.demoBanner')}</div>}

      <Hero nights={nights} last={last} base={base} />
      <div className="stack" style={{ marginTop: '0.9rem' }}>
        <AnomalyPanel />
        <Reminders />
        <LlmCard />
      </div>

      <section className="card" aria-labelledby="comp" style={{ marginTop: '0.9rem' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 id="comp" style={{ margin: 0 }}>{t('dashboard.compliance')} <InfoTip text={t('explain.compliance')} /></h2>
          <Badge level={comp.meetsCommonRule ? 'good' : 'warn'}>{comp.meetsCommonRule ? t('dashboard.meets') : t('dashboard.notMeets')}</Badge>
        </div>
        <Meter ratio={comp.ratio} target={0.7} label={`${Math.round(comp.ratio * 100)} %`} />
        <div className="meter-labels">
          <span><b className="num">{Math.round(comp.ratio * 100)} %</b> · {t('dashboard.complianceDetail', { ok: comp.compliantNights, total: comp.nights })}</span>
          <span>{t('dashboard.complianceRule')}</span>
        </div>
      </section>

      <div className="section-title">
        <h2>{t('dashboard.trends')}</h2>
        <div className="hint">
          <fieldset className="seg" style={{ borderColor: undefined }}>
            <legend className="sr-only">{t('dashboard.range')}</legend>
            {RANGES.map((r) => (
              <label key={r}><input type="radio" name="range" value={r} checked={range === r} onChange={() => setRange(r)} />{t(r === 'all' ? 'dashboard.rangeAll' : r === 'custom' ? 'dashboard.custom' : `dashboard.range${r}`)}</label>
            ))}
          </fieldset>
        </div>
      </div>
      {range === 'custom' && (
        <div className="row" style={{ marginBottom: '0.8rem' }}>
          <label>{t('dashboard.from')} <input type="date" value={custom[0]} min={nights[0]?.date} max={last.date} onChange={(e) => setCustom([e.target.value, custom[1]])} /></label>
          <label>{t('dashboard.to')} <input type="date" value={custom[1]} min={nights[0]?.date} max={last.date} onChange={(e) => setCustom([custom[0], e.target.value])} /></label>
        </div>
      )}
      <label className="row" style={{ margin: '0 0 0.6rem' }}><input type="checkbox" checked={rolling} onChange={(e) => setRolling(e.target.checked)} /> {t('dashboard.rolling')}</label>
      <TrendCharts nights={visible} all={nights} changes={changes} rolling={rolling} />

      <div className="section-title"><h2>{t('dashboard.distributionTitle')}</h2></div>
      <Distribution nights={visible} />

      <div className="section-title"><h2>{t('dashboard.breathingTitle')}</h2></div>
      <BreathingTrends nights={visible} />

      <div className="section-title">
        <h2>{t('dashboard.calendar')}</h2>
        <div className="hint">
          <fieldset className="seg">
            <legend className="sr-only">{t('dashboard.calendarMeasure')}</legend>
            {HEAT.map((h) => (
              <label key={h}><input type="radio" name="heat" value={h} checked={heat === h} onChange={() => setHeat(h)} />{t(h === 'usage' ? 'metric.usage' : h === 'ahi' ? 'metric.ahi' : 'metric.leakP95')}</label>
            ))}
          </fieldset>
        </div>
      </div>
      <div className="card"><CalendarHeatmap nights={visible} metric={heat} /></div>

      <div className="section-title"><h2>{t('changes.title')}</h2></div>
      <ChangesPanel changes={changes} />

      <div className="section-title">
        <h2 id="nights-table">{t('dashboard.nightsTable')}</h2>
        <span className="hint">{t('dashboard.tableHint')}</span>
      </div>
      <div className="card"><NightsTable nights={visible} /></div>
    </div>
  );
}
