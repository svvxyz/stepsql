import { exprSql } from '../describe/sqlText';
import { aggregateKey, aggregateResultType, computeAggregate } from '../eval/aggregates';
import { displayType } from '../eval/values';
import type { Group, MessageRef, Step, StepColumn, StepRow, Value } from '../types';
import type { WorkingGroup, WorkingState } from './state';

/** Values of the one-row-per-group table: group keys followed by aggregate results. */
export function groupRowValues(state: WorkingState, g: WorkingGroup): Value[] {
  return [...g.key, ...state.bound.aggregates.map((a) => g.aggregateValues.get(aggregateKey(a)) ?? null)];
}

export function aggregateStage(state: WorkingState): Step | undefined {
  const { query, aggregates, table } = state.bound;
  const groups = state.groups;
  if (!groups) return undefined;

  for (const g of groups) {
    const rows = g.rows.map((r) => r.values);
    g.calcs = aggregates.map((a) => computeAggregate(a, rows));
    aggregates.forEach((a, i) => g.aggregateValues.set(aggregateKey(a), g.calcs[i]!.result));
  }

  const columns: StepColumn[] = [
    ...query.groupBy.map((k): StepColumn => {
      const name = k.kind === 'column' ? table.columns[k.index!]!.name : exprSql(k);
      return { name, type: displayType(k.type), highlight: 'groupKey', ...(k.kind === 'column' ? {} : { unnamed: true }) };
    }),
    ...aggregates.map((a): StepColumn => ({ name: exprSql(a), type: aggregateResultType(a), unnamed: true, highlight: 'aggregate' })),
  ];
  state.groupColumns = columns;
  if (aggregates.length === 0) return undefined;

  const rows: StepRow[] = groups.map((g) => ({
    id: g.id,
    values: groupRowValues(state, g),
    status: 'new',
    groupId: g.id,
    sourceRowIds: g.rows.map((r) => r.id),
  }));

  const outGroups: Group[] = groups.map((g) => ({
    id: g.id,
    key: g.key,
    keySql: query.groupBy.map((k) => exprSql(k)),
    rowIds: g.rows.map((r) => r.id),
    aggregates: g.calcs,
  }));

  const notes: MessageRef[] = [];
  if (query.groupBy.length === 0) notes.push({ key: 'note.aggregateWithoutGroupBy' });
  aggregates.forEach((a, i) => {
    const ignored = groups.reduce((s, g) => s + g.calcs[i]!.ignoredNulls, 0);
    if (ignored > 0) notes.push({ key: 'note.nullsIgnored', params: { aggregate: { sql: exprSql(a) }, count: ignored } });
    if (a.fn === 'AVG' && aggregateResultType(a) === 'int') notes.push({ key: 'note.avgInt', params: { aggregate: { sql: exprSql(a) } } });
  });

  return {
    stage: 'aggregate',
    columns,
    rows,
    groups: outGroups,
    explanation: {
      key: 'step.aggregate.explanation',
      params: { aggregates: aggregates.map((a) => ({ sql: exprSql(a) })), count: groups.length },
    },
    notes,
    stats: { rowsIn: state.rows.length, rowsOut: groups.length },
  };
}
