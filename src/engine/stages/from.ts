import { clauseSql } from '../describe/sqlText';
import type { Step } from '../types';
import type { WorkingState } from './state';

export function fromStage(state: WorkingState): Step {
  const { table, query } = state.bound;
  state.rows = table.rows.map((values, id) => ({ id, values }));
  return {
    stage: 'from',
    clauseSql: clauseSql.from(query),
    columns: table.columns.map((c) => ({ name: c.name, type: c.type })),
    rows: state.rows.map((r) => ({ id: r.id, values: r.values, status: 'kept' })),
    explanation: {
      key: 'step.from.explanation',
      params: { table: table.name, count: table.rows.length, columnCount: table.columns.length },
    },
    notes: [],
    stats: { rowsIn: table.rows.length, rowsOut: table.rows.length },
  };
}
