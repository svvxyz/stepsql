// Turns T-SQL text into the engine's own AST using node-sql-parser
// (transactsql dialect). Everything the V1 engine does not support is rejected
// here with UNSUPPORTED_FEATURE, so later stages only see known shapes.

import * as sqlParserModule from 'node-sql-parser/build/transactsql';
import { fail, locate } from '../errors';
import type { AggregateFn } from '../types';
import type { Expr, OrderItem, SelectItem, SelectQuery } from './ast';

type ParserCtor = new () => { astify(sql: string, opt?: object): unknown };
// The build is CommonJS: depending on the bundler the class is a named or a default export.
const mod = sqlParserModule as unknown as { Parser?: ParserCtor; default?: { Parser: ParserCtor } };
const ParserClass: ParserCtor = (mod.Parser ?? mod.default?.Parser) as ParserCtor;

let parserInstance: InstanceType<ParserCtor> | undefined;
const getParser = () => (parserInstance ??= new ParserClass());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any;

const OTHER_STATEMENTS = new Set([
  'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'TRUNCATE', 'MERGE',
  'EXEC', 'EXECUTE', 'DECLARE', 'SET', 'USE', 'GRANT', 'REVOKE', 'BEGIN', 'WITH',
]);

const CLAUSE_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'HAVING', 'ORDER', 'TOP', 'DISTINCT', 'AND', 'OR', 'NOT',
  'IN', 'IS', 'LIKE', 'BETWEEN', 'AS', 'ON', 'ASC', 'DESC',
]);

function lineColumn(sql: string, offset: number): { line: number; column: number } {
  const lines = sql.slice(0, offset).split('\n');
  return { line: lines.length, column: lines[lines.length - 1]!.length + 1 };
}

const AGGREGATES: ReadonlySet<string> = new Set(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX']);

/** Removes comments so keyword checks see the real first word. */
function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

function unsupported(sql: string, feature: string, near?: string): never {
  fail('UNSUPPORTED_FEATURE', { feature }, undefined, near ? locate(sql, near) : undefined);
}

function nameOf(n: Node): string {
  if (n == null) return '';
  if (typeof n === 'string') return n;
  if (typeof n.value === 'string') return n.value;
  if (n.expr) return nameOf(n.expr);
  if (Array.isArray(n.name)) return n.name.map(nameOf).join('.');
  if (n.name) return nameOf(n.name);
  return String(n);
}

export function parseQuery(sql: string): SelectQuery {
  const clean = stripComments(sql).trim().replace(/;\s*$/, '');
  if (!clean) fail('EMPTY_QUERY');

  const firstWord = (/^[A-Za-z_]+/.exec(clean)?.[0] ?? '').toUpperCase();
  if (firstWord === 'WITH') unsupported(sql, 'WITH (CTE)', 'WITH');
  if (firstWord !== 'SELECT') {
    if (OTHER_STATEMENTS.has(firstWord)) fail('NOT_A_SELECT', { statement: firstWord }, undefined, locate(sql, firstWord));
    const near = firstWord || clean[0];
    fail('PARSE_ERROR', { near, line: 1, column: 1 }, 102, locate(sql, near));
  }
  if (/\bWITH\s+TIES\b/i.test(clean)) unsupported(sql, 'TOP ... WITH TIES', 'WITH TIES');

  let ast: Node;
  try {
    ast = getParser().astify(sql, { database: 'transactsql' });
  } catch (e) {
    const err = e as { location?: { start: { offset: number; line: number; column: number } }; found?: string | null };
    const loc = err.location?.start;
    if (!loc) fail('PARSE_ERROR', { near: '', line: 1, column: 1 }, 102);
    // The parser often fails one token after the culprit (`SELECT a, FROM t` fails on `t`).
    // Like SQL Server, report the keyword right before the failure point when there is one.
    const before = /(\w+)\s*$/.exec(sql.slice(0, loc.offset));
    if (before && CLAUSE_KEYWORDS.has(before[1]!.toUpperCase())) {
      const start = before.index;
      const { line, column } = lineColumn(sql, start);
      fail('PARSE_ERROR', { near: before[1]!, line, column }, 156, { start, end: start + before[1]!.length });
    }
    const rest = sql.slice(loc.offset);
    const token = /^(\[[^\]]*\]|'[^']*'?|\w+|\S)/.exec(rest)?.[0] ?? '';
    fail(
      'PARSE_ERROR',
      { near: token, line: loc.line, column: loc.column },
      102,
      token ? { start: loc.offset, end: loc.offset + token.length } : undefined,
    );
  }

  if (Array.isArray(ast)) {
    if (ast.length !== 1) fail('MULTIPLE_STATEMENTS', { count: ast.length });
    ast = ast[0];
  }
  if (!ast || ast.type !== 'select') fail('NOT_A_SELECT', { statement: String(ast?.type ?? '').toUpperCase() });

  return convertSelect(ast, sql);
}

