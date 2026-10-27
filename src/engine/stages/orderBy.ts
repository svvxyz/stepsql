import { clauseSql } from '../describe/sqlText';
import { evalValue } from '../eval/expr';
import { sortCompare } from '../eval/values';
import type { MessageRef, RowLineage, Step, StepRow, Value } from '../types';
import { outputColumns } from './select';
import type { WorkingState } from './state';

export function orderByStage(state: WorkingState): Step | undefined {
  const { query, orderBy } = state.bound;
  if (orderBy.length === 0 || !state.projected) return undefined;

  const keyed = state.projected.map((p, pos) => ({ p, pos, keys: orderBy.map((o): Value => evalValue(o.expr, p.ctx)) }));
  keyed.sort((a, b) => {
    for (let i = 0; i < orderBy.length; i++) {
      const c = sortCompare(a.keys[i]!, b.keys[i]!, orderBy[i]!.expr.type ?? 'null');
      if (c !== 0) return orderBy[i]!.dir === 'DESC' ? -c : c;
    }
    return a.pos - b.pos; // stable: ties keep their previous order
  });
  state.projected = keyed.map((k) => k.p);

  const columns = outputColumns(state);
  for (const o of orderBy) {
    if (o.expr.kind === 'column' && o.expr.outputIndex !== undefined) columns[o.expr.outputIndex]!.highlight = 'sortKey';
  }

  const notes: MessageRef[] = [];
  if (keyed.some((k) => k.keys.some((v) => v === null))) notes.push({ key: 'note.nullsSortFirst' });
  for (const o of orderBy) if (o.hiddenColumn) notes.push({ key: 'note.orderByHiddenColumn', params: { column: o.hiddenColumn } });

  const rows: StepRow[] = state.projected.map((p) => ({ id: p.id, values: p.values, status: 'kept' }));
  const lineage: RowLineage[] = keyed.map((k) => ({ key: '', parents: [], origin: [], sortKeys: k.keys }));
  return {
    stage: 'orderBy',
    clauseSql: clauseSql.orderBy(query),
    columns,
    rows,
    lineage,
    sort: orderBy.map((o) => ({ sql: o.sql.replace(/ (ASC|DESC)$/, ''), dir: o.dir })),
    explanation: { key: 'step.orderBy.explanation', params: { keys: orderBy.map((o) => ({ sql: o.sql })), count: orderBy.length } },
    notes,
    stats: { rowsIn: rows.length, rowsOut: rows.length },
  };
}
