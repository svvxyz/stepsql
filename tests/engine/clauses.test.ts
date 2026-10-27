import { describe, expect, it } from 'vitest';
import { result, run, stages, step } from './helpers';

describe('logical order', () => {
  it('WHERE + GROUP BY + HAVING + ORDER BY + TOP run in logical order', () => {
    const steps = run(
      'SELECT TOP 2 Region, SUM(Monto) AS Total FROM Ventas WHERE Fecha >= \'2024-01-01\' GROUP BY Region HAVING COUNT(*) >= 1 ORDER BY Total DESC',
    );
    expect(stages(steps)).toEqual(['from', 'where', 'groupBy', 'aggregate', 'having', 'select', 'orderBy', 'top', 'result']);
    expect(result(steps)).toEqual([
      ['Norte', 300.5],
      ['Este', 300],
    ]);
  });

  it('HAVING discards groups with a reason', () => {
    const steps = run('SELECT Especie, COUNT(*) AS n FROM Mascotas GROUP BY Especie HAVING COUNT(*) > 1');
    const h = step(steps, 'having');
    expect(h.rows.map((r) => r.status)).toEqual(['kept', 'discarded']);
    expect(h.rows[1]!.reason).toEqual({
      key: 'reason.having.false',
      params: { condition: { sql: 'COUNT(*) > 1' }, evaluated: { sql: '1 > 1' } },
    });
    expect(h.explanation.params).toMatchObject({ kept: 1, discarded: 1, count: 2 });
    expect(result(steps)).toEqual([['Perro', 2]]);
  });

  it('HAVING without GROUP BY treats the table as one group', () => {
    const steps = run('SELECT COUNT(*) FROM Mascotas HAVING COUNT(*) > 5');
    expect(result(steps)).toEqual([]);
    expect(step(steps, 'groupBy').notes.map((n) => n.key)).toContain('note.havingWithoutGroupBy');
  });
});

describe('WHERE', () => {
  it('reports the failing part of an AND chain', () => {
    const w = step(run("SELECT * FROM Mascotas WHERE Especie = 'Perro' AND Edad > 8"), 'where');
    expect(w.rows.map((r) => r.status)).toEqual(['discarded', 'kept', 'discarded']);
    expect(w.rows[0]!.reason!.params).toEqual({ condition: { sql: 'Edad > 8' }, evaluated: { sql: '7 > 8' } });
    expect(w.rows[2]!.reason!.params).toEqual({ condition: { sql: "Especie = 'Perro'" }, evaluated: { sql: "'Gato' = 'Perro'" } });
  });

  it('IN, BETWEEN, LIKE, NOT and OR', () => {
    expect(result(run("SELECT Nombre FROM Mascotas WHERE Nombre IN ('Mora', 'Bigotes')"))).toEqual([['Mora'], ['Bigotes']]);
    expect(result(run('SELECT Nombre FROM Mascotas WHERE Edad BETWEEN 3 AND 7'))).toEqual([['Mora'], ['Bigotes']]);
    expect(result(run('SELECT Nombre FROM Mascotas WHERE Edad NOT BETWEEN 3 AND 7'))).toEqual([['Dasha']]);
    expect(result(run("SELECT Nombre FROM Mascotas WHERE Nombre LIKE '%a'"))).toEqual([['Mora'], ['Dasha']]);
    expect(result(run("SELECT Nombre FROM Mascotas WHERE Nombre LIKE '[BD]%'"))).toEqual([['Dasha'], ['Bigotes']]);
    expect(result(run("SELECT Nombre FROM Mascotas WHERE Nombre LIKE '_o%'"))).toEqual([['Mora']]);
    expect(result(run("SELECT Nombre FROM Mascotas WHERE NOT (Especie = 'Perro')"))).toEqual([['Bigotes']]);
    expect(result(run("SELECT Nombre FROM Mascotas WHERE Edad < 4 OR Nombre = 'mora'"))).toEqual([['Mora'], ['Bigotes']]);
  });

  it('string comparison is case-insensitive and ignores trailing spaces', () => {
    expect(result(run("SELECT Nombre FROM Mascotas WHERE Especie = 'PERRO  '"))).toEqual([['Mora'], ['Dasha']]);
  });

  it('compares dates and converts string literals', () => {
    expect(result(run("SELECT Vendedor FROM Ventas WHERE Fecha BETWEEN '2024-01-01' AND '2024-01-31'"))).toEqual([['Ana'], ['Ana']]);
  });

  it('brackets, aliases and schema prefix', () => {
    expect(result(run('SELECT m.[Nombre] AS [Nombre del animal] FROM dbo.[Mascotas] AS m WHERE m.Edad = 3'))).toEqual([['Bigotes']]);
  });
});

