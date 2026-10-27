// The engine's own AST. It is independent of the parser library so the parser
// can be swapped (or extended for JOIN in V2) without touching the stages.

import type { AggregateFn, ColumnType } from '../types';

export type ArithOp = '+' | '-' | '*' | '/' | '%';
export type CompareOp = '=' | '<>' | '<' | '<=' | '>' | '>=';

/** Static type of an expression. `null` is the type of the NULL literal. */
export type ExprType = ColumnType | 'null' | 'bool';

interface Base {
  /** Set by the parser when the expression was written inside parentheses. */
  paren?: boolean;
  /** Static type, filled in by the analyzer. */
  type?: ExprType;
}

export interface ColumnExpr extends Base {
  kind: 'column';
  name: string;
  qualifier?: string;
  /** Column index in the source table, filled in by the analyzer. */
  index?: number;
  /** Set when an ORDER BY item refers to a SELECT output column (alias or name). */
  outputIndex?: number;
}

export interface LiteralExpr extends Base {
  kind: 'literal';
  value: string | number | null;
  literalType: 'int' | 'decimal' | 'text' | 'null';
  /** Original spelling for numbers, so `1.50` prints as written. */
  raw?: string;
  unicode?: boolean;
}

export interface UnaryExpr extends Base {
  kind: 'unary';
  op: '-' | '+' | 'NOT';
  expr: Expr;
}

export interface BinaryExpr extends Base {
  kind: 'binary';
  op: ArithOp | CompareOp | 'AND' | 'OR';
  left: Expr;
  right: Expr;
}

export interface BetweenExpr extends Base {
  kind: 'between';
  expr: Expr;
  low: Expr;
  high: Expr;
  not: boolean;
}

export interface InExpr extends Base {
  kind: 'in';
  expr: Expr;
  list: Expr[];
  not: boolean;
}

export interface LikeExpr extends Base {
  kind: 'like';
  expr: Expr;
  pattern: Expr;
  not: boolean;
}

export interface IsNullExpr extends Base {
  kind: 'isNull';
  expr: Expr;
  not: boolean;
}

export interface AggregateExpr extends Base {
  kind: 'aggregate';
  fn: AggregateFn;
  /** `null` means `*` (only valid for COUNT). */
  arg: Expr | null;
  distinct: boolean;
}

export type Expr =
  | ColumnExpr
  | LiteralExpr
  | UnaryExpr
  | BinaryExpr
  | BetweenExpr
  | InExpr
  | LikeExpr
  | IsNullExpr
  | AggregateExpr;

export type SelectItem =
  | { kind: 'star'; qualifier?: string }
  | { kind: 'expr'; expr: Expr; alias?: string };

export interface OrderItem {
  expr: Expr;
  dir: 'ASC' | 'DESC';
  /** `ORDER BY 2`: 1-based position in the SELECT list. */
  position?: number;
}

export interface SelectQuery {
  distinct: boolean;
  top?: { n: number; percent: boolean };
  columns: SelectItem[];
  from: { table: string; alias?: string; schema?: string };
  where?: Expr;
  groupBy: Expr[];
  having?: Expr;
  orderBy: OrderItem[];
}
