// COUNT, SUM, AVG, MIN and MAX with SQL Server NULL rules:
// COUNT(*) counts rows, every other aggregate ignores NULLs, and an aggregate
// over no values returns NULL (COUNT returns 0).

import { exprSql } from '../describe/sqlText';
import type { AggregateExpr, ExprType } from '../parse/ast';
import type { AggregateCalc, ColumnType, Value } from '../types';
import { evalValue, type EvalContext } from './expr';
import { cleanDecimal, convert, displayType, sameGroupValue, sortCompare } from './values';

/** Key identifying an aggregate within a query (case-insensitive on column names). */
export function aggregateKey(e: AggregateExpr): string {
  return exprSql(e).toLowerCase();
}

export function aggregateResultType(e: AggregateExpr): ColumnType {
  if (e.fn === 'COUNT') return 'int';
  return displayType(e.arg?.type);
}

export function computeAggregate(e: AggregateExpr, rows: Value[][]): AggregateCalc {
  const resultType = aggregateResultType(e);
  const base = { sql: exprSql(e), fn: e.fn, star: e.arg === null, distinct: e.distinct, resultType };

  if (e.arg === null) {
    return { ...base, inputs: [], ignoredNulls: 0, ignoredDuplicates: 0, count: rows.length, result: rows.length };
  }

  const argType: ExprType = e.arg.type ?? 'null';
  const inputs = rows.map((row) => evalValue(e.arg!, { row } satisfies EvalContext));
  let values = inputs.filter((v): v is Exclude<Value, null> => v !== null);
  const ignoredNulls = inputs.length - values.length;
  let ignoredDuplicates = 0;
  if (e.distinct) {
    const unique: Exclude<Value, null>[] = [];
    for (const v of values) if (!unique.some((u) => sameGroupValue(u, v, argType))) unique.push(v);
    ignoredDuplicates = values.length - unique.length;
    values = unique;
  }
  const calc = { ...base, inputs, ignoredNulls, ignoredDuplicates };

  if (e.fn === 'COUNT') return { ...calc, count: values.length, result: values.length };
  if (values.length === 0) return { ...calc, count: 0, result: null };

  if (e.fn === 'MIN' || e.fn === 'MAX') {
    let best = values[0]!;
    for (const v of values.slice(1)) {
      const c = sortCompare(v, best, argType);
      if (e.fn === 'MIN' ? c < 0 : c > 0) best = v;
    }
    return { ...calc, result: best };
  }

  const nums = values.map((v) => convert(v, argType, resultType === 'int' ? 'int' : 'decimal') as number);
  const rawSum = nums.reduce((s, n) => s + n, 0);
  const sum = resultType === 'int' ? rawSum : cleanDecimal(rawSum);
  if (e.fn === 'SUM') return { ...calc, sum, count: nums.length, result: sum };
  // AVG over integers truncates, exactly as SQL Server does.
  const avg = resultType === 'int' ? Math.trunc(rawSum / nums.length) : cleanDecimal(rawSum / nums.length);
  return { ...calc, sum, count: nums.length, result: avg };
}
