// Public entry point of the step-by-step engine.
//
//   runStepByStep(sql, tables) => { ok: true, steps } | { ok: false, error }
//
// The engine is pure: no UI, no i18n, no text in any language. Each Step holds
// a full snapshot of the data at one logical stage plus message keys.

import { analyze } from './analyze/validate';
import { attachLineage } from './describe/lineage';
import { EngineFailure, fail } from './errors';
import { parseDate } from './eval/values';
import { parseQuery } from './parse/parser';
import { aggregateStage } from './stages/aggregate';
import { distinctStage } from './stages/distinct';
import { fromStage } from './stages/from';
import { groupByStage } from './stages/groupBy';
import { havingStage } from './stages/having';
import { orderByStage } from './stages/orderBy';
import { outputColumns, selectStage } from './stages/select';
import type { WorkingState } from './stages/state';
import { topStage } from './stages/top';
import { whereStage } from './stages/where';
import type { RunResult, Step, Table } from './types';

export * from './types';
export { queryOutline, type ClauseRange, type OutlineStage, type QueryOutline } from './describe/outline';

/** Logical processing order of a SELECT in SQL Server. */
export const LOGICAL_ORDER = ['from', 'where', 'groupBy', 'aggregate', 'having', 'select', 'distinct', 'orderBy', 'top'] as const;

/** The whole logical order as taught, JOIN included (not run yet, planned for 1.0) and the final result. */
export const FULL_LOGICAL_ORDER = ['from', 'join', 'where', 'groupBy', 'aggregate', 'having', 'select', 'distinct', 'orderBy', 'top', 'result'] as const;

function validateTables(tables: Table[]): void {
  for (const t of tables) {
    t.rows.forEach((row, r) => {
      t.columns.forEach((col, c) => {
        const v = row[c] ?? null;
        if (v === null) return;
        const bad =
          (col.type === 'int' && !(typeof v === 'number' && Number.isInteger(v))) ||
          (col.type === 'decimal' && typeof v !== 'number') ||
          (col.type === 'date' && (typeof v !== 'string' || parseDate(v) !== v)) ||
          (col.type === 'text' && typeof v !== 'string');
        if (bad) fail('INVALID_TABLE_DATA', { table: t.name, column: col.name, row: r + 1, value: String(v), type: col.type });
      });
    });
  }
}

export function runStepByStep(sql: string, tables: Table[]): RunResult {
  try {
    validateTables(tables);
    const query = parseQuery(sql);
    const bound = analyze(query, tables, sql);
    const state: WorkingState = { bound, rows: [] };

    const steps: Step[] = [];
    const push = (s: Step | undefined) => {
      if (s) steps.push(s);
    };
    push(fromStage(state));
    push(whereStage(state));
    push(groupByStage(state));
    push(aggregateStage(state));
    push(havingStage(state));
    push(selectStage(state));
    push(distinctStage(state));
    push(orderByStage(state));
    push(topStage(state));

    const final = state.projected ?? [];
    steps.push({
      stage: 'result',
      columns: outputColumns(state).map(({ highlight: _h, ...c }) => c),
      rows: final.map((p) => ({ id: p.id, values: p.values, status: 'kept' })),
      explanation: { key: 'step.result.explanation', params: { count: final.length, columnCount: bound.outputs.length } },
      notes: [],
      stats: { rowsIn: final.length, rowsOut: final.length },
    });
    attachLineage(steps, bound.table.name, bound.grouped);
    return { ok: true, steps };
  } catch (e) {
    if (e instanceof EngineFailure) return { ok: false, error: e.error };
    throw e;
  }
}
