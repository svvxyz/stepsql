import { describe, expect, it } from 'vitest';
import type { Step } from '../../src/engine';
import { run, step } from './helpers';

// helpers' Mascotas: 0 Perro Mora 7 · 1 Perro Dasha 9 · 2 Gato Bigotes 3
const keys = (s: Step) => s.lineage!.map((l) => l.key);
const M = (i: number) => `Mascotas#${i}`;

describe('row identity', () => {
  it('every step has one lineage entry per row and unique keys', () => {
    const steps = run('SELECT DISTINCT TOP 5 Especie, COUNT(*) AS n FROM Mascotas WHERE Edad > 1 GROUP BY Especie HAVING COUNT(*) >= 1 ORDER BY n DESC');
    for (const s of steps) {
      expect(s.lineage, s.stage).toHaveLength(s.rows.length);
      expect(new Set(keys(s)).size, s.stage).toBe(s.rows.length);
    }
  });

  it('an ungrouped row keeps its key from FROM to the result', () => {
    const steps = run('SELECT TOP 1 Nombre FROM Mascotas WHERE Edad > 5 ORDER BY Edad DESC');
    expect(keys(step(steps, 'from'))).toEqual([M(0), M(1), M(2)]);
    expect(keys(step(steps, 'where'))).toEqual([M(0), M(1), M(2)]);
    expect(keys(step(steps, 'orderBy'))).toEqual([M(1), M(0)]);
    expect(keys(step(steps, 'top'))).toEqual([M(1), M(0)]);
    const result = step(steps, 'result').lineage!;
    expect(result).toEqual([{ key: M(1), parents: [M(1)], origin: [M(1)] }]);
  });

  it('FROM rows have no parents; later rows point at the previous step', () => {
    const steps = run('SELECT Nombre FROM Mascotas WHERE Edad > 5');
    expect(step(steps, 'from').lineage!.every((l) => l.parents.length === 0)).toBe(true);
    expect(step(steps, 'select').lineage!.map((l) => l.parents)).toEqual([[M(0)], [M(1)]]);
  });
});

describe('lineage through grouping', () => {
  const steps = run('SELECT Especie, SUM(Edad) AS EdadTotal FROM Mascotas GROUP BY Especie HAVING SUM(Edad) > 5 ORDER BY EdadTotal');

  it('GROUP BY rows are still source rows', () => {
    expect(keys(step(steps, 'groupBy'))).toEqual([M(0), M(1), M(2)]);
  });

  it('each aggregate row is a group whose parents are its rows', () => {
    const agg = step(steps, 'aggregate').lineage!;
    expect(agg).toEqual([
      { key: 'g:0', parents: [M(0), M(1)], origin: [M(0), M(1)] },
      { key: 'g:1', parents: [M(2)], origin: [M(2)] },
    ]);
  });

  it('origin survives HAVING, SELECT and ORDER BY', () => {
    const having = step(steps, 'having').lineage!;
    expect(having.map((l) => l.parents)).toEqual([['g:0'], ['g:1']]);
    const ordered = step(steps, 'orderBy').lineage!;
    expect(ordered).toEqual([{ key: 'g:0', parents: ['g:0'], origin: [M(0), M(1)], sortKeys: [16] }]);
    expect(step(steps, 'result').lineage![0]!.origin).toEqual([M(0), M(1)]);
  });

  it('aggregates without GROUP BY form one group with every row', () => {
    const s = run('SELECT COUNT(*) FROM Mascotas WHERE Edad < 8');
    expect(step(s, 'aggregate').lineage).toEqual([{ key: 'g:0', parents: [M(0), M(2)], origin: [M(0), M(2)] }]);
  });
});

describe('decisive cells', () => {
  it('WHERE marks the columns of the part that failed', () => {
    const w = step(run("SELECT * FROM Mascotas WHERE Edad > 5 AND Especie = 'Perro'"), 'where');
    // Mora and Dasha pass; Bigotes fails on Edad > 5 (column 2)
    expect(w.lineage!.map((l) => l.decisive)).toEqual([undefined, undefined, [2]]);
  });

  it('HAVING marks the aggregate column that failed', () => {
    const h = step(run('SELECT Especie, COUNT(*) AS n FROM Mascotas GROUP BY Especie HAVING COUNT(*) > 1'), 'having');
    // group table columns: Especie, COUNT(*)
    expect(h.lineage!.map((l) => l.decisive)).toEqual([undefined, [1]]);
  });
});

