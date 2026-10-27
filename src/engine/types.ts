// Public contract of the engine. Nothing here contains human-readable text:
// explanations, reasons and errors are message keys or codes plus parameters
// that the UI translates.

/** A cell value. Dates are ISO strings (`YYYY-MM-DD`) in columns typed `date`. */
export type Value = string | number | null;

export type ColumnType = 'text' | 'int' | 'decimal' | 'date';

export interface ColumnDef {
  name: string;
  type: ColumnType;
}

export interface Table {
  name: string;
  columns: ColumnDef[];
  rows: Value[][];
}

/** A fragment of SQL to be rendered as code (never translated). */
export interface SqlParam {
  sql: string;
}

export type MsgParam = string | number | null | string[] | SqlParam | SqlParam[];

export interface MessageRef {
  key: string;
  params?: Record<string, MsgParam>;
}

export type StageId =
  | 'from'
  | 'where'
  | 'groupBy'
  | 'aggregate'
  | 'having'
  | 'select'
  | 'distinct'
  | 'orderBy'
  | 'top'
  | 'result';

export type RowStatus = 'kept' | 'discarded' | 'new';

export interface StepRow {
  /** Stable id: index of the source row, or of the group once rows are grouped. */
  id: number;
  values: Value[];
  status: RowStatus;
  /** Why the row was discarded at this stage. */
  reason?: MessageRef;
  /** Index into `Step.groups`, used to color the row. */
  groupId?: number;
  /** For rows that summarize a group: the source rows they come from. */
  sourceRowIds?: number[];
}

export type ColumnHighlight = 'groupKey' | 'computed' | 'sortKey' | 'aggregate';

export interface StepColumn {
  name: string;
  type: ColumnType;
  /** True when SQL Server would show "(No column name)". `name` then holds the expression. */
  unnamed?: boolean;
  highlight?: ColumnHighlight;
}

export type AggregateFn = 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';

export interface AggregateCalc {
  sql: string;
  fn: AggregateFn;
  /** True for COUNT(*). */
  star: boolean;
  distinct: boolean;
  /** Values that reached the function, NULLs included (they are listed as ignored). */
  inputs: Value[];
  ignoredNulls: number;
  /** For DISTINCT aggregates: duplicates dropped before computing. */
  ignoredDuplicates: number;
  /** For AVG: the sum and count used, before any integer truncation. */
  sum?: Value;
  count?: number;
  result: Value;
  resultType: ColumnType;
}

export interface Group {
  id: number;
  key: Value[];
  keySql: string[];
  rowIds: number[];
  aggregates?: AggregateCalc[];
}

export interface SortKey {
  sql: string;
  dir: 'ASC' | 'DESC';
}

/**
 * Identity and origin of one row of a step. Kept beside `Step.rows` (same
 * order) rather than inside each row, so the row objects stay as they were.
 */
export interface RowLineage {
  /**
   * Stable identity across steps: `Mascotas#12` is row 12 of the source table,
   * `g:3` is group 3. A row keeps its key from FROM to the result until it is grouped.
   */
  key: string;
  /** Keys of the rows of the previous step this row comes from. */
  parents: string[];
  /** Keys of the source-table rows behind this row (all of a group's rows, merged duplicates). */
  origin: string[];
  /** WHERE / HAVING: indexes of the columns that decided the discard. */
  decisive?: number[];
  /** DISTINCT: key of the earlier row this duplicate merges into. */
  mergedInto?: string;
  /**
   * WHERE / HAVING: the condition with this row's values in place, as it is
   * evaluated (`7 > 5`), its result, and the columns it reads. For a discarded
   * row it is the part that failed, the same one quoted in the reason.
   */
  test?: { sql: string; result: boolean | null; columns: number[] };
  /** SELECT: for each computed column, its expression with this row's values (`7 * 2`); null elsewhere. */
  cells?: (string | null)[];
  /** ORDER BY: this row's value for each sort key (also for keys not shown in the SELECT). */
  sortKeys?: Value[];
}

export interface ColumnLineage {
  /** Index of the column in the previous step it comes from; null when computed here. */
  source: number | null;
  /** The expression behind the column, e.g. `SUM(Edad)` for the alias `EdadTotal`. */
  exprSql: string;
}

