import { useTranslation } from 'react-i18next';
import { installUpdate, useUpdateReady } from '../update';

/** Shown at the bottom of the page when a new version of the app has been downloaded. */
export function UpdateBanner() {
  const { t } = useTranslation();
  const ready = useUpdateReady();
  if (!ready) return null;
  return (
    <div className="update-banner" role="status">
      <span>{t('update.available')}</span>
      <button className="btn" type="button" onClick={installUpdate}>{t('update.install')}</button>
    </div>
  );
}
