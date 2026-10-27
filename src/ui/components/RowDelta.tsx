import { useTranslation } from 'react-i18next';

/** "50 → 40 · −10" with a bar whose filled part is the share of rows that remain. */
export function RowDelta({ rowsIn, rowsOut }: { rowsIn: number; rowsOut: number }) {
  const { t, i18n } = useTranslation();
  const fmt = new Intl.NumberFormat(i18n.language);
  const delta = rowsOut - rowsIn;
  const max = Math.max(rowsIn, rowsOut, 1);
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±';
  return (
    <div className="row-delta" role="img" aria-label={t('steps.rowsAria', { rowsIn, rowsOut })}>
      <span className="rd-numbers" aria-hidden="true">
        <span className="rd-in">{fmt.format(rowsIn)}</span>
        <span className="rd-arrow">→</span>
        <strong className="rd-out">{fmt.format(rowsOut)}</strong>
        <span className={`rd-diff ${delta < 0 ? 'minus' : delta > 0 ? 'plus' : ''}`}>
          · {sign}
          {fmt.format(Math.abs(delta))}
        </span>
      </span>
      <span className="rd-bar" aria-hidden="true">
        <span className="rd-kept" style={{ width: `${(Math.min(rowsIn, rowsOut) / max) * 100}%` }} />
        <span className={delta < 0 ? 'rd-removed' : 'rd-added'} style={{ width: `${(Math.abs(delta) / max) * 100}%` }} />
      </span>
    </div>
  );
}
