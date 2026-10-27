import { clauseSql } from '../describe/sqlText';
import type { MessageRef, Step, StepRow } from '../types';
import { outputColumns } from './select';
import type { WorkingState } from './state';

export function topStage(state: WorkingState): Step | undefined {
  const { query } = state.bound;
  if (!query.top || !state.projected) return undefined;

  const total = state.projected.length;
  // TOP n PERCENT rounds up, as SQL Server does.
  const n = query.top.percent ? Math.ceil((query.top.n * total) / 100) : query.top.n;
  const rows: StepRow[] = state.projected.map((p, i) =>
    i < n
      ? { id: p.id, values: p.values, status: 'kept' }
      : { id: p.id, values: p.values, status: 'discarded', reason: { key: 'reason.top.beyond', params: { n } } },
  );
  state.projected = state.projected.slice(0, n);
  const kept = state.projected.length;

  const notes: MessageRef[] = query.orderBy.length === 0 ? [{ key: 'note.topWithoutOrder' }] : [];
  return {
    stage: 'top',
    clauseSql: clauseSql.top(query),
    columns: outputColumns(state),
    rows,
    explanation: query.top.percent
      ? { key: 'step.top.percent', params: { percent: query.top.n, n, count: total, kept, discarded: total - kept } }
      : { key: 'step.top.explanation', params: { n, count: total, kept, discarded: total - kept } },
    notes,
    stats: { rowsIn: total, rowsOut: kept },
  };
}
