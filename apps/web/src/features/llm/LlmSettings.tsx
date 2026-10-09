import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isLocalEndpoint, loadLlmConfig, saveLlmConfig, type LlmConfig } from '../../llm';

/** Settings section for the optional language-model summary. Everything is off until the user turns it on. */
export function LlmSettings() {
  const { t } = useTranslation();
  const [cfg, setCfg] = useState<LlmConfig>(loadLlmConfig);
  const update = (patch: Partial<LlmConfig>) => { const next = { ...cfg, ...patch }; setCfg(next); saveLlmConfig(next); };
  const remote = !isLocalEndpoint(cfg.endpoint);

  return (
    <section className="card stack" aria-labelledby="s-llm">
      <h2 id="s-llm">{t('llm.settingsTitle')}</h2>
      <p className="muted">{t('llm.settingsIntro')}</p>
      <label><input type="checkbox" checked={cfg.enabled} onChange={(e) => update({ enabled: e.target.checked })} /> {t('llm.enable')}</label>
      {cfg.enabled && (
        <>
          <label className="field" style={{ maxWidth: '28rem' }}>
            <span>{t('llm.endpoint')}</span>
            <input type="url" value={cfg.endpoint} onChange={(e) => update({ endpoint: e.target.value, allowRemote: false })} />
          </label>
          <label className="field" style={{ maxWidth: '16rem' }}>
            <span>{t('llm.model')}</span>
            <input type="text" value={cfg.model} onChange={(e) => update({ model: e.target.value })} />
          </label>
          {remote && (
            <div className="banner warn" role="note">
              <p>{t('llm.remoteWarning')}</p>
              <label><input type="checkbox" checked={cfg.allowRemote} onChange={(e) => update({ allowRemote: e.target.checked })} /> {t('llm.allowRemote')}</label>
            </div>
          )}
          <p className="muted">{t('llm.whatIsSent')}</p>
        </>
      )}
    </section>
  );
}