describe('SELECT, DISTINCT, ORDER BY, TOP', () => {
  it('arithmetic expressions and integer division', () => {
    const steps = run('SELECT Nombre, Edad * 2 AS Doble, Edad / 2 AS Mitad, Edad % 2 AS Resto, Edad / 2.0 AS MitadExacta FROM Mascotas');
    expect(result(steps)).toEqual([
      ['Mora', 14, 3, 1, 3.5],
      ['Dasha', 18, 4, 1, 4.5],
      ['Bigotes', 6, 1, 1, 1.5],
    ]);
    expect(step(steps, 'select').notes).toContainEqual({ key: 'note.intDivision', params: { column: 'Mitad' } });
  });

  it('unnamed computed columns are flagged like SQL Server "(No column name)"', () => {
    const cols = run('SELECT Edad + 1 FROM Mascotas').at(-1)!.columns;
    expect(cols[0]).toEqual({ name: 'Edad + 1', type: 'int', unnamed: true });
  });

  it('string concatenation with +', () => {
    expect(result(run("SELECT Nombre + ' (' + Especie + ')' AS x FROM Mascotas WHERE Edad = 3"))).toEqual([['Bigotes (Gato)']]);
  });

  it('DISTINCT marks duplicates', () => {
    const steps = run('SELECT DISTINCT Especie FROM Mascotas');
    const d = step(steps, 'distinct');
    expect(d.rows.map((r) => r.status)).toEqual(['kept', 'discarded', 'kept']);
    expect(d.rows[1]!.reason).toEqual({ key: 'reason.distinct.duplicate', params: { row: 1 } });
    expect(result(steps)).toEqual([['Perro'], ['Gato']]);
  });

  it('ORDER BY several columns, alias, position and hidden column', () => {
    expect(result(run('SELECT Nombre FROM Mascotas ORDER BY Especie, Edad DESC'))).toEqual([['Bigotes'], ['Dasha'], ['Mora']]);
    expect(result(run('SELECT Nombre, Edad * 2 AS d FROM Mascotas ORDER BY d'))).toEqual([['Bigotes', 6], ['Mora', 14], ['Dasha', 18]]);
    expect(result(run('SELECT Nombre, Edad FROM Mascotas ORDER BY 2 DESC'))).toEqual([['Dasha', 9], ['Mora', 7], ['Bigotes', 3]]);
    const o = step(run('SELECT Nombre FROM Mascotas ORDER BY Edad'), 'orderBy');
    expect(o.notes).toContainEqual({ key: 'note.orderByHiddenColumn', params: { column: 'Edad' } });
    expect(o.sort).toEqual([{ sql: 'Edad', dir: 'ASC' }]);
  });

  it('ORDER BY an aggregate', () => {
    expect(result(run('SELECT Especie FROM Mascotas GROUP BY Especie ORDER BY SUM(Edad)'))).toEqual([['Gato'], ['Perro']]);
  });

  it('TOP n, TOP (n), TOP n PERCENT', () => {
    const steps = run('SELECT TOP 2 Nombre FROM Mascotas ORDER BY Edad DESC');
    expect(result(steps)).toEqual([['Dasha'], ['Mora']]);
    const t = step(steps, 'top');
    expect(t.rows[2]).toMatchObject({ status: 'discarded', reason: { key: 'reason.top.beyond', params: { n: 2 } } });
    expect(t.notes).toEqual([]);
    expect(result(run('SELECT TOP (1) Nombre FROM Mascotas'))).toEqual([['Mora']]);
    expect(step(run('SELECT TOP (1) Nombre FROM Mascotas'), 'top').notes.map((n) => n.key)).toEqual(['note.topWithoutOrder']);
    expect(result(run('SELECT TOP 50 PERCENT Nombre FROM Mascotas ORDER BY Nombre'))).toEqual([['Bigotes'], ['Dasha']]);
  });

  it('SELECT * and comments', () => {
    const steps = run('-- todas\nSELECT * /* columnas */ FROM Mascotas;');
    expect(step(steps, 'select').explanation.key).toBe('step.select.star');
    expect(result(steps)).toHaveLength(3);
  });
});
