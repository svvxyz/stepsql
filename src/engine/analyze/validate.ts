// Semantic analysis: resolves tables and columns, infers static types and
// applies SQL Server's rules (grouping, aggregates, aliases, ORDER BY with
// DISTINCT). Errors carry the SQL Server error number for reference.

import { exprSql, ident, sameExpr } from '../describe/sqlText';
import { fail, locate } from '../errors';
import { aggregateKey, aggregateResultType } from '../eval/aggregates';
import { comparisonType, sqlTypeName } from '../eval/values';
import type { AggregateExpr, ColumnExpr, Expr, ExprType, OrderItem, SelectQuery } from '../parse/ast';
import type { ColumnType, Table } from '../types';

export type Clause = 'SELECT' | 'WHERE' | 'GROUP BY' | 'HAVING' | 'ORDER BY';

export interface OutputColumn {
  name: string;
  unnamed: boolean;
  type: ColumnType;
  expr: Expr;
  /** Index of the source column when the output is a plain column reference. */
  sourceIndex?: number;
  computed: boolean;
}

export interface BoundOrderItem extends OrderItem {
  sql: string;
  /** Source column sorted on that is not part of the SELECT list. */
  hiddenColumn?: string;
}

export interface BoundQuery {
  query: SelectQuery;
  table: Table;
  outputs: OutputColumn[];
  grouped: boolean;
  aggregates: AggregateExpr[];
  orderBy: BoundOrderItem[];
}

const eq = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;

