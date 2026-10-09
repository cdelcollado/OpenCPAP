import { useTranslation } from 'react-i18next';
import { dueItems } from '@opencpap/core';
import { Badge, type Level } from '../../components/Badge';
import { href } from '../../router';
import { useData } from '../../state';

const LEVEL: Record<string, Level> = { soon: 'warn', due: 'warn', overdue: 'bad' };

/** Equipment that is due or nearly due, shown on the dashboard. Renders nothing when everything is in good time. */
export function Reminders() {
  const { t } = useTranslation();
  const { equipment, asOf } = useData();
  if (!asOf) return null;
  const due = dueItems(equipment, asOf);
  if (due.length === 0) return null;
  return (
    <section className="card" aria-labelledby="rem-title">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 id="rem-title" style={{ margin: 0 }}>{t('reminders.title')}</h2>
        <a href={href.equipment}>{t('reminders.manage')}</a>
      </div>
      <ul className="reminders">
        {due.map(({ item, status }) => (
          <li key={item.id}>
            <span><b>{item.name}</b> <span className="muted">({t(`equipment.kind.${item.kind}`)})</span></span>
            <Badge level={LEVEL[status.state] ?? 'neutral'}>{t(`equipment.state.${status.state}`)}</Badge>
            <span className="muted">{status.daysLeft >= 0 ? t('equipment.left', { count: status.daysLeft }) : t('equipment.overdueBy', { count: -status.daysLeft })}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
