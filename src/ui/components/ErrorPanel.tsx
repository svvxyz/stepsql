import { useTranslation } from 'react-i18next';
import type { EngineError } from '../../engine';
import { errorText } from '../messages';

export function ErrorPanel({ error }: { error: EngineError }) {
  const { t, i18n } = useTranslation();
  return (
    <div className="error-panel" role="alert">
      <h2>{t('errorPanel.title')}</h2>
      <p className="error-message">{errorText(error, t, i18n.language)}</p>
      {error.sqlServerError !== undefined && <p className="hint">{t('errorPanel.sqlServer', { number: error.sqlServerError })}</p>}
    </div>
  );
}
