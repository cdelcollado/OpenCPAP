import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, daysBetween, nightsInRange } from '@opencpap/core';
import { href, useRoute, type DateRange } from '../../router';
import { useData } from '../../state';
import { SharePanel } from '../share/SharePanel';
import { ReportDocument, type ReportInput, type ReportOptions } from './ReportDocument';

const NAME_KEY = 'opencpap.reportName';
const read = () => { try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; } };
const write = (v: string) => { try { if (v) localStorage.setItem(NAME_KEY, v); else localStorage.removeItem(NAME_KEY); } catch { /* storage unavailable */ } };

type Preset = '30' | '90' | 'all' | 'custom';

export function ReportPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const route = useRoute();
  const { nights, changes, equipment, journal, devices, asOf } = useData();
  const [preset, setPreset] = useState<Preset>(route.name === 'report' && route.range ? 'custom' : '30');
  const [custom, setCustom] = useState<DateRange>(route.name === 'report' && route.range ? route.range : ['', '']);
  const [patient, setPatient] = useState(read);
  const [options, setOptions] = useState<ReportOptions>({ includeNotes: false, includeNights: true, includeEquipment: true, includeCompare: true });

  const range = useMemo<DateRange | undefined>(() => {
    if (!asOf || nights.length === 0) return undefined;
    if (preset === 'all') return [nights[0]!.date, asOf];
    if (preset === 'custom') return custom[0] && custom[1] ? custom : [addDays(asOf, -29), asOf];
    return [addDays(asOf, -(Number(preset) - 1)), asOf];
  }, [preset, custom, nights, asOf]);

  const input = useMemo<ReportInput | undefined>(() => {
    if (!range || !asOf) return undefined;
    const [from, to] = range;
    const days = daysBetween(from, to) + 1;
    const prevTo = addDays(from, -1), prevFrom = addDays(prevTo, -(days - 1));
    return {
      from, to, totalDays: days, nights: nightsInRange(nights, from, to), asOf,
      previous: options.includeCompare ? { from: prevFrom, to: prevTo, nights: nightsInRange(nights, prevFrom, prevTo) } : undefined,
      changes, equipment, journal: [...journal.values()],
      device: [...new Set(devices.filter((d) => !d.deviceId.startsWith('Demo:')).map((d) => `${d.manufacturer} ${d.model}`))].join(', ') || (devices[0] ? `${devices[0].manufacturer} ${devices[0].model}` : ''),
      patient: patient.trim(),
      generated: new Intl.DateTimeFormat(lang, { dateStyle: 'long' }).format(new Date()),
      options,
    };
  }, [range, nights, changes, equipment, journal, devices, patient, options, asOf, lang]);

  if (!range || !input) return <div className="card">{t('dashboard.emptyBody')}</div>;
  const toggle = (k: keyof ReportOptions) => (e: React.ChangeEvent<HTMLInputElement>) => setOptions({ ...options, [k]: e.target.checked });

  return (
    <div className="stack">
      <div className="no-print stack">
        <div className="page-head"><div><h1>{t('report.title')}</h1><p className="sub">{t('report.intro')}</p></div>
          <button className="btn large" type="button" onClick={() => window.print()}>{t('report.print')}</button>
        </div>
        <p className="muted">{t('report.printHint')}</p>

        <section className="card stack" aria-labelledby="rep-opts">
          <h2 id="rep-opts" className="sr-only">{t('report.range')}</h2>
          <div className="row">
            <fieldset className="seg">
              <legend className="sr-only">{t('report.range')}</legend>
              {(['30', '90', 'all', 'custom'] as Preset[]).map((p) => (
                <label key={p}><input type="radio" name="rep-range" value={p} checked={preset === p} onChange={() => { setPreset(p); if (p === 'custom' && !custom[0]) setCustom(range); }} />{t(p === 'custom' ? 'report.custom' : p === 'all' ? 'report.all' : `report.last${p}`)}</label>
              ))}
            </fieldset>
            {preset === 'custom' && (
              <>
                <label>{t('common.from')} <input type="date" value={custom[0]} max={asOf} onChange={(e) => setCustom([e.target.value, custom[1] || e.target.value])} /></label>
                <label>{t('common.to')} <input type="date" value={custom[1]} max={asOf} onChange={(e) => setCustom([custom[0] || e.target.value, e.target.value])} /></label>
              </>
            )}
          </div>
          <label className="field" style={{ maxWidth: '24rem' }}>
            <span>{t('report.patient')}</span>
            <input type="text" value={patient} maxLength={80} onChange={(e) => { setPatient(e.target.value); write(e.target.value); }} />
            <small className="muted">{t('report.patientHint')}</small>
          </label>
          <div className="checks">
            <label><input type="checkbox" checked={options.includeCompare} onChange={toggle('includeCompare')} /> {t('report.includeCompare')}</label>
            <label><input type="checkbox" checked={options.includeEquipment} onChange={toggle('includeEquipment')} /> {t('report.includeEquipment')}</label>
            <label><input type="checkbox" checked={options.includeNotes} onChange={toggle('includeNotes')} /> {t('report.includeNotes')}</label>
            <label><input type="checkbox" checked={options.includeNights} onChange={toggle('includeNights')} /> {t('report.includeNights')}</label>
          </div>
          <p><a href={href.compare()}>{t('nav.compare')}</a></p>
        </section>
        <SharePanel input={input} />
        <h2>{t('report.preview')}</h2>
      </div>

      <ReportDocument r={input} />
    </div>
  );
}
