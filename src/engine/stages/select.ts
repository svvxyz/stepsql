import { clauseSql, exprSql } from '../describe/sqlText';
import { evalValue } from '../eval/expr';
import type { Expr } from '../parse/ast';
import type { MessageRef, RowLineage, Step, StepColumn, StepRow } from '../types';
import { groupContext, substituted, type ProjectedRow, type WorkingState } from './state';

function hasIntDivision(e: Expr): boolean {
  switch (e.kind) {
    case 'binary':
      return (e.op === '/' && e.type === 'int') || hasIntDivision(e.left) || hasIntDivision(e.right);
    case 'unary':
      return hasIntDivision(e.expr);
    default:
      return false;
  }
}

export function outputColumns(state: WorkingState): StepColumn[] {
  return state.bound.outputs.map((o): StepColumn => {
    const c: StepColumn = { name: o.name, type: o.type };
    if (o.unnamed) c.unnamed = true;
    if (o.computed) c.highlight = o.expr.kind === 'aggregate' ? 'aggregate' : 'computed';
    return c;
  });
}

export function selectStage(state: WorkingState): Step {
  const { query, outputs, table } = state.bound;
  const projected: ProjectedRow[] = [];

  if (state.groups) {
    for (const g of state.groups) {
      const ctx = groupContext(g, table.columns.length);
      const values = outputs.map((o) => evalValue(o.expr, ctx));
      projected.push({ id: g.id, values, ctx: { ...ctx, outputs: values }, groupId: g.id, sourceRowIds: g.rows.map((r) => r.id) });
    }
  } else {
    for (const r of state.rows) {
      const ctx = { row: r.values };
      const values = outputs.map((o) => evalValue(o.expr, ctx));
      projected.push({ id: r.id, values, ctx: { ...ctx, outputs: values } });
    }
  }
  state.projected = projected;

  const rowsIn = state.groups ? state.groups.length : state.rows.length;
  const rows: StepRow[] = projected.map((p) => {
    const row: StepRow = { id: p.id, values: p.values, status: 'kept' };
    if (p.groupId !== undefined) row.groupId = p.groupId;
    if (p.sourceRowIds) row.sourceRowIds = p.sourceRowIds;
    return row;
  });

  // Expressions computed here (not a plain column or aggregate), with each row's values in place.
  const computedHere = outputs.map((o) => o.expr.kind !== 'column' && o.expr.kind !== 'aggregate');
  const lineage: RowLineage[] = projected.map((p) => ({
    key: '',
    parents: [],
    origin: [],
    cells: outputs.map((o, i) => (computedHere[i] ? substituted(o.expr, p.ctx) : null)),
  }));

  const notes: MessageRef[] = [];
  const intDiv = outputs.find((o) => hasIntDivision(o.expr));
  if (intDiv) notes.push({ key: 'note.intDivision', params: { column: intDiv.name } });

  const onlyStar = query.columns.length === 1 && query.columns[0]!.kind === 'star';
  return {
    stage: 'select',
    clauseSql: clauseSql.select(query),
    columns: outputColumns(state),
    // `source` is matched against the previous step by attachLineage.
    columnLineage: outputs.map((o) => ({
      source: null,
      exprSql: o.expr.kind === 'column' && o.expr.index !== undefined ? table.columns[o.expr.index]!.name : exprSql(o.expr),
    })),
    rows,
    lineage,
    explanation: onlyStar
      ? { key: 'step.select.star', params: { table: table.name, count: outputs.length } }
      : { key: 'step.select.explanation', params: { columns: outputs.map((o) => ({ sql: o.name })), count: outputs.length, computed: outputs.filter((o) => o.computed).length } },
    notes,
    stats: { rowsIn, rowsOut: projected.length },
  };
}
