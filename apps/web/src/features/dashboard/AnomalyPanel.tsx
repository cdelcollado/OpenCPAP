import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { detectAnomalies } from '@opencpap/core';
import { Badge } from '../../components/Badge';
import { formatNightDate } from '../../format';
import { href } from '../../router';
import { useData } from '../../state';

/** Patterns in the latest nights that deserve a look (rules in docs/analytics.md). Renders nothing when there are none. */
export function AnomalyPanel() {
  const { t, i18n } = useTranslation();
  const { nights } = useData();
  const found = useMemo(() => detectAnomalies(nights), [nights]);
  if (found.length === 0) return null;
  return (
    <section className="card stack" aria-labelledby="anomaly-title" data-testid="anomalies">
      <h2 id="anomaly-title" style={{ margin: 0 }}>{t('dashboard.anomaliesTitle')}</h2>
      <ul className="plain anomalies">
        {found.map((a) => (
          <li key={a.id}>
            <Badge level={a.level === 'warn' ? 'warn' : 'neutral'}>{t(`anomaly.${a.id}`, a.params)}</Badge>
            <span className="row">{a.dates.slice(-3).map((d) => <a key={d} href={href.night(d)}>{formatNightDate(d, i18n.language, 'short')}</a>)}</span>
          </li>
        ))}
      </ul>
      <p className="muted" style={{ fontSize: '0.85rem' }}>{t('anomaly.note')}</p>
    </section>
  );
}
