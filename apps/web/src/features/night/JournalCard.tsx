import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { repository } from '../../db/repository';
import { useData } from '../../state';

const MOODS = [1, 2, 3, 4, 5] as const;
const EMOJI = ['😣', '🙁', '😐', '🙂', '😄'];
type Status = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; message: string };

/** Note, tags and "how rested" mood for one night. Saves automatically a moment after the last edit. */
export function JournalCard({ date }: { date: string }) {
  const { t } = useTranslation();
  const { journal, reloadJournal } = useData();
  const entry = journal.get(date);
  const [note, setNote] = useState(entry?.note ?? '');
  const [tags, setTags] = useState<string[]>(entry?.tags ?? []);
  const [mood, setMood] = useState<1 | 2 | 3 | 4 | 5 | undefined>(entry?.mood);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const dirty = useRef(false);

  const known = useMemo(() => [...new Set([...journal.values()].flatMap((j) => j.tags))].filter((x) => !tags.includes(x)).sort(), [journal, tags]);

  // debounce: save 700 ms after the last change
  useEffect(() => {
    if (!dirty.current) return;
    setStatus({ kind: 'saving' });
    const id = setTimeout(() => {
      repository.saveJournal({ date, note, tags, mood })
        .then(() => reloadJournal())
        .then(() => setStatus({ kind: 'saved' }))
        .catch((e: unknown) => setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) }));
    }, 700);
    return () => clearTimeout(id);
  }, [date, note, tags, mood, reloadJournal]);

  const edit = <T,>(set: (v: T) => void) => (v: T) => { dirty.current = true; set(v); };
  const addTag = (raw: string) => {
    const v = raw.trim();
    if (v && !tags.includes(v)) edit(setTags)([...tags, v]);
    setDraft('');
  };

  return (
    <section className="card stack" aria-labelledby="journal-title">
      <h2 id="journal-title" style={{ margin: 0 }}>{t('journal.title')}</h2>

      <fieldset className="mood">
        <legend>{t('journal.moodLabel')}</legend>
        <div className="seg">
          {MOODS.map((m) => (
            <label key={m}>
              <input type="radio" name="mood" value={m} checked={mood === m} onChange={() => edit(setMood)(m)} onClick={() => mood === m && edit(setMood)(undefined)} />
              <span aria-hidden="true">{EMOJI[m - 1]}</span> {t(`journal.mood${m}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span>{t('journal.noteLabel')}</span>
        <textarea rows={4} maxLength={5000} value={note} placeholder={t('journal.notePlaceholder')} onChange={(e) => edit(setNote)(e.target.value)} />
      </label>

      <div className="field">
        <label htmlFor="tag-input">{t('journal.tagsLabel')}</label>
        <div className="chips">
          {tags.map((tag) => (
            <span className="chip" key={tag}>{tag}
              <button type="button" aria-label={t('journal.tagRemove', { tag })} onClick={() => edit(setTags)(tags.filter((x) => x !== tag))}>×</button>
            </span>
          ))}
          <input id="tag-input" type="text" list="known-tags" value={draft} maxLength={40} placeholder={t('journal.tagPlaceholder')}
            onChange={(e) => { const v = e.target.value; if (v.endsWith(',')) addTag(v.slice(0, -1)); else setDraft(v); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(draft); } else if (e.key === 'Backspace' && !draft && tags.length) edit(setTags)(tags.slice(0, -1)); }}
            onBlur={() => addTag(draft)} />
          <datalist id="known-tags">{known.map((k) => <option key={k} value={k} />)}</datalist>
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <p className="muted" role="status" aria-live="polite" style={{ margin: 0 }}>
          {status.kind === 'saving' && t('journal.saving')}
          {status.kind === 'saved' && t('journal.saved')}
          {status.kind === 'error' && t('journal.error', { message: status.message })}
        </p>
        {entry && (
          <button className="btn danger" type="button" onClick={async () => {
            await repository.deleteJournal(date); await reloadJournal(); dirty.current = false;
            setNote(''); setTags([]); setMood(undefined); setStatus({ kind: 'idle' });
          }}>{t('journal.delete')}</button>
        )}
      </div>
      <p className="muted" style={{ fontSize: '0.85rem' }}>{t('journal.private')}</p>
    </section>
  );
}
