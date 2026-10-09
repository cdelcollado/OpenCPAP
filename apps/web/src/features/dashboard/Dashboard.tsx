import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { compliance } from '@opencpap/core';
import { Badge } from '../../components/Badge';
import { InfoTip } from '../../components/InfoTip';
import { Meter } from '../../components/Meter';
import { IconWave } from '../../components/icons';
import { formatNightDate } from '../../format';
import { href } from '../../router';
import { useData } from '../../state';
import { CalendarHeatmap } from './CalendarHeatmap';
import { Hero } from './Hero';
import { NightsTable } from './NightsTable';
import { TrendCharts } from './TrendCharts';
import { baseline, type HeatMetric } from './metrics';

type RangeKey = '7' | '30' | '90' | 'all';
const RANGES: RangeKey[] = ['7', '30', '90', 'all'];
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
  const { nights, loading, demoOnly } = useData();
  const [range, setRange] = useState<RangeKey>('30');
  const [heat, setHeat] = useState<HeatMetric>('usage');

  const visible = useMemo(() => (range === 'all' ? nights : nights.slice(-Number(range))), [nights, range]);
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
      </div>
      {demoOnly && <div className="banner" role="note" style={{ marginBottom: '1rem' }}>{t('dashboard.demoBanner')}</div>}

      <Hero nights={nights} last={last} base={base} />

      <section className="card" aria-labelledby="comp" style={{ marginTop: '0.9rem' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 id="comp" style={{ margin: 0 }}>{t('dashboard.compliance')} <InfoTip text={t('explain.compliance')} /></h2>
          <Badge level={comp.meetsCommonRule ? 'good' : 'warn'}>{comp.meetsCommonRule ? t('dashboard.meets') : t('dashboard.notMeets')}</Badge>
        </div>
        <Meter ratio={comp.ratio} target={0.7} label={`${Math.round(comp.ratio * 100)} %`} />
        <div className="meter-labels">
          <span><b className="num">{Math.round(comp.ratio * 100)} %</b> · {t('dashboard.complianceDetail', { ok: comp.compliantNights, total: comp.nights })}</span>
          <span>{t('dashboard.complianceRule')}</span>
        </div>
      </section>

      <div className="section-title">
        <h2>{t('dashboard.trends')}</h2>
        <div className="hint">
          <fieldset className="seg" style={{ borderColor: undefined }}>
            <legend className="sr-only">{t('dashboard.range')}</legend>
            {RANGES.map((r) => (
              <label key={r}><input type="radio" name="range" value={r} checked={range === r} onChange={() => setRange(r)} />{t(r === 'all' ? 'dashboard.rangeAll' : `dashboard.range${r}`)}</label>
            ))}
          </fieldset>
        </div>
      </div>
      <TrendCharts nights={visible} />

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

      <div className="section-title">
        <h2 id="nights-table">{t('dashboard.nightsTable')}</h2>
        <span className="hint">{t('dashboard.tableHint')}</span>
      </div>
      <div className="card"><NightsTable nights={visible} /></div>
    </div>
  );
}
