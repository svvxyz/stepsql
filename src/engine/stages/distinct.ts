import { sameGroupValue } from '../eval/values';
import type { MessageRef, Step, StepRow } from '../types';
import { outputColumns } from './select';
import type { ProjectedRow, WorkingState } from './state';

export function distinctStage(state: WorkingState): Step | undefined {
  const { query, outputs } = state.bound;
  if (!query.distinct || !state.projected) return undefined;

  const kept: ProjectedRow[] = [];
  const rows: StepRow[] = [];
  let nullDuplicate = false;
  for (const p of state.projected) {
    const firstIdx = kept.findIndex((k) => k.values.every((v, i) => sameGroupValue(v, p.values[i]!, outputs[i]!.type)));
    if (firstIdx === -1) {
      kept.push(p);
      rows.push({ id: p.id, values: p.values, status: 'kept' });
    } else {
      if (p.values.some((v) => v === null)) nullDuplicate = true;
      const firstRowNumber = rows.findIndex((r) => r.id === kept[firstIdx]!.id) + 1;
      rows.push({ id: p.id, values: p.values, status: 'discarded', reason: { key: 'reason.distinct.duplicate', params: { row: firstRowNumber } } });
    }
  }

  const total = state.projected.length;
  state.projected = kept;
  const notes: MessageRef[] = nullDuplicate ? [{ key: 'note.distinctNulls' }] : [];
  return {
    stage: 'distinct',
    clauseSql: 'DISTINCT',
    columns: outputColumns(state),
    rows,
    explanation: { key: 'step.distinct.explanation', params: { count: total, kept: kept.length, discarded: total - kept.length } },
    notes,
    stats: { rowsIn: total, rowsOut: kept.length },
  };
}
