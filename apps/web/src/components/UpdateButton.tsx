import { useTranslation } from 'react-i18next';
import { APP_VERSION } from '../version';
import { installUpdate, useUpdateReady } from '../update';

/**
 * Shows the app version at the foot of the page. The button is neutral when the app is current
 * and takes the accent colour when a new version has been downloaded; pressing it activates that version.
 */
export function UpdateButton() {
  const { t } = useTranslation();
  const ready = useUpdateReady();
  return (
    <div className="app-version">
      <span>{t('footer.version', { version: APP_VERSION })}</span>
      <button
        type="button"
        className={ready ? 'version-update ready' : 'version-update'}
        onClick={installUpdate}
        disabled={!ready}
      >
        {ready ? t('update.install') : t('footer.upToDate')}
      </button>
    </div>
  );
}
