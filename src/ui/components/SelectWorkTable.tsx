import { useTranslation } from 'react-i18next';
import type { Step, StepColumn, Value } from '../../engine';
import { formatValue } from '../messages';
import { lineageAt } from '../stepUtils';
import { GroupTag, groupClass } from './DataTable';

interface WorkColumn {
  key: string;
  role: 'kept' | 'dropped' | 'computed';
  /** Header shown first: the previous column's name or the computed expression. */
  from: string;
  /** Header at the end (differs when there is an alias). */
  to: string;
  column: StepColumn;
  /** Position in the SELECT list (dropped columns go last). */
  out: number;
  value: (row: number) => Value;
}

/**
 * What SELECT starts from while its animation plays: the previous step's
 * columns plus the computed ones, so the animation can take columns out, fill
 * the new ones and rename. Returns null when the rows cannot be matched to the
 * previous step (then the plain table is shown).
 */
export function buildWorkColumns(step: Step, prev: Step | undefined): WorkColumn[] | null {
  if (!prev || !step.columnLineage || !step.lineage || !prev.lineage) return null;
  const prevRow = new Map<string, number>();
  prev.lineage.forEach((l, i) => {
    if (prev.rows[i]!.status !== 'discarded') prevRow.set(l.key, i);
  });
  const rowIdx = step.lineage.map((l) => prevRow.get(l.key));
  if (rowIdx.some((i) => i === undefined)) return null;

  const outOf = new Map<number, number>();
  step.columnLineage.forEach((c, i) => {
    if (c.source !== null && !outOf.has(c.source)) outOf.set(c.source, i);
  });
  const cols: WorkColumn[] = prev.columns.map((c, pi) => {
    const out = outOf.get(pi);
    const kept = out !== undefined;
    return {
      key: `p${pi}`,
      role: kept ? 'kept' : 'dropped',
      from: c.name,
      to: kept ? step.columns[out]!.name : c.name,
      column: kept ? step.columns[out]! : { name: c.name, type: c.type },
      out: kept ? out : 1000 + pi,
      value: (r) => prev.rows[rowIdx[r]!]!.values[pi] ?? null,
    };
  });
  step.columnLineage.forEach((c, i) => {
    if (c.source !== null) return;
    cols.push({ key: `o${i}`, role: 'computed', from: c.exprSql, to: step.columns[i]!.name, column: step.columns[i]!, out: i, value: (r) => step.rows[r]!.values[i] ?? null });
  });
  return cols;
}

export function SelectWorkTable({ step, columns, scrollRef }: { step: Step; columns: WorkColumn[]; scrollRef: React.Ref<HTMLDivElement> }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const hasGroups = step.rows.some((r) => r.groupId !== undefined);
  return (
    <div className="table-scroll step-scroll" ref={scrollRef}>
      <table className="data-table work-table">
        <thead>
          <tr>
            {hasGroups && (
              <th scope="col" className="group-col">
                <span className="sr-only">{t('steps.groupColumn')}</span>
              </th>
            )}
            {columns.map((c) => {
              const aliased = c.from !== c.to;
              return (
                <th
                  key={c.key}
                  scope="col"
                  data-colkey={c.key}
                  data-role={c.role}
                  data-out={c.out}
                  data-alias={aliased ? 'from' : undefined}
                  className={c.role === 'computed' ? 'new-col' : c.column.highlight ? `hl-${c.column.highlight}` : ''}
                >
                  <div className="cv">
                    {aliased ? (
                      <>
                        <span className="h-from col-name unnamed">{c.from}</span>
                        <span className="h-to col-name">{c.to}</span>
                      </>
                    ) : (
                      <span className={c.column.unnamed ? 'col-name unnamed' : 'col-name'}>{c.to}</span>
                    )}
                    <span className="col-type">{t(`table.types.${c.column.type}`)}</span>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {step.rows.map((r, ri) => {
            const lin = lineageAt(step, ri);
            return (
              <tr key={lin.key} data-key={lin.key} data-index={ri} className={`${r.status} ${groupClass(r.groupId)}`}>
                {hasGroups && <td className="group-col">{r.groupId !== undefined && <GroupTag id={r.groupId} />}</td>}
                {columns.map((c) => {
                  const v = c.value(ri);
                  const numeric = c.column.type === 'int' || c.column.type === 'decimal';
                  const calc = c.role === 'computed' ? (lin.cells?.[c.out] ?? undefined) : undefined;
                  return (
                    <td key={c.key} data-colkey={c.key} data-calc={calc} className={`${numeric ? 'num' : ''} ${v === null ? 'null' : ''} ${c.role === 'computed' ? 'new-col' : ''}`}>
                      <div className="cv">{formatValue(v, c.column.type, lang)}</div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
