// Shared working state passed from one logical stage to the next.

import type { BoundQuery } from '../analyze/validate';
import { exprSql } from '../describe/sqlText';
import type { EvalContext } from '../eval/expr';
import { aggregateKey } from '../eval/aggregates';
import type { Expr } from '../parse/ast';
import type { AggregateCalc, StepColumn, Value } from '../types';

export interface SourceRow {
  id: number;
  values: Value[];
}

export interface WorkingGroup {
  id: number;
  key: Value[];
  rows: SourceRow[];
  calcs: AggregateCalc[];
  aggregateValues: Map<string, Value>;
}

export interface ProjectedRow {
  id: number;
  values: Value[];
  ctx: EvalContext;
  groupId?: number;
  sourceRowIds?: number[];
}

export interface WorkingState {
  bound: BoundQuery;
  rows: SourceRow[];
  groups?: WorkingGroup[];
  /** Columns of the one-row-per-group table (keys + aggregates). */
  groupColumns?: StepColumn[];
  projected?: ProjectedRow[];
}

export function formatLiteral(v: Value): string {
  if (v === null) return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${v.replace(/'/g, "''")}'`;
}

/** Prints an expression with the row's values in place of columns and aggregates: `Edad > 5` -> `3 > 5`. */
export function substituted(e: Expr, ctx: EvalContext): string {
  return exprSql(e, (node) => {
    if (node.kind === 'column') {
      const v = node.outputIndex !== undefined ? ctx.outputs?.[node.outputIndex] : ctx.row[node.index!];
      return formatLiteral(v ?? null);
    }
    if (node.kind === 'aggregate' && ctx.aggregates) {
      return formatLiteral(ctx.aggregates.get(aggregateKey(node)) ?? null);
    }
    return undefined;
  });
}

/** Context to evaluate SELECT / HAVING / ORDER BY expressions over a group. */
export function groupContext(g: WorkingGroup, width: number): EvalContext {
  return { row: g.rows[0]?.values ?? new Array<Value>(width).fill(null), aggregates: g.aggregateValues };
}