export function analyze(query: SelectQuery, tables: Table[], sql: string): BoundQuery {
  const table = tables.find((t) => eq(t.name, query.from.table));
  if (!table) fail('TABLE_NOT_FOUND', { table: query.from.table }, 208, locate(sql, query.from.table));
  if (query.from.schema && !eq(query.from.schema, 'dbo')) {
    fail('TABLE_NOT_FOUND', { table: `${query.from.schema}.${query.from.table}` }, 208, locate(sql, query.from.table));
  }

  const aliases = query.columns.flatMap((c) => (c.kind === 'expr' && c.alias ? [c.alias] : []));
  const validQualifier = query.from.alias ?? table.name;

  // T-SQL `SELECT Total = SUM(x)` is the alias-first syntax.
  for (const c of query.columns) {
    if (c.kind === 'expr' && !c.alias && !c.expr.paren && c.expr.kind === 'binary' && c.expr.op === '=' &&
        c.expr.left.kind === 'column' && !c.expr.left.qualifier && !c.expr.left.paren) {
      c.alias = c.expr.left.name;
      c.expr = c.expr.right;
    }
  }

  const bind = (e: Expr, clause: Clause, allowAggregates: boolean, insideAggregate = false): ExprType => {
    const t = bindInner(e, clause, allowAggregates, insideAggregate);
    e.type = t;
    return t;
  };

  const resolveColumn = (c: ColumnExpr, clause: Clause): ExprType => {
    if (c.qualifier && !eq(c.qualifier, validQualifier)) {
      fail('INVALID_QUALIFIER', { qualifier: c.qualifier, column: c.name }, 4104, locate(sql, c.qualifier));
    }
    const idx = table.columns.findIndex((col) => eq(col.name, c.name));
    if (idx === -1) {
      const alias = aliases.find((a) => eq(a, c.name));
      if (alias && clause !== 'SELECT') fail('ALIAS_NOT_ALLOWED', { alias, clause }, 207, locate(sql, c.name));
      fail('COLUMN_NOT_FOUND', { column: c.name, table: table.name }, 207, locate(sql, c.name));
    }
    c.index = idx;
    return table.columns[idx]!.type;
  };

  const requireValue = (e: Expr, t: ExprType) => {
    if (t === 'bool') fail('PARSE_ERROR', { near: exprSql(e), line: 1, column: 1 }, 102, locate(sql, exprSql(e)));
  };
  const requireCondition = (e: Expr, t: ExprType) => {
    if (t !== 'bool') fail('NON_BOOLEAN_CONDITION', { expression: { sql: exprSql(e) } }, 4145, locate(sql, exprSql(e)));
  };

  function bindInner(e: Expr, clause: Clause, allowAgg: boolean, insideAgg: boolean): ExprType {
    switch (e.kind) {
      case 'column':
        return resolveColumn(e, clause);
      case 'literal':
        return e.literalType;
      case 'aggregate': {
        const aggSql = exprSql(e);
        if (insideAgg) fail('NESTED_AGGREGATE', { aggregate: { sql: aggSql } }, 130, locate(sql, e.fn));
        if (!allowAgg) {
          if (clause === 'WHERE') fail('AGGREGATE_IN_WHERE', { aggregate: { sql: aggSql } }, 147, locate(sql, e.fn));
          fail('AGGREGATE_IN_GROUP_BY', { aggregate: { sql: aggSql } }, 144, locate(sql, e.fn));
        }
        if (e.arg) {
          const at = bind(e.arg, clause, allowAgg, true);
          requireValue(e.arg, at);
          if ((e.fn === 'SUM' || e.fn === 'AVG') && (at === 'text' || at === 'date' || at === 'null')) {
            fail('AGGREGATE_TYPE_INVALID', { fn: e.fn, type: sqlTypeName(at) }, 8117, locate(sql, e.fn));
          }
        }
        return aggregateResultType(e);
      }
      case 'unary': {
        const t = bind(e.expr, clause, allowAgg, insideAgg);
        if (e.op === 'NOT') {
          requireCondition(e.expr, t);
          return 'bool';
        }
        requireValue(e.expr, t);
        if (t === 'date') fail('OPERAND_TYPE_CLASH', { left: 'date', right: 'int', op: e.op }, 206, locate(sql, exprSql(e)));
        return t === 'decimal' ? 'decimal' : t === 'null' ? 'null' : 'int';
      }
      case 'binary': {
        const lt = bind(e.left, clause, allowAgg, insideAgg);
        const rt = bind(e.right, clause, allowAgg, insideAgg);
        if (e.op === 'AND' || e.op === 'OR') {
          requireCondition(e.left, lt);
          requireCondition(e.right, rt);
          return 'bool';
        }
        requireValue(e.left, lt);
        requireValue(e.right, rt);
        if (['=', '<>', '<', '<=', '>', '>='].includes(e.op)) {
          if (comparisonType(lt, rt) === undefined) {
            fail('OPERAND_TYPE_CLASH', { left: sqlTypeName(lt), right: sqlTypeName(rt), op: e.op }, 206, locate(sql, exprSql(e)));
          }
          return 'bool';
        }
        return arithmeticType(e, lt, rt);
      }
      case 'between': {
        const ts = [bind(e.expr, clause, allowAgg, insideAgg), bind(e.low, clause, allowAgg, insideAgg), bind(e.high, clause, allowAgg, insideAgg)];
        [e.expr, e.low, e.high].forEach((x, i) => requireValue(x, ts[i]!));
        for (const other of ts.slice(1)) {
          if (comparisonType(ts[0]!, other) === undefined) {
            fail('OPERAND_TYPE_CLASH', { left: sqlTypeName(ts[0]!), right: sqlTypeName(other), op: 'BETWEEN' }, 206, locate(sql, 'BETWEEN'));
          }
        }
        return 'bool';
      }
      case 'in': {
        const t = bind(e.expr, clause, allowAgg, insideAgg);
        requireValue(e.expr, t);
        for (const item of e.list) {
          const it = bind(item, clause, allowAgg, insideAgg);
          requireValue(item, it);
          if (comparisonType(t, it) === undefined) {
            fail('OPERAND_TYPE_CLASH', { left: sqlTypeName(t), right: sqlTypeName(it), op: 'IN' }, 206, locate(sql, 'IN'));
          }
        }
        return 'bool';
      }
      case 'like': {
        requireValue(e.expr, bind(e.expr, clause, allowAgg, insideAgg));
        requireValue(e.pattern, bind(e.pattern, clause, allowAgg, insideAgg));
        return 'bool';
      }
      case 'isNull':
        requireValue(e.expr, bind(e.expr, clause, allowAgg, insideAgg));
        return 'bool';
    }
  }

  function arithmeticType(e: Extract<Expr, { kind: 'binary' }>, lt: ExprType, rt: ExprType): ExprType {
    if (lt === 'date' || rt === 'date') {
      if (lt === 'null' || rt === 'null') return 'null';
      fail('OPERAND_TYPE_CLASH', { left: sqlTypeName(lt), right: sqlTypeName(rt), op: e.op }, 206, locate(sql, exprSql(e)));
    }
    if (lt === 'null' && rt === 'null') return 'null';
    if (lt === 'null') return rt;
    if (rt === 'null') return lt;
    if (lt === 'text' && rt === 'text') {
      if (e.op === '+') return 'text';
      fail('OPERAND_TYPE_CLASH', { left: 'varchar', right: 'varchar', op: e.op }, 402, locate(sql, exprSql(e)));
    }
    if (lt === 'decimal' || rt === 'decimal') return 'decimal';
    return 'int';
  }

  const hasAggregate = (e: Expr): boolean => {
    switch (e.kind) {
      case 'aggregate': return true;
      case 'column':
      case 'literal': return false;
      case 'unary': return hasAggregate(e.expr);
      case 'binary': return hasAggregate(e.left) || hasAggregate(e.right);
      case 'between': return [e.expr, e.low, e.high].some(hasAggregate);
      case 'in': return [e.expr, ...e.list].some(hasAggregate);
      case 'like': return hasAggregate(e.expr) || hasAggregate(e.pattern);
      case 'isNull': return hasAggregate(e.expr);
    }
  };

  // WHERE
  if (query.where) requireCondition(query.where, bind(query.where, 'WHERE', false));

  // GROUP BY
  for (const g of query.groupBy) {
    if (g.kind === 'literal') fail('GROUP_BY_CONSTANT', { expression: { sql: exprSql(g) } }, 164, locate(sql, exprSql(g)));
    requireValue(g, bind(g, 'GROUP BY', false));
  }

  // SELECT list: expand * and bind
  const outputs: OutputColumn[] = [];
  for (const item of query.columns) {
    if (item.kind === 'star') {
      if (item.qualifier && !eq(item.qualifier, validQualifier)) {
        fail('INVALID_QUALIFIER', { qualifier: item.qualifier, column: '*' }, 4104, locate(sql, item.qualifier));
      }
      table.columns.forEach((col, i) => {
        outputs.push({ name: col.name, unnamed: false, type: col.type, expr: { kind: 'column', name: col.name, index: i, type: col.type }, sourceIndex: i, computed: false });
      });
      continue;
    }
    const t = bind(item.expr, 'SELECT', true);
    requireValue(item.expr, t);
    const isCol = item.expr.kind === 'column';
    const out: OutputColumn = {
      name: item.alias ?? (isCol ? table.columns[(item.expr as ColumnExpr).index!]!.name : exprSql(item.expr)),
      unnamed: !item.alias && !isCol,
      type: t === 'null' || t === 'bool' ? 'text' : t,
      expr: item.expr,
      computed: !isCol,
    };
    if (isCol) out.sourceIndex = (item.expr as ColumnExpr).index!;
    outputs.push(out);
  }

  // HAVING
  if (query.having) requireCondition(query.having, bind(query.having, 'HAVING', true));

  // ORDER BY
  const orderBy: BoundOrderItem[] = [];
  for (const o of query.orderBy) {
    const b: BoundOrderItem = { ...o, sql: `${exprSql(o.expr)} ${o.dir}` };
    if (o.position !== undefined) {
      if (o.position < 1 || o.position > outputs.length) {
        fail('ORDER_BY_POSITION_OUT_OF_RANGE', { position: o.position, count: outputs.length }, 108, locate(sql, String(o.position)));
      }
      const out = outputs[o.position - 1]!;
      b.expr = { kind: 'column', name: out.name, outputIndex: o.position - 1, type: out.type };
      b.sql = `${ident(out.name)} ${o.dir}`;
    } else if (o.expr.kind === 'column' && !o.expr.qualifier && outputs.some((x) => eq(x.name, (o.expr as ColumnExpr).name))) {
      const idx = outputs.findIndex((x) => eq(x.name, (o.expr as ColumnExpr).name));
      b.expr = { kind: 'column', name: outputs[idx]!.name, outputIndex: idx, type: outputs[idx]!.type };
    } else {
      requireValue(o.expr, bind(o.expr, 'ORDER BY', true));
      const idx = outputs.findIndex((x) => sameExpr(x.expr, o.expr));
      if (idx !== -1) {
        b.expr = { kind: 'column', name: outputs[idx]!.name, outputIndex: idx, type: outputs[idx]!.type };
      } else {
        if (query.distinct) {
          fail('ORDER_BY_NOT_IN_SELECT_DISTINCT', { item: { sql: exprSql(o.expr) } }, 145, locate(sql, exprSql(o.expr)));
        }
        if (o.expr.kind === 'column') b.hiddenColumn = table.columns[o.expr.index!]!.name;
      }
    }
    orderBy.push(b);
  }

  // Grouping rules (error 8120)
  const grouped =
    query.groupBy.length > 0 ||
    outputs.some((o) => hasAggregate(o.expr)) ||
    (query.having !== undefined) ||
    orderBy.some((o) => hasAggregate(o.expr));

  if (grouped) {
    const checkGrouped = (e: Expr, clause: Clause): void => {
      if (e.kind === 'column' && e.outputIndex !== undefined) return;
      if (query.groupBy.some((g) => sameExpr(g, e))) return;
      switch (e.kind) {
        case 'aggregate':
        case 'literal':
          return;
        case 'column':
          fail('COLUMN_NOT_IN_GROUP_BY', { column: e.qualifier ? `${e.qualifier}.${e.name}` : e.name, clause }, 8120, locate(sql, e.name));
        // eslint-disable-next-line no-fallthrough
        case 'unary':
        case 'isNull':
          return checkGrouped(e.expr, clause);
        case 'binary':
          checkGrouped(e.left, clause);
          return checkGrouped(e.right, clause);
        case 'between':
          return [e.expr, e.low, e.high].forEach((x) => checkGrouped(x, clause));
        case 'in':
          return [e.expr, ...e.list].forEach((x) => checkGrouped(x, clause));
        case 'like':
          checkGrouped(e.expr, clause);
          return checkGrouped(e.pattern, clause);
      }
    };
    outputs.forEach((o) => checkGrouped(o.expr, 'SELECT'));
    if (query.having) checkGrouped(query.having, 'HAVING');
    orderBy.forEach((o) => checkGrouped(o.expr, 'ORDER BY'));
  }

  // Unique aggregates, in order of appearance
  const aggregates: AggregateExpr[] = [];
  const collect = (e: Expr) => {
    if (e.kind === 'aggregate') {
      if (!aggregates.some((a) => aggregateKey(a) === aggregateKey(e))) aggregates.push(e);
      return;
    }
    switch (e.kind) {
      case 'unary':
      case 'isNull': collect(e.expr); break;
      case 'binary': collect(e.left); collect(e.right); break;
      case 'between': [e.expr, e.low, e.high].forEach(collect); break;
      case 'in': [e.expr, ...e.list].forEach(collect); break;
      case 'like': collect(e.expr); collect(e.pattern); break;
      default: break;
    }
  };
  outputs.forEach((o) => collect(o.expr));
  if (query.having) collect(query.having);
  orderBy.forEach((o) => collect(o.expr));

  return { query, table, outputs, grouped, aggregates, orderBy };
}
