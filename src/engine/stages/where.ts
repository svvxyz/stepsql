import { sourceColumns } from '../describe/lineage';
import { clauseSql, exprSql } from '../describe/sqlText';
import { evalTruth, failingPart } from '../eval/expr';
import type { MessageRef, RowLineage, Step, StepRow } from '../types';
import { substituted, type WorkingState } from './state';

export function whereStage(state: WorkingState): Step | undefined {
  const { query, table } = state.bound;
  const cond = query.where;
  if (!cond) return undefined;

  const rows: StepRow[] = [];
  // Only `decisive` is known here; keys and origins are filled in by attachLineage.
  const lineage: RowLineage[] = [];
  const kept = [];
  let sawUnknown = false;
  for (const r of state.rows) {
    const ctx = { row: r.values };
    const t = evalTruth(cond, ctx);
    if (t === true) {
      kept.push(r);
      rows.push({ id: r.id, values: r.values, status: 'kept' });
      lineage.push({ key: '', parents: [], origin: [], test: { sql: substituted(cond, ctx), result: true, columns: sourceColumns(cond) } });
      continue;
    }
    const part = failingPart(cond, ctx);
    const unknown = evalTruth(part, ctx) === null;
    if (unknown) sawUnknown = true;
    const reason: MessageRef = {
      key: unknown ? 'reason.where.unknown' : 'reason.where.false',
      params: { condition: { sql: exprSql(part) }, evaluated: { sql: substituted(part, ctx) } },
    };
    rows.push({ id: r.id, values: r.values, status: 'discarded', reason });
    const decisive = sourceColumns(part);
    lineage.push({ key: '', parents: [], origin: [], decisive, test: { sql: substituted(part, ctx), result: unknown ? null : false, columns: decisive } });
  }

  const discarded = state.rows.length - kept.length;
  const notes: MessageRef[] = sawUnknown ? [{ key: 'note.unknownIsDiscarded' }] : [];
  state.rows = kept;
  return {
    stage: 'where',
    clauseSql: clauseSql.where(query),
    columns: table.columns.map((c) => ({ name: c.name, type: c.type })),
    rows,
    lineage,
    explanation: {
      key: 'step.where.explanation',
      params: { condition: { sql: exprSql(cond) }, count: rows.length, kept: kept.length, discarded },
    },
    notes,
    stats: { rowsIn: rows.length, rowsOut: kept.length },
  };
}
