// Row identity and lineage, computed once all steps exist.
//
// Each stage only records what it alone knows (which cells decided a discard,
// which expression is behind each SELECT column). Keys, parents and origins
// follow from the steps themselves and are filled in here.

import { sameExpr } from './sqlText';
import { aggregateKey } from '../eval/aggregates';
import type { AggregateExpr, Expr } from '../parse/ast';
import type { RowLineage, Step } from '../types';

function children(e: Expr): Expr[] {
  switch (e.kind) {
    case 'unary':
      return [e.expr];
    case 'binary':
      return [e.left, e.right];
    case 'between':
      return [e.expr, e.low, e.high];
    case 'in':
      return [e.expr, ...e.list];
    case 'like':
      return [e.expr, e.pattern];
    case 'isNull':
      return [e.expr];
    case 'aggregate':
      return e.arg ? [e.arg] : [];
    default:
      return [];
  }
}

/** Source-table column indexes an expression reads (WHERE). */
export function sourceColumns(e: Expr): number[] {
  const out = new Set<number>();
  const walk = (x: Expr) => {
    if (x.kind === 'column' && x.index !== undefined) out.add(x.index);
    children(x).forEach(walk);
  };
  walk(e);
  return [...out].sort((a, b) => a - b);
}

/** Columns of the one-row-per-group table (keys, then aggregates) an expression reads (HAVING). */
export function groupColumns(e: Expr, keys: Expr[], aggregates: AggregateExpr[]): number[] {
  const out = new Set<number>();
  const walk = (x: Expr) => {
    const k = keys.findIndex((key) => sameExpr(key, x));
    if (k >= 0) return void out.add(k);
    if (x.kind === 'aggregate') {
      const a = aggregates.findIndex((agg) => aggregateKey(agg) === aggregateKey(x));
      if (a >= 0) out.add(keys.length + a);
      return;
    }
    children(x).forEach(walk);
  };
  walk(e);
  return [...out].sort((a, b) => a - b);
}

const norm = (name: string) => name.replace(/^\[(.*)\]$/, '$1').toLowerCase();

/** Rows are source rows up to GROUP BY, groups from the aggregates on (when the query is grouped). */
const GROUP_STAGES = new Set(['aggregate', 'having']);
const OUTPUT_STAGES = new Set(['select', 'distinct', 'orderBy', 'top', 'result']);

export function attachLineage(steps: Step[], tableName: string, grouped: boolean): void {
  const rowKey = (id: number) => `${tableName}#${id}`;
  const groupKey = (id: number) => `g:${id}`;
  // Origin of every key seen so far, so later steps (which drop sourceRowIds) can find it again.
  const originOf = new Map<string, string[]>();

  steps.forEach((step, i) => {
    const isGroup = GROUP_STAGES.has(step.stage) || (grouped && OUTPUT_STAGES.has(step.stage));
    const prev = i > 0 ? steps[i - 1] : undefined;
    const prevLineage = prev?.lineage ?? [];
    const prevKeys = new Set(prevLineage.filter((_, r) => prev!.rows[r]!.status !== 'discarded').map((l) => l.key));
    // origin key -> rows of the previous step that carry it
    const owners = new Map<string, string[]>();
    prevLineage.forEach((l, r) => {
      if (prev!.rows[r]!.status === 'discarded') return;
      for (const o of l.origin) owners.set(o, [...(owners.get(o) ?? []), l.key]);
    });

    const partial = step.lineage ?? [];
    const lineage: RowLineage[] = step.rows.map((row, r) => {
      const key = isGroup ? groupKey(row.id) : rowKey(row.id);
      const origin = row.sourceRowIds
        ? row.sourceRowIds.map(rowKey)
        : (originOf.get(key) ?? step.groups?.find((g) => g.id === row.id && isGroup)?.rowIds.map(rowKey) ?? [key]);
      let parents: string[] = [];
      if (prev) {
        if (prevKeys.has(key)) parents = [key];
        else parents = [...new Set(origin.flatMap((o) => owners.get(o) ?? []))];
      }
      const l: RowLineage = { key, parents, origin };
      const extra = partial[r];
      if (extra?.decisive) l.decisive = extra.decisive;
      if (extra?.test) l.test = extra.test;
      if (extra?.cells) l.cells = extra.cells;
      if (extra?.sortKeys) l.sortKeys = extra.sortKeys;
      return l;
    });

    if (step.stage === 'distinct') {
      // A duplicate merges into the earlier equal row, whose origin then covers both.
      step.rows.forEach((row, r) => {
        if (row.status !== 'discarded' || row.reason?.params?.row === undefined) return;
        const target = lineage[Number(row.reason.params.row) - 1];
        if (!target) return;
        lineage[r]!.mergedInto = target.key;
        target.origin = [...target.origin, ...lineage[r]!.origin];
      });
    }

    lineage.forEach((l) => originOf.set(l.key, l.origin));
    step.lineage = lineage;

    // Column lineage: SELECT says which expression is behind each column; match it to the previous step.
    if (step.stage === 'select' && step.columnLineage && prev) {
      const used = new Set<number>();
      for (const c of step.columnLineage) {
        const idx = prev.columns.findIndex((pc) => norm(pc.name) === norm(c.exprSql));
        c.source = idx >= 0 ? idx : null;
        if (idx >= 0) used.add(idx);
      }
      step.droppedColumns = prev.columns.filter((_, idx) => !used.has(idx)).map(({ highlight: _h, ...c }) => c);
    } else if (OUTPUT_STAGES.has(step.stage) && step.stage !== 'select' && prev?.columnLineage) {
      step.columnLineage = step.columns.map((_, idx) => ({ source: idx, exprSql: prev.columnLineage![idx]?.exprSql ?? step.columns[idx]!.name }));
    }
  });
}

