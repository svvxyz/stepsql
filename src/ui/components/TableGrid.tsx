import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnType } from '../../engine';
import { isCellValid, newId, type EditableTable } from '../tableModel';

const TYPES: ColumnType[] = ['text', 'int', 'decimal', 'date'];

/** The full editable table: cells, rows, columns with name and type. */
export function TableGrid({ table, onChange }: { table: EditableTable; onChange: (t: EditableTable) => void }) {
  const { t } = useTranslation();
  const bottom = useRef<HTMLDivElement>(null);

  const setCell = (rowId: number, col: number, value: string) =>
    onChange({ ...table, rows: table.rows.map((r) => (r.id === rowId ? { ...r, cells: r.cells.map((c, i) => (i === col ? value : c)) } : r)) });

  const addRow = () => {
    onChange({ ...table, rows: [...table.rows, { id: newId(), cells: table.columns.map(() => '') }] });
    requestAnimationFrame(() => bottom.current?.scrollIntoView({ block: 'nearest' }));
  };
  const removeRow = (rowId: number) => onChange({ ...table, rows: table.rows.filter((r) => r.id !== rowId) });

  const addColumn = () => {
    let n = table.columns.length + 1;
    const base = t('table.newColumn');
    while (table.columns.some((c) => c.name.toLowerCase() === `${base}${n}`.toLowerCase())) n++;
    onChange({
      ...table,
      columns: [...table.columns, { id: newId(), name: `${base}${n}`, type: 'text' }],
      rows: table.rows.map((r) => ({ ...r, cells: [...r.cells, ''] })),
    });
  };
  const removeColumn = (idx: number) =>
    onChange({
      ...table,
      columns: table.columns.filter((_, i) => i !== idx),
      rows: table.rows.map((r) => ({ ...r, cells: r.cells.filter((_, i) => i !== idx) })),
    });
  const setColumn = (idx: number, patch: Partial<{ name: string; type: ColumnType }>) =>
    onChange({ ...table, columns: table.columns.map((c, i) => (i === idx ? { ...c, ...patch } : c)) });

  return (
    <div className="grid-body">
      <div className="table-scroll sticky-head">
        <table className="data-table editable">
          <thead>
            <tr>
              <th className="row-num" scope="col">#</th>
              {table.columns.map((c, i) => (
                <th key={c.id} scope="col">
                  <div className="col-editor">
                    <input aria-label={t('table.columnName', { n: i + 1 })} value={c.name} onChange={(e) => setColumn(i, { name: e.target.value })} spellCheck={false} />
                    <div className="col-editor-row">
                      <select aria-label={t('table.columnType', { name: c.name })} value={c.type} onChange={(e) => setColumn(i, { type: e.target.value as ColumnType })}>
                        {TYPES.map((ty) => (
                          <option key={ty} value={ty}>
                            {t(`table.types.${ty}`)}
                          </option>
                        ))}
                      </select>
                      <button type="button" className="icon-btn" onClick={() => removeColumn(i)} disabled={table.columns.length <= 1} title={t('table.removeColumn', { name: c.name })} aria-label={t('table.removeColumn', { name: c.name })}>
                        ×
                      </button>
                    </div>
                  </div>
                </th>
              ))}
              <th className="actions" scope="col">
                <button type="button" className="btn small" onClick={addColumn}>
                  + {t('table.addColumn')}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r, ri) => (
              <tr key={r.id}>
                <td className="row-num">{ri + 1}</td>
                {table.columns.map((c, ci) => {
                  const raw = r.cells[ci] ?? '';
                  const valid = isCellValid(raw, c.type);
                  return (
                    <td key={c.id} className={valid ? '' : 'invalid'}>
                      <input
                        aria-label={t('table.cell', { row: ri + 1, column: c.name })}
                        aria-invalid={!valid}
                        className={c.type === 'text' ? '' : 'num'}
                        value={raw}
                        placeholder="NULL"
                        inputMode={c.type === 'int' || c.type === 'decimal' ? 'decimal' : undefined}
                        onChange={(e) => setCell(r.id, ci, e.target.value)}
                        spellCheck={false}
                      />
                    </td>
                  );
                })}
                <td className="actions">
                  <button type="button" className="icon-btn" onClick={() => removeRow(r.id)} title={t('table.removeRow', { n: ri + 1 })} aria-label={t('table.removeRow', { n: ri + 1 })}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div ref={bottom} />
      </div>
      <div className="panel-footer">
        <button type="button" className="btn small" onClick={addRow}>
          + {t('table.addRow')}
        </button>
      </div>
    </div>
  );
}
