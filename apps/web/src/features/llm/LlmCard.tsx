import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildPrompt, canSend, isLocalEndpoint, LlmError, loadLlmConfig, requestSummary } from '../../llm';
import { useData } from '../../state';

/** Dashboard card with an opt-in summary from the user's own language model. Hidden unless enabled in Settings. */
export function LlmCard() {
  const { t, i18n } = useTranslation();
  const { nights, changes, asOf, demoOnly } = useData();
  const config = loadLlmConfig();
  const [state, setState] = useState<{ kind: 'idle' | 'busy' | 'done' | 'error'; text?: string }>({ kind: 'idle' });
  const abort = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => abort.current?.abort(), []);

  if (!config.enabled || !asOf || nights.length === 0) return null;
  const allowed = canSend(config);

  const run = async () => {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setState({ kind: 'busy' });
    try {
      const text = await requestSummary(config, buildPrompt(nights, asOf, changes, i18n.language), { signal: ac.signal });
      setState({ kind: 'done', text });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setState({ kind: 'error', text: e instanceof LlmError ? t(`llm.err_${e.kind}`, { endpoint: config.endpoint }) : String(e) });
    }
  };

  return (
    <section className="card stack" aria-labelledby="llm-title">
      <h2 id="llm-title">{t('llm.title')}</h2>
      <p className="muted">{isLocalEndpoint(config.endpoint) ? t('llm.introLocal', { model: config.model }) : t('llm.introRemote', { endpoint: new URL(config.endpoint).host })}</p>
      {demoOnly && <p className="muted">{t('llm.demo')}</p>}
      <div className="btn-row">
        <button className="btn secondary" type="button" disabled={!allowed || state.kind === 'busy'} onClick={() => void run()}>{state.kind === 'busy' ? t('llm.writing') : t('llm.generate')}</button>
        {state.kind === 'busy' && <button className="btn secondary" type="button" onClick={() => { abort.current?.abort(); setState({ kind: 'idle' }); }}>{t('common.cancel')}</button>}
      </div>
      <div aria-live="polite">
        {state.kind === 'done' && <p className="llm-text" lang={i18n.language}>{state.text}</p>}
        {state.kind === 'error' && <p className="banner warn" role="alert">{state.text}</p>}
      </div>
      <p className="muted">{t('llm.disclaimer')}</p>
    </section>
  );
}
