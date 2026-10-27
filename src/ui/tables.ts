// The list of tables the user works with, as shown in the tables panel.

import type { MessageRef, Table } from '../engine';
import { fromTable, newId, toEngineTable, type EditableTable } from './tableModel';

export interface TableEntry {
  /** Stable id: survives renames and language changes, so an open editor stays on its table. */
  id: number;
  table: EditableTable;
  /** Created from the sample data. */
  fromSample: boolean;
  /** Still the untouched sample: it follows the interface language. */
  isSample: boolean;
}

export const sampleEntry = (sample: Table): TableEntry => ({ id: newId(), table: fromTable(sample), fromSample: true, isSample: true });

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function uniqueTableName(entries: TableEntry[], base: string): string {
  if (!entries.some((e) => sameName(e.table.name, base))) return base;
  let n = 2;
  while (entries.some((e) => sameName(e.table.name, `${base}${n}`))) n++;
  return `${base}${n}`;
}

export function emptyEntry(entries: TableEntry[], baseName: string): TableEntry {
  return {
    id: newId(),
    table: { name: uniqueTableName(entries, baseName), columns: [{ id: newId(), name: 'Id', type: 'int' }], rows: [] },
    fromSample: false,
    isSample: false,
  };
}

/** Problems of one table, including a name already taken by another table. */
export function entryProblems(entry: TableEntry, entries: TableEntry[]): MessageRef[] {
  const { problems } = toEngineTable(entry.table);
  const name = entry.table.name.trim();
  if (name && entries.some((e) => e.id !== entry.id && sameName(e.table.name, name))) {
    problems.unshift({ key: 'table.problems.duplicateTable', params: { name } });
  }
  return problems;
}

export const isUsedBy = (entry: TableEntry, tableNames: string[]) => tableNames.some((n) => sameName(n, entry.table.name));