function convertSelect(ast: Node, sql: string): SelectQuery {
  if (ast._next || ast.set_op) unsupported(sql, String(ast.set_op ?? 'UNION').toUpperCase(), String(ast.set_op ?? 'UNION'));
  if (ast.with) unsupported(sql, 'WITH (CTE)', 'WITH');
  if (ast.into && ast.into.expr) unsupported(sql, 'SELECT ... INTO', 'INTO');
  if (ast.for && ast.for.type) unsupported(sql, 'FOR XML / FOR JSON', 'FOR');
  // Without this check OFFSET ... FETCH would be silently ignored and every row returned.
  if (ast.limit && (ast.limit.offset || ast.limit.fetch)) unsupported(sql, 'OFFSET ... FETCH', 'OFFSET');

  // FROM
  if (!ast.from || ast.from.length === 0) fail('MISSING_FROM');
  if (ast.from.length > 1) {
    const second = ast.from[1];
    if (second.join) unsupported(sql, 'JOIN', 'JOIN');
    unsupported(sql, 'JOIN', ',');
  }
  const f = ast.from[0];
  if (f.expr) unsupported(sql, 'SUBQUERY', '(');
  if (!f.table) unsupported(sql, 'FROM');
  const from: SelectQuery['from'] = { table: String(f.table) };
  if (f.as) from.alias = String(f.as);
  if (f.db) from.schema = String(f.db);

  const cv = (n: Node) => convertExpr(n, sql);

  // SELECT list
  const columns: SelectItem[] = (ast.columns as Node[]).map((c) => {
    const e = c.expr;
    if (e?.type === 'column_ref' && nameOf(e.column) === '*') {
      return e.table ? { kind: 'star', qualifier: String(e.table) } : { kind: 'star' };
    }
    if (e?.type === 'star') return { kind: 'star' };
    const item: SelectItem = { kind: 'expr', expr: cv(e) };
    const alias = c.as == null ? undefined : nameOf(c.as);
    if (alias) item.alias = alias;
    return item;
  });

  // TOP
  let top: SelectQuery['top'];
  if (ast.top) {
    const raw = typeof ast.top.value === 'object' && ast.top.value !== null ? ast.top.value.value : ast.top.value;
    const n = Number(raw);
    const percent = !!ast.top.percent;
    if (!Number.isFinite(n) || n < 0 || (!percent && !Number.isInteger(n)) || (percent && n > 100)) {
      fail('INVALID_TOP', { value: String(raw) }, 1060, locate(sql, 'TOP'));
    }
    top = { n, percent };
  }

  const distinct = !!(typeof ast.distinct === 'string' ? ast.distinct : ast.distinct?.type);

  const groupNodes: Node[] = Array.isArray(ast.groupby) ? ast.groupby : (ast.groupby?.columns ?? []);
  const groupBy = groupNodes.map((g) => {
    if (g?.type === 'function') {
      const fname = nameOf(g.name).toUpperCase();
      if (fname === 'ROLLUP' || fname === 'CUBE' || fname === 'GROUPING SETS') unsupported(sql, fname, fname);
    }
    return cv(g);
  });

  const orderBy: OrderItem[] = ((ast.orderby as Node[] | null) ?? []).map((o) => {
    const dir: 'ASC' | 'DESC' = String(o.type ?? 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const expr = cv(o.expr);
    const item: OrderItem = { expr, dir };
    if (expr.kind === 'literal' && expr.literalType === 'int' && !expr.paren) item.position = Number(expr.value);
    return item;
  });

  const q: SelectQuery = { distinct, columns, from, groupBy, orderBy };
  if (top) q.top = top;
  if (ast.where) q.where = cv(ast.where);
  if (ast.having) q.having = cv(ast.having);
  return q;
}

function convertExpr(n: Node, sql: string): Expr {
  const e = convertInner(n, sql);
  if (n && n.parentheses) e.paren = true;
  return e;
}

function convertInner(n: Node, sql: string): Expr {
  const cv = (x: Node) => convertExpr(x, sql);
  if (n == null) unsupported(sql, 'EXPRESSION');
  if (n.ast || n.type === 'select') unsupported(sql, 'SUBQUERY', 'SELECT');

  switch (n.type) {
    case 'column_ref': {
      const name = nameOf(n.column);
      if (name === '*') unsupported(sql, '*', '*');
      const col: Expr = { kind: 'column', name };
      if (n.table) col.qualifier = String(n.table);
      return col;
    }
    case 'double_quote_string':
      // With QUOTED_IDENTIFIER ON (SQL Server's default) "x" is an identifier.
      return { kind: 'column', name: String(n.value) };
    case 'number':
    case 'bigint': {
      const raw = String(n.value);
      const isInt = /^-?\d+$/.test(raw);
      return { kind: 'literal', value: Number(raw), literalType: isInt ? 'int' : 'decimal', raw };
    }
    case 'single_quote_string':
    case 'string':
      return { kind: 'literal', value: String(n.value), literalType: 'text' };
    case 'var_string':
    case 'natural_string':
      return { kind: 'literal', value: String(n.value), literalType: 'text', unicode: true };
    case 'null':
      return { kind: 'literal', value: null, literalType: 'null' };
    case 'bool':
      unsupported(sql, String(n.value).toUpperCase(), String(n.value));
    // eslint-disable-next-line no-fallthrough
    case 'unary_expr': {
      const op = String(n.operator).toUpperCase();
      if (op !== '-' && op !== '+' && op !== 'NOT') unsupported(sql, op, op);
      return { kind: 'unary', op: op as '-' | '+' | 'NOT', expr: cv(n.expr) };
    }
    case 'aggr_func': {
      const fn = nameOf(n.name).toUpperCase();
      if (!AGGREGATES.has(fn)) unsupported(sql, fn, fn);
      if (n.over) unsupported(sql, 'OVER (...)', 'OVER');
      const argNode = n.args?.expr;
      const isStar = !argNode || argNode.type === 'star' || (argNode.type === 'column_ref' && nameOf(argNode.column) === '*');
      if (isStar && fn !== 'COUNT') fail('PARSE_ERROR', { near: '*', line: 1, column: 1 }, 102, locate(sql, '*'));
      return {
        kind: 'aggregate',
        fn: fn as AggregateFn,
        arg: isStar ? null : cv(argNode),
        distinct: !!n.args?.distinct,
      };
    }
    case 'function': {
      const fname = nameOf(n.name).toUpperCase();
      const args: Node[] = n.args?.value ?? [];
      // The parser reads `NOT (cond)` as a call to a function named NOT.
      if (fname === 'NOT' && args.length === 1) {
        const inner = cv(args[0]);
        inner.paren = true;
        return { kind: 'unary', op: 'NOT', expr: inner };
      }
      if (n.over) unsupported(sql, 'OVER (...)', 'OVER');
      unsupported(sql, `${fname}()`, fname);
    }
    // eslint-disable-next-line no-fallthrough
    case 'binary_expr':
      return convertBinary(n, sql);
    case 'expr_list':
      if (Array.isArray(n.value) && n.value.length === 1) {
        const inner = cv(n.value[0]);
        inner.paren = true;
        return inner;
      }
      unsupported(sql, 'ROW_VALUE');
    // eslint-disable-next-line no-fallthrough
    case 'case':
      unsupported(sql, 'CASE', 'CASE');
    // eslint-disable-next-line no-fallthrough
    case 'cast':
      unsupported(sql, String(n.keyword ?? 'CAST').toUpperCase(), String(n.keyword ?? 'CAST'));
    // eslint-disable-next-line no-fallthrough
    default:
      unsupported(sql, String(n.type ?? 'EXPRESSION').toUpperCase());
  }
}

function convertBinary(n: Node, sql: string): Expr {
  const cv = (x: Node) => convertExpr(x, sql);
  let op = String(n.operator).toUpperCase();
  if (op === '!=') op = '<>';
  if (op === '&&') op = 'AND';
  if (op === '||') op = 'OR';

  switch (op) {
    case 'AND':
    case 'OR':
    case '=':
    case '<>':
    case '<':
    case '<=':
    case '>':
    case '>=':
    case '+':
    case '-':
    case '*':
    case '/':
    case '%':
      return { kind: 'binary', op, left: cv(n.left), right: cv(n.right) } as Expr;
    case 'BETWEEN':
    case 'NOT BETWEEN': {
      const [low, high] = n.right.value as Node[];
      return { kind: 'between', expr: cv(n.left), low: cv(low), high: cv(high), not: op.startsWith('NOT') };
    }
    case 'IN':
    case 'NOT IN': {
      const items: Node[] = n.right?.type === 'expr_list' ? n.right.value : [n.right];
      if (items.some((i) => i?.ast || i?.type === 'select')) unsupported(sql, 'SUBQUERY', 'SELECT');
      return { kind: 'in', expr: cv(n.left), list: items.map(cv), not: op.startsWith('NOT') };
    }
    case 'LIKE':
    case 'NOT LIKE':
      if (n.right?.type === 'expr_list' && n.right.value?.length > 1) unsupported(sql, 'ESCAPE', 'ESCAPE');
      return { kind: 'like', expr: cv(n.left), pattern: cv(n.right), not: op.startsWith('NOT') };
    case 'IS':
    case 'IS NOT':
      if (n.right?.type !== 'null') unsupported(sql, `${op} ${String(n.right?.value ?? '')}`.trim(), 'IS');
      return { kind: 'isNull', expr: cv(n.left), not: op === 'IS NOT' };
    default:
      unsupported(sql, op, op);
  }
}
