import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_INTERVAL_DAYS, EQUIPMENT_KINDS, addDays, equipmentStatus, type EquipmentItem, type EquipmentKind } from '@opencpap/core';
import { Badge, type Level } from '../../components/Badge';
import { Meter } from '../../components/Meter';
import { repository } from '../../db/repository';
import { formatNightDate } from '../../format';
import { useData } from '../../state';
import { LeakAgeChart } from './LeakAgeChart';

const LEVEL: Record<string, Level> = { ok: 'good', soon: 'warn', due: 'warn', overdue: 'bad', retired: 'neutral' };
const todayIso = () => new Date().toISOString().slice(0, 10);
const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `eq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

interface Draft { id?: string; kind: EquipmentKind; name: string; startDate: string; intervalDays: number; note: string }

export function EquipmentPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { equipment, asOf, reloadEquipment } = useData();
  const reference = asOf ?? todayIso();
  const blank = (): Draft => ({ kind: 'mask', name: '', startDate: reference, intervalDays: DEFAULT_INTERVAL_DAYS.mask, note: '' });
  const [draft, setDraft] = useState<Draft>(blank);
  const [intervalTouched, setIntervalTouched] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const editing = draft.id !== undefined;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) return;
    const existing = draft.id ? equipment.find((x) => x.id === draft.id) : undefined;
    await repository.saveEquipment({ ...existing, id: draft.id ?? newId(), kind: draft.kind, name: draft.name.trim(), startDate: draft.startDate, intervalDays: Math.max(1, Math.round(draft.intervalDays)), note: draft.note.trim() || undefined });
    await reloadEquipment();
    setDraft(blank());
    setIntervalTouched(false);
  };

  const replace = async (item: EquipmentItem) => {
    if (!window.confirm(t('equipment.replaceConfirm', { name: item.name, date: formatNightDate(reference, lang) }))) return;
    await repository.saveEquipment({ ...item, endDate: reference });
    await repository.saveEquipment({ id: newId(), kind: item.kind, name: item.name, startDate: addDays(reference, 1), intervalDays: item.intervalDays });
    await reloadEquipment();
  };

  const active = equipment.filter((x) => !x.endDate);
  const retired = equipment.filter((x) => x.endDate).reverse();

  const card = (item: EquipmentItem) => {
    const st = equipmentStatus(item, reference);
    return (
      <li className="card equip" key={item.id} data-testid="equipment-item">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0 }}>{item.name}</h3>
            <span className="muted">{t(`equipment.kind.${item.kind}`)} · {formatNightDate(item.startDate, lang)}{item.endDate ? ` → ${formatNightDate(item.endDate, lang)}` : ''}</span>
          </div>
          <Badge level={LEVEL[st.state] ?? 'neutral'}>{t(`equipment.state.${st.state}`)}</Badge>
        </div>
        {st.state !== 'retired' && <Meter ratio={st.ageDays / item.intervalDays} target={1} label={`${st.ageDays} / ${item.intervalDays}`} />}
        <div className="meter-labels">
          <span>{t('equipment.age', { count: st.ageDays })}</span>
          {st.state !== 'retired' && <span>{st.daysLeft >= 0 ? t('equipment.left', { count: st.daysLeft }) : t('equipment.overdueBy', { count: -st.daysLeft })}</span>}
        </div>
        {item.note && <p className="muted">{item.note}</p>}
        <div className="btn-row">
          {!item.endDate && <button className="btn secondary" type="button" onClick={() => void replace(item)}>{t('equipment.replaceNow')}</button>}
          <button className="btn secondary" type="button" onClick={() => { setDraft({ id: item.id, kind: item.kind, name: item.name, startDate: item.startDate, intervalDays: item.intervalDays, note: item.note ?? '' }); setIntervalTouched(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>{t('common.edit')}</button>
          <button className="btn danger" type="button" onClick={async () => { if (window.confirm(t('equipment.deleteConfirm', { name: item.name }))) { await repository.deleteEquipment(item.id); await reloadEquipment(); } }}>{t('equipment.delete')}</button>
          <button className="btn secondary" type="button" aria-expanded={open === item.id} onClick={() => setOpen(open === item.id ? null : item.id)}>{t('equipment.leakTitle')}</button>
        </div>
        {open === item.id && <div style={{ marginTop: '0.8rem' }}><LeakAgeChart item={item} /></div>}
      </li>
    );
  };

  return (
    <div className="stack">
      <div className="page-head"><div><h1>{t('equipment.title')}</h1><p className="sub">{t('equipment.intro')}</p></div></div>
      <p className="muted">{t('equipment.hint')} {t('equipment.asOf', { date: formatNightDate(reference, lang) })}</p>

      <form className="card stack" onSubmit={(e) => void save(e)} aria-labelledby="eq-form-title">
        <h2 id="eq-form-title" style={{ margin: 0 }}>{editing ? t('common.edit') : t('equipment.addTitle')}</h2>
        <div className="form-grid">
          <label className="field"><span>{t('equipment.kindLabel')}</span>
            <select value={draft.kind} onChange={(e) => { const kind = e.target.value as EquipmentKind; setDraft({ ...draft, kind, intervalDays: intervalTouched ? draft.intervalDays : DEFAULT_INTERVAL_DAYS[kind] }); }}>
              {EQUIPMENT_KINDS.map((k) => <option key={k} value={k}>{t(`equipment.kind.${k}`)}</option>)}
            </select>
          </label>
          <label className="field"><span>{t('equipment.name')}</span>
            <input type="text" required value={draft.name} maxLength={80} placeholder={t('equipment.namePlaceholder')} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label className="field"><span>{t('equipment.startDate')}</span>
            <input type="date" required value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} />
          </label>
          <label className="field"><span>{t('equipment.interval')}</span>
            <input type="number" min={1} max={3650} required value={draft.intervalDays} onChange={(e) => { setIntervalTouched(true); setDraft({ ...draft, intervalDays: Number(e.target.value) }); }} />
          </label>
          <label className="field wide"><span>{t('equipment.note')}</span>
            <input type="text" value={draft.note} maxLength={200} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          </label>
        </div>
        <div className="btn-row">
          <button className="btn" type="submit">{editing ? t('equipment.save') : t('equipment.add')}</button>
          {editing && <button className="btn secondary" type="button" onClick={() => { setDraft(blank()); setIntervalTouched(false); }}>{t('common.cancel')}</button>}
        </div>
      </form>

      <section aria-labelledby="eq-active">
        <h2 id="eq-active">{t('equipment.active')}</h2>
        {active.length === 0 ? <p className="muted">{t('equipment.none')}</p> : <ul className="plain stack-list">{active.map(card)}</ul>}
      </section>
      {retired.length > 0 && (
        <section aria-labelledby="eq-retired">
          <h2 id="eq-retired">{t('equipment.retired')}</h2>
          <ul className="plain stack-list">{retired.map(card)}</ul>
        </section>
      )}
    </div>
  );
}
