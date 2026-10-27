// Editable table as typed by the user (raw strings) and its conversion to
// the engine's typed Table. An empty cell means NULL.

import type { ColumnType, MessageRef, Table, Value } from '../engine';

export interface EditableColumn {
  id: number;
  name: string;
  type: ColumnType;
}

export interface EditableRow {
  id: number;
  cells: string[];
}

export interface EditableTable {
  name: string;
  columns: EditableColumn[];
  rows: EditableRow[];
}

let nextId = 1;
export const newId = () => nextId++;

export function fromTable(t: Table): EditableTable {
  return {
    name: t.name,
    columns: t.columns.map((c) => ({ id: newId(), name: c.name, type: c.type })),
    rows: t.rows.map((r) => ({ id: newId(), cells: r.map((v) => (v === null ? '' : String(v))) })),
  };
}

function parseCell(raw: string, type: ColumnType): { ok: true; value: Value } | { ok: false } {
  const s = raw.trim();
  if (s === '' || s.toUpperCase() === 'NULL') return { ok: true, value: null };
  switch (type) {
    case 'text':
      return { ok: true, value: raw };
    case 'int':
      return /^[+-]?\d+$/.test(s) ? { ok: true, value: Number(s) } : { ok: false };
    case 'decimal': {
      const normalized = s.replace(',', '.');
      return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(normalized) ? { ok: true, value: Number(normalized) } : { ok: false };
    }
    case 'date': {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
      if (!m) return { ok: false };
      const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
      return d.getUTCDate() === Number(m[3]) && d.getUTCMonth() === Number(m[2]) - 1 ? { ok: true, value: s } : { ok: false };
    }
  }
}

export function isCellValid(raw: string, type: ColumnType): boolean {
  return parseCell(raw, type).ok;
}

export function toEngineTable(t: EditableTable): { table: Table; problems: MessageRef[] } {
  const problems: MessageRef[] = [];
  if (!t.name.trim()) problems.push({ key: 'table.problems.emptyTableName' });
  t.columns.forEach((c, i) => {
    if (!c.name.trim()) problems.push({ key: 'table.problems.emptyColumnName', params: { position: i + 1 } });
    else if (t.columns.findIndex((o) => o.name.trim().toLowerCase() === c.name.trim().toLowerCase()) !== i) {
      problems.push({ key: 'table.problems.duplicateColumn', params: { column: c.name.trim() } });
    }
  });
  const rows: Value[][] = t.rows.map((r, ri) =>
    t.columns.map((c, ci) => {
      const parsed = parseCell(r.cells[ci] ?? '', c.type);
      if (parsed.ok) return parsed.value;
      problems.push({ key: 'table.problems.invalidCell', params: { row: ri + 1, column: c.name, value: r.cells[ci] ?? '', type: c.type } });
      return null;
    }),
  );
  return {
    table: { name: t.name.trim(), columns: t.columns.map((c) => ({ name: c.name.trim(), type: c.type })), rows },
    problems,
  };
}
