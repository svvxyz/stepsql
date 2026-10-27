// Value semantics modeled on SQL Server with its default collation
// (case-insensitive, accent-sensitive) and implicit conversions.

import { fail } from '../errors';
import type { ExprType } from '../parse/ast';
import type { ColumnType, Value } from '../types';

const collator = new Intl.Collator('es', { sensitivity: 'accent' });

/** Text comparison as SQL Server does it: case-insensitive and ignoring trailing spaces. */
export function compareText(a: string, b: string): number {
  const r = collator.compare(a.replace(/\s+$/, ''), b.replace(/\s+$/, ''));
  return r < 0 ? -1 : r > 0 ? 1 : 0;
}

const SQL_TYPE_NAME: Record<ColumnType, string> = { int: 'int', decimal: 'decimal', text: 'varchar', date: 'date' };
export const sqlTypeName = (t: ExprType): string => (t === 'null' || t === 'bool' ? 'NULL' : SQL_TYPE_NAME[t]);

export function parseDate(text: string): string | null {
  const s = text.trim();
  const m = /^(\d{4})-?(\d{2})-?(\d{2})(?:[ T].*)?$/.exec(s);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (date.getUTCFullYear() !== Number(y) || date.getUTCMonth() !== Number(mo) - 1 || date.getUTCDate() !== Number(d)) {
    return null;
  }
  return `${y}-${mo}-${d}`;
}

/** Implicit conversion of a value to the given type (SQL Server error 245 / 8114 / 241 on failure). */
export function convert(v: Value, from: ExprType, to: ColumnType): Value {
  if (v === null) return null;
  if (from === to) return v;
  if (to === 'text') return typeof v === 'number' ? String(v) : v;
  if (to === 'date') {
    const d = typeof v === 'string' ? parseDate(v) : null;
    if (d === null) fail('CONVERSION_FAILED', { value: String(v), type: 'date' }, 241);
    return d;
  }
  // numeric target
  if (typeof v === 'number') return to === 'int' ? Math.trunc(v) : v;
  const s = v.trim();
  if (to === 'int') {
    if (!/^[+-]?\d+$/.test(s)) fail('CONVERSION_FAILED', { value: v, type: 'int' }, 245);
    return Number(s);
  }
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) fail('CONVERSION_FAILED', { value: v, type: 'decimal' }, 8114);
  return Number(s);
}

const PRECEDENCE: Record<ColumnType, number> = { text: 0, int: 1, decimal: 2, date: 3 };

/** Type both sides are converted to before comparing; `undefined` when they clash. */
export function comparisonType(a: ExprType, b: ExprType): ColumnType | 'null' | undefined {
  if (a === 'null' || b === 'null') return 'null';
  if (a === 'bool' || b === 'bool') return undefined;
  if (a === b) return a;
  const isNum = (t: ColumnType) => t === 'int' || t === 'decimal';
  if ((a === 'date' && isNum(b)) || (b === 'date' && isNum(a))) return undefined;
  return PRECEDENCE[a] > PRECEDENCE[b] ? a : b;
}

/** -1 / 0 / 1, or null when either side is NULL (UNKNOWN). */
export function compare(a: Value, ta: ExprType, b: Value, tb: ExprType): number | null {
  if (a === null || b === null) return null;
  const t = comparisonType(ta, tb);
  if (t === undefined || t === 'null') return null;
  const x = convert(a, ta, t);
  const y = convert(b, tb, t);
  if (x === null || y === null) return null;
  if (t === 'text') return compareText(String(x), String(y));
  if (t === 'date') return x < y ? -1 : x > y ? 1 : 0;
  return (x as number) < (y as number) ? -1 : (x as number) > (y as number) ? 1 : 0;
}

/** Ordering used by ORDER BY: NULL sorts first, as in SQL Server. */
export function sortCompare(a: Value, b: Value, t: ExprType): number {
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return compare(a, t, b, t) ?? 0;
}

/** Equality used by GROUP BY and DISTINCT: NULLs are equal to each other. */
export function sameGroupValue(a: Value, b: Value, t: ExprType): boolean {
  if (a === null || b === null) return a === b;
  return compare(a, t, b, t) === 0;
}

/** Rounds away binary floating point noise (0.1 + 0.2) in decimal results. */
export function cleanDecimal(n: number): number {
  return Math.round(n * 1e10) / 1e10;
}

/** Normalizes a type for display: NULL literals and conditions show as text. */
export function displayType(t: ExprType | undefined): ColumnType {
  return t === undefined || t === 'null' || t === 'bool' ? 'text' : t;
}
