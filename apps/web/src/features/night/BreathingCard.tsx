import { useTranslation } from 'react-i18next';
import type { NightSummary } from '@opencpap/core';
import { Delta } from '../../components/Delta';
import { InfoTip } from '../../components/InfoTip';
import { formatNumber } from '../../format';
import type { Baseline } from '../dashboard/metrics';

/** Experimental breath analysis of the night: rate, regularity, flat-topped breaths, periodic pattern, I:E. */
export function BreathingCard({ night, base }: { night: NightSummary; base: Baseline }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const b = night.breathing;
  const pct = (v: number | undefined, d = 0) => (v === undefined ? '—' : `${formatNumber(v * 100, lang, d)} %`);
  return (
    <section className="card stack" aria-labelledby="breath-title" data-testid="breathing">
      <h2 id="breath-title" style={{ margin: 0 }}>{t('breathing.title')}</h2>
      {!b ? <p className="muted">{t('breathing.none')}</p> : (
        <>
          <div className="tiles four">
            <div className="tile">
              <span className="label">{t('breathing.rate')} <InfoTip text={t('explain.rate')} /></span>
              <span className="value">{formatNumber(b.rate, lang, 1)}<span className="unit">{t('metric.unitPerMin')}</span></span>
            </div>
            <div className="tile">
              <span className="label">{t('breathing.regularity')} <InfoTip text={t('explain.regularity')} /></span>
              <span className="value">{pct(b.periodCv)}</span>
            </div>
            <div className="tile">
              <span className="label">{t('breathing.flat')} <InfoTip text={t('explain.flat')} /></span>
              <span className="value" data-testid="flat-share">{pct(b.flatShare)}</span>
              <Delta value={b.flatShare === undefined ? undefined : b.flatShare * 100} baseline={base.flat === undefined ? undefined : base.flat * 100} digits={0} suffix={t('hero.vsAvg', { n: base.nights })} lang={lang} />
            </div>
            <div className="tile">
              <span className="label">{t('breathing.periodic')} <InfoTip text={t('explain.periodic')} /></span>
              <span className="value">{pct(b.periodicityShare)}</span>
            </div>
          </div>
          <p className="muted">{t('breathing.ie')}: <b className="num">{formatNumber(b.ieRatio, lang, 2)}</b> · {t('breathing.breaths', { count: b.breaths })}</p>
        </>
      )}
      <p className="muted" style={{ fontSize: '0.85rem' }}>{t('breathing.note')}</p>
    </section>
  );
}
