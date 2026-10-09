import { useTranslation } from 'react-i18next';
import type { Finding } from '@opencpap/core';
import { IconAlert, IconCheck, IconDot, IconWarn } from '../../components/icons';
import { formatHours } from '../../format';

const ICON = { good: IconCheck, warn: IconWarn, info: IconDot } as const;

/** Plain-language summary of the night: one sentence per observation, each with an icon (never colour alone). */
export function Findings({ findings }: { findings: Finding[] }) {
  const { t } = useTranslation();
  return (
    <section className="card stack" aria-labelledby="findings-title">
      <h2 id="findings-title" style={{ margin: 0 }}>{t('findings.title')}</h2>
      <ul className="findings">
        {findings.map((f) => {
          const Icon = ICON[f.level] ?? IconAlert;
          return <li key={f.id} className={`finding-${f.level}`}><Icon />{t(`finding.${f.id}`, typeof f.params.minutes === 'number' && f.id.startsWith('usage') ? { ...f.params, time: formatHours(f.params.minutes / 60) } : f.params)}</li>;
        })}
      </ul>
      <p className="muted" style={{ fontSize: '0.85rem' }}>{t('findings.disclaimer')}</p>
    </section>
  );
}
