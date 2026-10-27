// Prints AST nodes back to canonical T-SQL. Used for message parameters and
// for column headers, so explanations quote the user's own query.

import type { Expr, OrderItem, SelectItem, SelectQuery } from '../parse/ast';

const RESERVED = new Set([
  'SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'HAVING', 'ORDER', 'TOP', 'DISTINCT', 'AND', 'OR',
  'NOT', 'IN', 'IS', 'NULL', 'LIKE', 'BETWEEN', 'AS', 'ASC', 'DESC', 'TABLE', 'KEY', 'USER',
]);

export function ident(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !RESERVED.has(name.toUpperCase())
    ? name
    : `[${name.replace(/]/g, ']]')}]`;
}

function lit(e: Extract<Expr, { kind: 'literal' }>): string {
  if (e.literalType === 'null') return 'NULL';
  if (e.literalType === 'text') return `${e.unicode ? 'N' : ''}'${String(e.value).replace(/'/g, "''")}'`;
  return e.raw ?? String(e.value);
}

/** Optional hook to print a node differently (used to substitute row values). */
export type Substitute = (e: Expr) => string | undefined;

export function exprSql(e: Expr, sub?: Substitute): string {
  const replaced = sub?.(e);
  if (replaced !== undefined) return replaced;
  const inner = exprInner(e, sub);
  return e.paren ? `(${inner})` : inner;
}

function exprInner(e: Expr, sub?: Substitute): string {
  const exprSql_ = (x: Expr) => exprSql(x, sub);
  switch (e.kind) {
    case 'column':
      return e.qualifier ? `${ident(e.qualifier)}.${ident(e.name)}` : ident(e.name);
    case 'literal':
      return lit(e);
    case 'unary':
      return e.op === 'NOT' ? `NOT ${exprSql_(e.expr)}` : `${e.op}${exprSql_(e.expr)}`;
    case 'binary':
      return `${exprSql_(e.left)} ${e.op} ${exprSql_(e.right)}`;
    case 'between':
      return `${exprSql_(e.expr)} ${e.not ? 'NOT ' : ''}BETWEEN ${exprSql_(e.low)} AND ${exprSql_(e.high)}`;
    case 'in':
      return `${exprSql_(e.expr)} ${e.not ? 'NOT ' : ''}IN (${e.list.map(exprSql_).join(', ')})`;
    case 'like':
      return `${exprSql_(e.expr)} ${e.not ? 'NOT ' : ''}LIKE ${exprSql_(e.pattern)}`;
    case 'isNull':
      return `${exprSql_(e.expr)} IS ${e.not ? 'NOT ' : ''}NULL`;
    case 'aggregate':
      return `${e.fn}(${e.distinct ? 'DISTINCT ' : ''}${e.arg ? exprSql_(e.arg) : '*'})`;
  }
}

export function selectItemSql(item: SelectItem): string {
  if (item.kind === 'star') return item.qualifier ? `${ident(item.qualifier)}.*` : '*';
  return item.alias ? `${exprSql(item.expr)} AS ${ident(item.alias)}` : exprSql(item.expr);
}

export function orderItemSql(o: OrderItem): string {
  return `${exprSql(o.expr)} ${o.dir}`;
}

export const clauseSql = {
  from: (q: SelectQuery) =>
    `FROM ${q.from.schema ? `${ident(q.from.schema)}.` : ''}${ident(q.from.table)}${q.from.alias ? ` AS ${ident(q.from.alias)}` : ''}`,
  where: (q: SelectQuery) => (q.where ? `WHERE ${exprSql(q.where)}` : ''),
  groupBy: (q: SelectQuery) => (q.groupBy.length ? `GROUP BY ${q.groupBy.map((g) => exprSql(g)).join(', ')}` : ''),
  having: (q: SelectQuery) => (q.having ? `HAVING ${exprSql(q.having)}` : ''),
  select: (q: SelectQuery) => `SELECT ${q.columns.map(selectItemSql).join(', ')}`,
  distinct: () => 'DISTINCT',
  orderBy: (q: SelectQuery) => (q.orderBy.length ? `ORDER BY ${q.orderBy.map(orderItemSql).join(', ')}` : ''),
  top: (q: SelectQuery) => (q.top ? `TOP ${q.top.n}${q.top.percent ? ' PERCENT' : ''}` : ''),
};

/** Structural equality used to match SELECT/HAVING expressions against GROUP BY ones. */
export function sameExpr(a: Expr, b: Expr): boolean {
  return normalized(a) === normalized(b);
}

function normalized(e: Expr): string {
  // Column names compare case-insensitively and ignore the table qualifier (single table in V1).
  const strip = (x: Expr): Expr => {
    switch (x.kind) {
      case 'column':
        return { kind: 'column', name: x.name.toLowerCase() };
      case 'literal':
        return { ...x, paren: false };
      case 'unary':
        return { kind: 'unary', op: x.op, expr: strip(x.expr) };
      case 'binary':
        return { kind: 'binary', op: x.op, left: strip(x.left), right: strip(x.right) };
      case 'between':
        return { kind: 'between', expr: strip(x.expr), low: strip(x.low), high: strip(x.high), not: x.not };
      case 'in':
        return { kind: 'in', expr: strip(x.expr), list: x.list.map(strip), not: x.not };
      case 'like':
        return { kind: 'like', expr: strip(x.expr), pattern: strip(x.pattern), not: x.not };
      case 'isNull':
        return { kind: 'isNull', expr: strip(x.expr), not: x.not };
      case 'aggregate':
        return { kind: 'aggregate', fn: x.fn, arg: x.arg ? strip(x.arg) : null, distinct: x.distinct };
    }
  };
  return exprSql(strip(e));
}
