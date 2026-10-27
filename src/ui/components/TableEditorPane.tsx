import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { MessageRef } from '../../engine';
import { messageText } from '../messages';
import type { TableEntry } from '../tables';
import { TableGrid } from './TableGrid';

interface Props {
  entry: TableEntry;
  problems: MessageRef[];
  onChange: (entry: TableEntry) => void;
  onDelete: () => void;
  onResetSample?: (() => void) | undefined;
  /** Rendered at the end of the toolbar by the container (a close button in the sheet, a tab menu in V2). */
  toolbarEnd?: ReactNode;
  titleId?: string;
}

/**
 * Everything needed to edit one table. It knows nothing about where it is shown:
 * today the sliding sheet, in V2 a tab of the central area.
 */
export function TableEditorPane({ entry, problems, onChange, onDelete, onResetSample, toolbarEnd, titleId }: Props) {
  const { t, i18n } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const { table } = entry;
  const edit = (patch: Partial<typeof table>) => onChange({ ...entry, table: { ...table, ...patch }, isSample: false });

  return (
    <div className="table-pane">
      <div className="pane-toolbar">
        <h2 className="stage-label" id={titleId}>
          {t('sheet.title')}
        </h2>
        <label className="table-name">
          <span className="sr-only">{t('table.name')}</span>
          <input value={table.name} onChange={(e) => edit({ name: e.target.value })} spellCheck={false} aria-label={t('table.name')} />
        </label>
        <span className="pane-meta">
          {t('common.rows', { count: table.rows.length })} · {t('common.columns', { count: table.columns.length })}
        </span>
        <span className="toolbar-spacer" />
        {confirming ? (
          <span className="confirm" role="group" aria-label={t('sheet.delete')}>
            <span>{t('sheet.confirmDelete', { name: table.name })}</span>
            <button type="button" className="btn small danger" onClick={onDelete}>
              {t('sheet.confirmYes')}
            </button>
            <button type="button" className="btn small" onClick={() => setConfirming(false)} autoFocus>
              {t('sheet.cancel')}
            </button>
          </span>
        ) : (
          <button type="button" className="btn small ghost danger-text" onClick={() => setConfirming(true)}>
            {t('sheet.delete')}
          </button>
        )}
        {toolbarEnd}
      </div>

      <TableGrid table={table} onChange={(tbl) => onChange({ ...entry, table: tbl, isSample: false })} />

      <div className="pane-footer">
        <span className="hint">{t('table.nullHint')}</span>
        {onResetSample && (
          <button type="button" className="btn small ghost" onClick={onResetSample}>
            {t('table.reset')}
          </button>
        )}
        {problems.length > 0 && (
          <ul className="pane-problems" aria-live="polite">
            {problems.map((p, i) => (
              <li key={i}>{messageText(p, t, i18n.language)}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
