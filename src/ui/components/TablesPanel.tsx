import { useTranslation } from 'react-i18next';
import { isUsedBy, type TableEntry } from '../tables';

interface Props {
  entries: TableEntry[];
  /** Tables named by the query in the editor right now. */
  usedNames: string[];
  invalidIds: Set<number>;
  editingId: number | null;
  onOpen: (id: number) => void;
  onCreate: () => void;
  onRestoreSample?: (() => void) | undefined;
}

/**
 * Lists the available tables. On wide screens it is exactly as tall as the
 * query editor next to it and scrolls inside; on narrow screens it becomes a
 * row of chips that scrolls sideways.
 */
export function TablesPanel({ entries, usedNames, invalidIds, editingId, onOpen, onCreate, onRestoreSample }: Props) {
  const { t } = useTranslation();
  return (
    <section className="panel tables-panel" aria-labelledby="tables-heading">
      <div className="panel-header">
        <h2 id="tables-heading" className="stage-label">
          {t('tables.heading')}
        </h2>
        <span className="hint">{entries.length}</span>
      </div>

      {entries.length === 0 ? (
        <p className="tables-empty hint">{t('tables.empty')}</p>
      ) : (
        <ul className="tables-list">
          {entries.map((e) => {
            const used = isUsedBy(e, usedNames);
            const invalid = invalidIds.has(e.id);
            return (
              <li key={e.id}>
                <button
                  type="button"
                  className={`table-item${used ? ' used' : ''}${editingId === e.id ? ' editing' : ''}`}
                  onClick={() => onOpen(e.id)}
                  aria-label={t('tables.editTable', { name: e.table.name || '—' })}
                >
                  <span className="table-item-name">{e.table.name || '—'}</span>
                  <span className="table-item-meta">
                    {t('common.rows', { count: e.table.rows.length })} · {t('common.columns', { count: e.table.columns.length })}
                  </span>
                  {(used || invalid) && (
                    <span className="table-item-tags">
                      {used && <span className="tag tag-used">{t('tables.inQuery')}</span>}
                      {invalid && <span className="tag tag-invalid">⚠ {t('tables.hasProblems')}</span>}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="tables-actions">
        <button type="button" className="btn small" onClick={onCreate}>
          + {t('tables.new')}
        </button>
        <button type="button" className="btn small" disabled aria-describedby="import-soon" title={t('tables.importSoon')}>
          {t('tables.import')}
        </button>
        <span id="import-soon" className="hint import-soon">
          {t('tables.importSoon')}
        </span>
        {onRestoreSample && (
          <button type="button" className="btn small ghost" onClick={onRestoreSample}>
            {t('tables.restoreSample')}
          </button>
        )}
      </div>
    </section>
  );
}