export interface Step {
  /** One entry per row, in the same order as `rows`. */
  lineage?: RowLineage[];
  /** SELECT and later steps: one entry per column, in the same order as `columns`. */
  columnLineage?: ColumnLineage[];
  /** SELECT: columns of the previous step that are not projected. */
  droppedColumns?: StepColumn[];
  stage: StageId;
  /** Canonical text of the clause this step executes, e.g. `WHERE Edad > 5`. */
  clauseSql?: string;
  columns: StepColumn[];
  rows: StepRow[];
  groups?: Group[];
  sort?: SortKey[];
  explanation: MessageRef;
  notes: MessageRef[];
  stats: { rowsIn: number; rowsOut: number };
}

export type ErrorCode =
  | 'EMPTY_QUERY'
  | 'PARSE_ERROR'
  | 'NOT_A_SELECT'
  | 'MULTIPLE_STATEMENTS'
  | 'UNSUPPORTED_FEATURE'
  | 'MISSING_FROM'
  | 'TABLE_NOT_FOUND'
  | 'COLUMN_NOT_FOUND'
  | 'INVALID_QUALIFIER'
  | 'ALIAS_NOT_ALLOWED'
  | 'COLUMN_NOT_IN_GROUP_BY'
  | 'AGGREGATE_IN_WHERE'
  | 'AGGREGATE_IN_GROUP_BY'
  | 'NESTED_AGGREGATE'
  | 'AGGREGATE_TYPE_INVALID'
  | 'OPERAND_TYPE_CLASH'
  | 'NON_BOOLEAN_CONDITION'
  | 'GROUP_BY_CONSTANT'
  | 'ORDER_BY_POSITION_OUT_OF_RANGE'
  | 'ORDER_BY_NOT_IN_SELECT_DISTINCT'
  | 'INVALID_TOP'
  | 'CONVERSION_FAILED'
  | 'DIVIDE_BY_ZERO'
  | 'INVALID_TABLE_DATA';

export interface EngineError {
  code: ErrorCode;
  params: Record<string, MsgParam>;
  /** Number of the equivalent SQL Server error, for reference. */
  sqlServerError?: number;
  /** Character offsets in the query, to underline the problem. */
  location?: { start: number; end: number };
}

export type RunResult = { ok: true; steps: Step[] } | { ok: false; error: EngineError };

/** Every stage and note key the engine can emit, used by the translation tests. */
export const ENGINE_MESSAGE_KEYS = [
  'step.from.explanation',
  'step.where.explanation',
  'step.groupBy.explanation',
  'step.groupBy.wholeTable',
  'step.aggregate.explanation',
  'step.having.explanation',
  'step.select.explanation',
  'step.select.star',
  'step.distinct.explanation',
  'step.orderBy.explanation',
  'step.top.explanation',
  'step.top.percent',
  'step.result.explanation',
  'reason.where.false',
  'reason.where.unknown',
  'reason.having.false',
  'reason.having.unknown',
  'reason.distinct.duplicate',
  'reason.top.beyond',
  'note.unknownIsDiscarded',
  'note.intDivision',
  'note.avgInt',
  'note.nullsIgnored',
  'note.nullGroup',
  'note.emptyGroupsNoRows',
  'note.aggregateWithoutGroupBy',
  'note.havingWithoutGroupBy',
  'note.caseInsensitive',
  'note.nullsSortFirst',
  'note.orderByHiddenColumn',
  'note.topWithoutOrder',
  'note.distinctNulls',
] as const;

export const ENGINE_ERROR_CODES: readonly ErrorCode[] = [
  'EMPTY_QUERY',
  'PARSE_ERROR',
  'NOT_A_SELECT',
  'MULTIPLE_STATEMENTS',
  'UNSUPPORTED_FEATURE',
  'MISSING_FROM',
  'TABLE_NOT_FOUND',
  'COLUMN_NOT_FOUND',
  'INVALID_QUALIFIER',
  'ALIAS_NOT_ALLOWED',
  'COLUMN_NOT_IN_GROUP_BY',
  'AGGREGATE_IN_WHERE',
  'AGGREGATE_IN_GROUP_BY',
  'NESTED_AGGREGATE',
  'AGGREGATE_TYPE_INVALID',
  'OPERAND_TYPE_CLASH',
  'NON_BOOLEAN_CONDITION',
  'GROUP_BY_CONSTANT',
  'ORDER_BY_POSITION_OUT_OF_RANGE',
  'ORDER_BY_NOT_IN_SELECT_DISTINCT',
  'INVALID_TOP',
  'CONVERSION_FAILED',
  'DIVIDE_BY_ZERO',
  'INVALID_TABLE_DATA',
];
