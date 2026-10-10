import { useTranslation } from 'react-i18next';

/**
 * Only one explainer is open at a time: opening one closes the others, a click anywhere else closes it, and Escape closes all.
 * Installed once for the whole page (it is a single document-level behaviour, not per tip).
 */
let installed = false;
function installOnce() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const closeAll = (except?: Element | null) => {
    document.querySelectorAll<HTMLDetailsElement>('details.info[open]').forEach((d) => { if (d !== except) d.open = false; });
  };
  document.addEventListener('toggle', (e) => {
    const d = e.target as HTMLElement;
    if (d instanceof HTMLDetailsElement && d.classList.contains('info') && d.open) closeAll(d);
  }, true);
  document.addEventListener('pointerdown', (e) => {
    const target = e.target as Node;
    document.querySelectorAll<HTMLDetailsElement>('details.info[open]').forEach((d) => { if (!d.contains(target)) d.open = false; });
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
}

/** Inline "what does this mean?" explainer (native <details>, keyboard and screen-reader friendly). */
export function InfoTip({ text }: { text: string }) {
  const { t } = useTranslation();
  installOnce();
  return (
    <details className="info">
      <summary aria-label={t('common.explain')}><span aria-hidden="true">?</span></summary>
      <p>{text}</p>
    </details>
  );
}
