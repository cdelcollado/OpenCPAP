import { useTranslation } from 'react-i18next';

/** Inline "what does this mean?" explainer (native <details>, keyboard and screen-reader friendly). */
export function InfoTip({ text }: { text: string }) {
  const { t } = useTranslation();
  return (
    <details className="info">
      <summary aria-label={t('common.explain')}><span aria-hidden="true">?</span></summary>
      <p>{text}</p>
    </details>
  );
}
