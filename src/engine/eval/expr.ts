// Expression evaluation with SQL three-valued logic. Conditions return
// true / false / null (UNKNOWN); value expressions return a Value.
// Static types (`expr.type`) must have been filled in by the analyzer.

import { fail } from '../errors';
import type { Expr, ExprType } from '../parse/ast';
import type { Value } from '../types';
import { like } from './like';
import { cleanDecimal, compare, convert, displayType } from './values';
import { aggregateKey } from './aggregates';

export type Truth = boolean | null;

export interface EvalContext {
  /** Source row (or the representative row of a group). */
  row: Value[];
  /** Aggregate results of the current group, by `aggregateKey`. */
  aggregates?: Map<string, Value>;
  /** Projected SELECT values, for ORDER BY items that refer to output columns. */
  outputs?: Value[];
}

const typeOf = (e: Expr): ExprType => e.type ?? 'null';

export function evalValue(e: Expr, ctx: EvalContext): Value {
  switch (e.kind) {
    case 'column':
      if (e.outputIndex !== undefined) return ctx.outputs?.[e.outputIndex] ?? null;
      return ctx.row[e.index!] ?? null;
    case 'literal':
      return e.value;
    case 'aggregate': {
      const v = ctx.aggregates?.get(aggregateKey(e));
      return v === undefined ? null : v;
    }
    case 'unary': {
      const v = evalValue(e.expr, ctx);
      if (v === null) return null;
      const n = convert(v, typeOf(e.expr), displayType(e.type) === 'int' ? 'int' : 'decimal') as number;
      return e.op === '-' ? -n : n;
    }
    case 'binary':
      return arithmetic(e.op, e.left, e.right, typeOf(e), ctx);
    default: {
      // A condition used as a value cannot happen after analysis.
      const t = evalTruth(e, ctx);
      return t === null ? null : t ? 1 : 0;
    }
  }
}

function arithmetic(op: string, l: Expr, r: Expr, resultType: ExprType, ctx: EvalContext): Value {
  const a = evalValue(l, ctx);
  const b = evalValue(r, ctx);
  if (a === null || b === null) return null;
  if (resultType === 'text') return String(convert(a, typeOf(l), 'text')) + String(convert(b, typeOf(r), 'text'));
  const target = resultType === 'int' ? 'int' : 'decimal';
  const x = convert(a, typeOf(l), target) as number;
  const y = convert(b, typeOf(r), target) as number;
  let out: number;
  switch (op) {
    case '+': out = x + y; break;
    case '-': out = x - y; break;
    case '*': out = x * y; break;
    case '/':
      if (y === 0) fail('DIVIDE_BY_ZERO', {}, 8134);
      out = x / y;
      break;
    case '%':
      if (y === 0) fail('DIVIDE_BY_ZERO', {}, 8134);
      out = x % y;
      break;
    default:
      return null;
  }
  return target === 'int' ? Math.trunc(out) : cleanDecimal(out);
}

export function evalTruth(e: Expr, ctx: EvalContext): Truth {
  switch (e.kind) {
    case 'binary': {
      if (e.op === 'AND') {
        const a = evalTruth(e.left, ctx);
        if (a === false) return false;
        const b = evalTruth(e.right, ctx);
        if (b === false) return false;
        return a === null || b === null ? null : true;
      }
      if (e.op === 'OR') {
        const a = evalTruth(e.left, ctx);
        if (a === true) return true;
        const b = evalTruth(e.right, ctx);
        if (b === true) return true;
        return a === null || b === null ? null : false;
      }
      const c = compare(evalValue(e.left, ctx), typeOf(e.left), evalValue(e.right, ctx), typeOf(e.right));
      if (c === null) return null;
      switch (e.op) {
        case '=': return c === 0;
        case '<>': return c !== 0;
        case '<': return c < 0;
        case '<=': return c <= 0;
        case '>': return c > 0;
        case '>=': return c >= 0;
      }
      return null;
    }
    case 'unary': {
      const t = evalTruth(e.expr, ctx);
      return t === null ? null : !t;
    }
    case 'between': {
      const v = evalValue(e.expr, ctx);
      const lo = compare(v, typeOf(e.expr), evalValue(e.low, ctx), typeOf(e.low));
      const hi = compare(v, typeOf(e.expr), evalValue(e.high, ctx), typeOf(e.high));
      // v >= low AND v <= high, with three-valued AND
      const a = lo === null ? null : lo >= 0;
      const b = hi === null ? null : hi <= 0;
      const r = a === false || b === false ? false : a === null || b === null ? null : true;
      return e.not && r !== null ? !r : r;
    }
    case 'in': {
      const v = evalValue(e.expr, ctx);
      let sawNull = false;
      let found = false;
      for (const item of e.list) {
        const c = compare(v, typeOf(e.expr), evalValue(item, ctx), typeOf(item));
        if (c === null) sawNull = true;
        else if (c === 0) {
          found = true;
          break;
        }
      }
      const r: Truth = found ? true : sawNull ? null : false;
      return e.not && r !== null ? !r : r;
    }
    case 'like': {
      const v = evalValue(e.expr, ctx);
      const p = evalValue(e.pattern, ctx);
      if (v === null || p === null) return null;
      const r = like(String(convert(v, typeOf(e.expr), 'text')), String(convert(p, typeOf(e.pattern), 'text')));
      return e.not ? !r : r;
    }
    case 'isNull': {
      const isNull = evalValue(e.expr, ctx) === null;
      return e.not ? !isNull : isNull;
    }
    default: {
      const v = evalValue(e, ctx);
      return v === null ? null : v !== 0;
    }
  }
}

/**
 * For a condition that did not evaluate to TRUE, finds the smallest part
 * responsible (the first failing operand of an AND chain), to explain why a
 * row was discarded.
 */
export function failingPart(e: Expr, ctx: EvalContext): Expr {
  if (e.kind === 'binary' && e.op === 'AND') {
    // A FALSE operand decides the result; prefer it over an UNKNOWN one.
    const a = evalTruth(e.left, ctx);
    if (a === false) return failingPart(e.left, ctx);
    const b = evalTruth(e.right, ctx);
    if (b === false || a === true) return failingPart(e.right, ctx);
    return failingPart(e.left, ctx);
  }
  return e;
}
