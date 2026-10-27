import { useTranslation } from 'react-i18next';

/** The "logical order, not physical plan" notice, behind an "i" button in the header. */
export function InfoPopover() {
  const { t } = useTranslation();
  return (
    <>
      <button type="button" className="icon-btn info-btn" popoverTarget="logical-order-info" aria-label={t('app.infoButton')} title={t('app.infoButton')}>
        i
      </button>
      <div id="logical-order-info" popover="auto" className="info-popover" role="note">
        <p className="stage-label">{t('app.logicalOrderTitle')}</p>
        <p>{t('app.logicalOrderNote')}</p>
      </div>
    </>
  );
}
