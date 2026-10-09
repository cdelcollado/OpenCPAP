import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { leakByAge, type EquipmentItem } from '@opencpap/core';
import { Chart, axisStyle, uPlot, type ChartColors } from '../../components/Chart';
import { tooltipPlugin } from '../../components/chartTooltip';
import { formatNumber } from '../../format';
import { useData } from '../../state';

/** 95 % leak against the age of one equipment item, with a plain-language reading of the trend. */
export function LeakAgeChart({ item }: { item: EquipmentItem }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { nights } = useData();
  const r = useMemo(() => leakByAge(nights, item), [nights, item]);
  const data = useMemo(() => [Float64Array.from(r.points, (p) => p.age), r.points.map((p) => p.leak)] as uPlot.AlignedData, [r.points]);

  const options = useCallback((c: ChartColors): Omit<uPlot.Options, 'width' | 'height'> => ({
    legend: { show: false },
    padding: [8, 12, 0, 0],
    scales: { x: { time: false }, y: { range: (_u, _min, max) => [0, Math.max(max * 1.15, 10)] } },
    axes: [{ ...axisStyle(c), values: (_u, s) => s.map((v) => `${Math.round(v)}`) }, { ...axisStyle(c), size: 46 }],
    series: [{}, { label: t('metric.leakP95'), stroke: c.leak, width: 2, points: { show: true, size: 6, fill: c.leak, stroke: c.surface, width: 1 } }],
    plugins: [tooltipPlugin({
      title: (u, i) => t('equipment.age', { count: Math.round(u.data[0][i]!) }),
      rows: (u, i) => (u.data[1]?.[i] == null ? [] : [{ label: t('metric.leakP95'), value: `${formatNumber(u.data[1][i]!, lang)} ${t('metric.unitLeak')}`, color: c.leak }]),
    })],
  }), [t, lang]);

  if (r.points.length < 6) return <p className="muted">{t('equipment.leakNeedMore')}</p>;
  const slope = r.slope30;
  return (
    <div className="stack">
      <div>
        <h4 style={{ margin: '0 0 0.2rem' }}>{t('equipment.leakChart')}</h4>
        <Chart options={options} data={data} height={170} ariaLabel={t('equipment.leakChart')} zoom={false} />
      </div>
      <ul className="plain">
        {r.early !== undefined && <li>{t('equipment.leakEarly', { value: formatNumber(r.early, lang) })}</li>}
        {r.late !== undefined && <li>{t('equipment.leakLate', { value: formatNumber(r.late, lang) })}</li>}
        {r.trend && slope !== undefined && (
          <li><b>{r.trend === 'rising' ? t('equipment.trendRising', { value: formatNumber(Math.abs(slope), lang) }) : r.trend === 'falling' ? t('equipment.trendFalling', { value: formatNumber(Math.abs(slope), lang) }) : t('equipment.trendFlat')}</b></li>
        )}
      </ul>
      <p className="muted" style={{ fontSize: '0.85rem' }}>{t('equipment.trendNote')}</p>
    </div>
  );
}
