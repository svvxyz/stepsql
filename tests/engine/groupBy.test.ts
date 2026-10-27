import { describe, expect, it } from 'vitest';
import { pets, result, run, stages, step } from './helpers';

describe('acceptance: pets example', () => {
  it('Spanish query: Perro = 16, Gato = 3 with the expected stages', () => {
    const steps = run('SELECT Especie, SUM(Edad) AS EdadTotal FROM Mascotas GROUP BY Especie');
    expect(stages(steps)).toEqual(['from', 'groupBy', 'aggregate', 'select', 'result']);
    expect(result(steps)).toEqual([
      ['Perro', 16],
      ['Gato', 3],
    ]);
    expect(steps.at(-1)!.columns.map((c) => c.name)).toEqual(['Especie', 'EdadTotal']);
  });

  it('English query works the same', () => {
    const steps = run('SELECT Species, SUM(Age) AS TotalAge FROM Pets GROUP BY Species', [pets]);
    expect(result(steps)).toEqual([
      ['Dog', 16],
      ['Cat', 3],
    ]);
  });

  it('groupBy step colors rows by group and lists the groups', () => {
    const g = step(run('SELECT Especie, SUM(Edad) AS EdadTotal FROM Mascotas GROUP BY Especie'), 'groupBy');
    expect(g.groups!.map((x) => x.key)).toEqual([['Perro'], ['Gato']]);
    expect(g.rows.map((r) => r.groupId)).toEqual([0, 0, 1]);
    expect(g.columns[0]!.highlight).toBe('groupKey');
    expect(g.explanation).toEqual({
      key: 'step.groupBy.explanation',
      params: { columns: [{ sql: 'Especie' }], count: 2 },
    });
  });

  it('aggregate step exposes the calculation per group', () => {
    const a = step(run('SELECT Especie, SUM(Edad) AS EdadTotal FROM Mascotas GROUP BY Especie'), 'aggregate');
    const perro = a.groups![0]!.aggregates![0]!;
    expect(perro).toMatchObject({ sql: 'SUM(Edad)', fn: 'SUM', inputs: [7, 9], result: 16, ignoredNulls: 0 });
    expect(a.rows).toEqual([
      { id: 0, values: ['Perro', 16], status: 'new', groupId: 0, sourceRowIds: [0, 1] },
      { id: 1, values: ['Gato', 3], status: 'new', groupId: 1, sourceRowIds: [2] },
    ]);
  });
});

describe('aggregates', () => {
  it('COUNT(*), COUNT(col), AVG with integer truncation, MIN, MAX', () => {
    const steps = run('SELECT COUNT(*) AS n, AVG(Edad) AS prom, MIN(Nombre) AS primero, MAX(Edad) AS mayor FROM Mascotas');
    expect(stages(steps)).toEqual(['from', 'groupBy', 'aggregate', 'select', 'result']);
    // (7 + 9 + 3) / 3 = 6.33 -> 6 in SQL Server for int
    expect(result(steps)).toEqual([[3, 6, 'Bigotes', 9]]);
    const notes = step(steps, 'aggregate').notes.map((n) => n.key);
    expect(notes).toContain('note.aggregateWithoutGroupBy');
    expect(notes).toContain('note.avgInt');
  });

  it('aggregates without GROUP BY return one row even for an empty table', () => {
    const steps = run('SELECT COUNT(*) AS n, SUM(Edad) AS s FROM Mascotas WHERE Edad > 100');
    expect(result(steps)).toEqual([[0, null]]);
  });

  it('GROUP BY over no rows returns no groups', () => {
    const steps = run('SELECT Especie, COUNT(*) FROM Mascotas WHERE Edad > 100 GROUP BY Especie');
    expect(result(steps)).toEqual([]);
    expect(step(steps, 'groupBy').notes.map((n) => n.key)).toContain('note.emptyGroupsNoRows');
  });

  it('COUNT(DISTINCT col)', () => {
    expect(result(run('SELECT COUNT(DISTINCT Especie) FROM Mascotas'))).toEqual([[2]]);
  });

  it('several grouping columns', () => {
    const steps = run('SELECT Region, Vendedor, COUNT(*) AS n FROM Ventas GROUP BY Region, Vendedor ORDER BY Region, Vendedor');
    expect(result(steps)).toEqual([
      [null, 'Eva', 1],
      ['Este', 'Luis', 1],
      ['Norte', 'Ana', 1],
      ['Norte', 'Luis', 1],
      ['Sur', 'Ana', 1],
      ['Sur', 'Eva', 1],
    ]);
  });

  it('groups compare text case-insensitively', () => {
    const t = {
      name: 'T',
      columns: [{ name: 'c', type: 'text' as const }],
      rows: [['perro'], ['Perro'], ['PERRO'], ['gato']],
    };
    const steps = run('SELECT c, COUNT(*) FROM T GROUP BY c', [t]);
    expect(result(steps)).toEqual([
      ['perro', 3],
      ['gato', 1],
    ]);
    expect(step(steps, 'groupBy').notes.map((n) => n.key)).toContain('note.caseInsensitive');
  });

  it('expression in SELECT that matches the GROUP BY expression', () => {
    const steps = run('SELECT Edad / 5, COUNT(*) FROM Mascotas GROUP BY Edad / 5');
    expect(result(steps)).toEqual([
      [1, 2],
      [0, 1],
    ]);
  });

  it('T-SQL alias-first syntax (Total = SUM(x))', () => {
    const steps = run('SELECT Especie, Total = SUM(Edad) FROM Mascotas GROUP BY Especie');
    expect(steps.at(-1)!.columns.map((c) => c.name)).toEqual(['Especie', 'Total']);
  });
});
