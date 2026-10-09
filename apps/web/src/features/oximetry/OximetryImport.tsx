import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { overlapMinutes, parseOximetryCsv, shiftRecording, splitByNight, nightOf, type OximetryParse } from '@opencpap/core';
import { Badge } from '../../components/Badge';
import { repository } from '../../db/repository';
import { formatNightDate, formatNumber } from '../../format';
import { useData } from '../../state';

const MAX_BYTES = 50 * 1024 * 1024;
type Result = { kind: 'ok'; count: number } | { kind: 'error'; message: string };

/** Imports an oximeter CSV: shows what was recognised and how it lines up with the CPAP nights before saving anything. */
export function OximetryImport() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { reload } = useData();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState<{ name: string; csv: string } | null>(null);
  const [monthFirst, setMonthFirst] = useState(false);
  const [offset, setOffset] = useState(0);
  const [ranges, setRanges] = useState<Map<string, [number, number][]>>(new Map());
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void repository.listSessions().then((rows) => {
      const by = new Map<string, [number, number][]>();
      for (const r of rows) (by.get(r.night) ?? by.set(r.night, []).get(r.night)!).push([r.session.start, r.session.end]);
      setRanges(by);
    });
  }, []);

  const parsed = useMemo<{ ok: OximetryParse } | { error: string } | null>(() => {
    if (!text) return null;
    try { return { ok: parseOximetryCsv(text.csv, { dayFirst: !monthFirst }) }; } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
  }, [text, monthFirst]);

  const preview = useMemo(() => {
    if (!parsed || !('ok' in parsed)) return [];
    const shifted = shiftRecording(parsed.ok.recording, offset);
    return [...splitByNight(shifted)].map(([date, part]) => {
      const minutes = (part.times.at(-1)! - part.times[0]!) / 60000;
      const sessions = ranges.get(date) ?? [];
      const overlap = overlapMinutes(part, sessions);
      const therapy = sessions.reduce((a, [x, y]) => a + (y - x) / 60000, 0);
      // a recording worn all night covers (nearly) the whole CPAP night; a shifted clock covers only part of it
      return { date, therapy, overlap, ok: therapy > 0 && overlap >= therapy * 0.75, keep: part.times.length >= 60 };
    }).filter((p) => p.keep);
  }, [parsed, offset, ranges]);

  const pick = async (file: File) => {
    setResult(null);
    if (file.size > MAX_BYTES) { setResult({ kind: 'error', message: t('oximetry.tooLarge') }); return; }
    setText({ name: file.name, csv: await file.text() });
    setMonthFirst(false); setOffset(0);
  };

  const run = async () => {
    if (!parsed || !('ok' in parsed) || !text) return;
    setBusy(true);
    try {
      const saved = await repository.saveOximetry(shiftRecording(parsed.ok.recording, offset), { source: text.name, offsetMin: offset });
      await reload();
      setResult({ kind: 'ok', count: saved.length });
      setText(null);
    } catch (e) { setResult({ kind: 'error', message: e instanceof Error ? e.message : String(e) }); } finally { setBusy(false); }
  };

  return (
    <section className="card stack" aria-labelledby="oxi-import-title" data-testid="oximetry-import">
      <h2 id="oxi-import-title" style={{ margin: 0 }}>{t('oximetry.importTitle')}</h2>
      <p>{t('oximetry.importIntro')}</p>
      <div className="btn-row">
        <button className="btn secondary" type="button" onClick={() => input.current?.click()}>{t('oximetry.choose')}</button>
        <input ref={input} type="file" hidden accept=".csv,text/csv,text/plain" data-testid="oximetry-input" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void pick(f); }} />
      </div>

      {parsed && 'error' in parsed && <div className="banner warn" role="alert">{t('oximetry.error', { message: parsed.error })}</div>}
      {parsed && 'ok' in parsed && (
        <div className="stack">
          <p>{t('oximetry.detected', { format: parsed.ok.format, time: parsed.ok.columns.time, spo2: parsed.ok.columns.spo2 })}. {t('oximetry.rows', { count: parsed.ok.recording.times.length, nights: preview.length })}{parsed.ok.skipped > 0 && ` ${t('oximetry.skipped', { count: parsed.ok.skipped })}`}</p>
          {parsed.ok.ambiguousDate && <label className="row"><input type="checkbox" checked={monthFirst} onChange={(e) => setMonthFirst(e.target.checked)} /> {t('oximetry.dateOrder')}</label>}
          <label className="field" style={{ maxWidth: '16rem' }}>
            <span>{t('oximetry.offset')}</span>
            <input type="number" min={-1440} max={1440} step={1} value={offset} onChange={(e) => setOffset(Math.round(Number(e.target.value) || 0))} />
            <small className="muted">{t('oximetry.offsetHint')}</small>
          </label>
          <div className="table-wrap">
            <table>
              <thead><tr><th scope="col">{t('oximetry.night')}</th><th scope="col" className="num">{t('oximetry.overlap')}</th><th scope="col"><span className="sr-only">{t('oximetry.status')}</span></th></tr></thead>
              <tbody>
                {preview.map((p) => (
                  <tr key={p.date}>
                    <th scope="row">{formatNightDate(p.date, lang)}</th>
                    <td className="num">{formatNumber(p.overlap, lang, 0)} / {formatNumber(p.therapy, lang, 0)} min</td>
                    <td>{p.overlap === 0 || p.therapy === 0 ? <Badge level="bad">{t('oximetry.noOverlap')}</Badge> : p.ok ? <Badge level="good">OK</Badge> : <Badge level="warn">{t('oximetry.lowOverlap')}</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div><button className="btn" type="button" disabled={busy || preview.length === 0} onClick={() => void run()}>{t('oximetry.import', { count: preview.length })}</button></div>
        </div>
      )}
      <div role="status" aria-live="polite">
        {result?.kind === 'ok' && <p className="good">{t('oximetry.done', { count: result.count })}</p>}
        {result?.kind === 'error' && <p className="bad">{t('oximetry.error', { message: result.message })}</p>}
      </div>
    </section>
  );
}