describe('DISTINCT', () => {
  it('a duplicate merges into the earlier row, which then carries both origins', () => {
    const steps = run('SELECT DISTINCT Especie FROM Mascotas');
    const d = step(steps, 'distinct').lineage!;
    expect(d[1]!.mergedInto).toBe(M(0));
    expect(d[0]!.origin).toEqual([M(0), M(1)]);
    expect(step(steps, 'result').lineage!.map((l) => l.origin)).toEqual([[M(0), M(1)], [M(2)]]);
  });
});

describe('column lineage', () => {
  it('SELECT tells where each column comes from, which are computed and which are dropped', () => {
    const s = step(run('SELECT Nombre AS Mascota, Edad * 2 AS Doble FROM Mascotas'), 'select');
    expect(s.columnLineage).toEqual([
      { source: 1, exprSql: 'Nombre' },
      { source: null, exprSql: 'Edad * 2' },
    ]);
    expect(s.droppedColumns!.map((c) => c.name)).toEqual(['Especie', 'Edad']);
  });

  it('an aggregate alias points at the aggregate column of the previous step', () => {
    const s = step(run('SELECT Especie, SUM(Edad) AS EdadTotal FROM Mascotas GROUP BY Especie'), 'select');
    expect(s.columnLineage).toEqual([
      { source: 0, exprSql: 'Especie' },
      { source: 1, exprSql: 'SUM(Edad)' },
    ]);
    expect(s.droppedColumns).toEqual([]);
  });
});

describe('what the animations replay', () => {
  it('WHERE gives every row its evaluated condition and result', () => {
    const w = step(run("SELECT * FROM Mascotas WHERE Edad > 5 AND Especie = 'Perro'"), 'where');
    expect(w.lineage!.map((l) => l.test)).toEqual([
      { sql: "7 > 5 AND 'Perro' = 'Perro'", result: true, columns: [0, 2] },
      { sql: "9 > 5 AND 'Perro' = 'Perro'", result: true, columns: [0, 2] },
      { sql: '3 > 5', result: false, columns: [2] },
    ]);
  });

  it('a comparison with NULL is evaluated as UNKNOWN', () => {
    const w = step(run('SELECT * FROM Mascotas WHERE Edad > NULL'), 'where');
    expect(w.lineage![0]!.test).toEqual({ sql: '7 > NULL', result: null, columns: [2] });
  });

  it('HAVING evaluates each group with its aggregates', () => {
    const h = step(run('SELECT Especie, COUNT(*) AS n FROM Mascotas GROUP BY Especie HAVING COUNT(*) > 1'), 'having');
    expect(h.lineage!.map((l) => l.test)).toEqual([
      { sql: '2 > 1', result: true, columns: [1] },
      { sql: '1 > 1', result: false, columns: [1] },
    ]);
  });

  it('SELECT spells out each computed cell', () => {
    const s = step(run('SELECT Nombre, Edad * 2 AS Doble FROM Mascotas'), 'select');
    expect(s.lineage!.map((l) => l.cells)).toEqual([
      [null, '7 * 2'],
      [null, '9 * 2'],
      [null, '3 * 2'],
    ]);
    const g = step(run('SELECT Especie, SUM(Edad) AS s, SUM(Edad) * 2 AS d FROM Mascotas GROUP BY Especie'), 'select');
    expect(g.lineage![0]!.cells).toEqual([null, null, '16 * 2']);
  });
});

describe('ORDER BY keys', () => {
  it('each row carries the values it is sorted by, even for a column not in the SELECT', () => {
    const o = step(run('SELECT Nombre FROM Mascotas ORDER BY Edad DESC, Nombre'), 'orderBy');
    expect(o.lineage!.map((l) => l.sortKeys)).toEqual([
      [9, 'Dasha'],
      [7, 'Mora'],
      [3, 'Bigotes'],
    ]);
  });
});
