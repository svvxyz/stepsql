// Small helpers shared by the step views.

import type { ColumnType, RowLineage, Step } from '../engine';

const unbracket = (s: string) => s.replace(/^\[(.*)\]$/, '$1').toLowerCase();

/** Types of the GROUP BY key values, looked up among the step's columns. */
export function groupKeyTypes(step: Step): ColumnType[] {
  return (step.groups?.[0]?.keySql ?? []).map((sql) => step.columns.find((c) => c.name.toLowerCase() === unbracket(sql))?.type ?? 'text');
}

const EMPTY: RowLineage = { key: '', parents: [], origin: [] };

export const lineageAt = (step: Step, index: number): RowLineage => step.lineage?.[index] ?? { ...EMPTY, key: `${step.stage}:${index}` };
