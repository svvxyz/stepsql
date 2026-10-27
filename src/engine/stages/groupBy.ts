import { clauseSql, exprSql } from '../describe/sqlText';
import { evalValue } from '../eval/expr';
import { displayType, sameGroupValue } from '../eval/values';
import type { Group, MessageRef, Step, StepColumn, StepRow, Value } from '../types';
import type { WorkingGroup, WorkingState } from './state';

export function groupByStage(state: WorkingState): Step | undefined {
  const { query, table, grouped } = state.bound;
  if (!grouped) return undefined;
  const keys = query.groupBy;
  const notes: MessageRef[] = [];
  const groups: WorkingGroup[] = [];

  if (keys.length === 0) {
    // Aggregates without GROUP BY: the whole table is a single group, even when empty.
    groups.push({ id: 0, key: [], rows: [...state.rows], calcs: [], aggregateValues: new Map() });
    if (query.having) notes.push({ key: 'note.havingWithoutGroupBy' });
  } else {
    let caseFolded = false;
    for (const r of state.rows) {
      const key: Value[] = keys.map((k) => evalValue(k, { row: r.values }));
      const g = groups.find((x) => x.key.every((v, i) => sameGroupValue(v, key[i]!, keys[i]!.type ?? 'null')));
      if (g) {
        if (g.key.some((v, i) => typeof v === 'string' && v !== key[i])) caseFolded = true;
        g.rows.push(r);
      } else {
        groups.push({ id: groups.length, key, rows: [r], calcs: [], aggregateValues: new Map() });
      }
    }
    if (groups.some((g) => g.key.some((v) => v === null))) notes.push({ key: 'note.nullGroup' });
    if (caseFolded) notes.push({ key: 'note.caseInsensitive' });
    if (state.rows.length === 0) notes.push({ key: 'note.emptyGroupsNoRows' });
  }
  state.groups = groups;

  const columns: StepColumn[] = table.columns.map((c, i) => {
    const isKey = keys.some((k) => k.kind === 'column' && k.index === i);
    return isKey ? { name: c.name, type: c.type, highlight: 'groupKey' } : { name: c.name, type: c.type };
  });
  // Rows are listed group by group so each group is contiguous on screen.
  const rows: StepRow[] = groups.flatMap((g) =>
    g.rows.map((r) => ({ id: r.id, values: r.values, status: 'kept' as const, groupId: g.id })),
  );
  const keySql = keys.map((k) => exprSql(k));
  const outGroups: Group[] = groups.map((g) => ({ id: g.id, key: g.key, keySql, rowIds: g.rows.map((r) => r.id) }));

  // GROUP BY expressions that are not plain columns are shown as extra columns.
  const extra = keys.filter((k) => k.kind !== 'column');
  if (extra.length) {
    for (const k of extra) columns.push({ name: exprSql(k), type: displayType(k.type), unnamed: true, highlight: 'groupKey' });
    for (const row of rows) row.values = [...row.values, ...extra.map((k) => evalValue(k, { row: row.values }))];
  }

  return {
    stage: 'groupBy',
    clauseSql: keys.length ? clauseSql.groupBy(query) : undefined,
    columns,
    rows,
    groups: outGroups,
    explanation:
      keys.length === 0
        ? { key: 'step.groupBy.wholeTable', params: { count: state.rows.length } }
        : { key: 'step.groupBy.explanation', params: { columns: keySql.map((sql) => ({ sql })), count: groups.length } },
    notes,
    stats: { rowsIn: state.rows.length, rowsOut: state.rows.length },
  };
}
