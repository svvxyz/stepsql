import { groupColumns } from '../describe/lineage';
import { clauseSql, exprSql } from '../describe/sqlText';
import { evalTruth, failingPart } from '../eval/expr';
import type { MessageRef, RowLineage, Step, StepRow } from '../types';
import { groupRowValues } from './aggregate';
import { groupContext, substituted, type WorkingState } from './state';

export function havingStage(state: WorkingState): Step | undefined {
  const { query, table } = state.bound;
  const cond = query.having;
  if (!cond || !state.groups) return undefined;

  const rows: StepRow[] = [];
  const lineage: RowLineage[] = [];
  const keptGroups = [];
  let sawUnknown = false;
  for (const g of state.groups) {
    const ctx = groupContext(g, table.columns.length);
    const t = evalTruth(cond, ctx);
    const row: StepRow = { id: g.id, values: groupRowValues(state, g), status: 'kept', groupId: g.id, sourceRowIds: g.rows.map((r) => r.id) };
    const l: RowLineage = { key: '', parents: [], origin: [] };
    if (t === true) {
      keptGroups.push(g);
      l.test = { sql: substituted(cond, ctx), result: true, columns: groupColumns(cond, query.groupBy, state.bound.aggregates) };
    } else {
      const part = failingPart(cond, ctx);
      const unknown = evalTruth(part, ctx) === null;
      if (unknown) sawUnknown = true;
      row.status = 'discarded';
      l.decisive = groupColumns(part, query.groupBy, state.bound.aggregates);
      l.test = { sql: substituted(part, ctx), result: unknown ? null : false, columns: l.decisive };
      row.reason = {
        key: unknown ? 'reason.having.unknown' : 'reason.having.false',
        params: { condition: { sql: exprSql(part) }, evaluated: { sql: substituted(part, ctx) } },
      };
    }
    rows.push(row);
    lineage.push(l);
  }

  const total = state.groups.length;
  state.groups = keptGroups;
  const notes: MessageRef[] = sawUnknown ? [{ key: 'note.unknownIsDiscarded' }] : [];
  return {
    stage: 'having',
    clauseSql: clauseSql.having(query),
    columns: state.groupColumns ?? [],
    rows,
    lineage,
    explanation: {
      key: 'step.having.explanation',
      params: { condition: { sql: exprSql(cond) }, count: total, kept: keptGroups.length, discarded: total - keptGroups.length },
    },
    notes,
    stats: { rowsIn: total, rowsOut: keptGroups.length },
  };
}
