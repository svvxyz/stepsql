import { describe, expect, it } from 'vitest';
import { result, run, step } from './helpers';

describe('NULL handling', () => {
  it('aggregates ignore NULL, COUNT(*) does not', () => {
    const steps = run('SELECT COUNT(*) AS filas, COUNT(Monto) AS conMonto, SUM(Monto) AS total, AVG(Unidades) AS prom FROM Ventas');
    // Montos: 100.5, 200, 50.25, 300, 10 (one NULL) ; Unidades: 2,5,1,4,1 (one NULL) -> 13/5 = 2
    expect(result(steps)).toEqual([[6, 5, 660.75, 2]]);
    const notes = step(steps, 'aggregate').notes;
    expect(notes).toContainEqual({ key: 'note.nullsIgnored', params: { aggregate: { sql: 'COUNT(Monto)' }, count: 1 } });
    expect(notes).toContainEqual({ key: 'note.nullsIgnored', params: { aggregate: { sql: 'SUM(Monto)' }, count: 1 } });
  });

  it('SUM of only NULLs is NULL, COUNT is 0', () => {
    const steps = run("SELECT SUM(Monto) AS s, COUNT(Monto) AS c FROM Ventas WHERE Vendedor = 'Ana' AND Region = 'Sur'");
    expect(result(steps)).toEqual([[null, 0]]);
  });

  it('comparison with NULL is UNKNOWN and discards the row', () => {
    const w = step(run('SELECT Vendedor FROM Ventas WHERE Monto > 60'), 'where');
    const sur = w.rows[2]!;
    expect(sur.status).toBe('discarded');
    expect(sur.reason).toEqual({
      key: 'reason.where.unknown',
      params: { condition: { sql: 'Monto > 60' }, evaluated: { sql: 'NULL > 60' } },
    });
    expect(w.notes.map((n) => n.key)).toContain('note.unknownIsDiscarded');
    const eva = w.rows[3]!;
    expect(eva.reason).toEqual({
      key: 'reason.where.false',
      params: { condition: { sql: 'Monto > 60' }, evaluated: { sql: '50.25 > 60' } },
    });
  });

  it('= NULL never matches, IS NULL does', () => {
    expect(result(run('SELECT Vendedor FROM Ventas WHERE Region = NULL'))).toEqual([]);
    expect(result(run('SELECT Vendedor FROM Ventas WHERE Region IS NULL'))).toEqual([['Eva']]);
    expect(result(run('SELECT COUNT(*) FROM Ventas WHERE Region IS NOT NULL'))).toEqual([[5]]);
  });

  it('NOT IN with a NULL in the list returns nothing', () => {
    expect(result(run('SELECT Vendedor FROM Ventas WHERE Unidades NOT IN (1, NULL)'))).toEqual([]);
  });

  it('NULL keys form their own group and sort first', () => {
    const steps = run('SELECT Region, COUNT(*) AS n FROM Ventas GROUP BY Region ORDER BY Region');
    expect(result(steps)).toEqual([
      [null, 1],
      ['Este', 1],
      ['Norte', 2],
      ['Sur', 2],
    ]);
    expect(step(steps, 'groupBy').notes.map((n) => n.key)).toContain('note.nullGroup');
    expect(step(steps, 'orderBy').notes.map((n) => n.key)).toContain('note.nullsSortFirst');
  });

  it('arithmetic with NULL is NULL', () => {
    expect(result(run("SELECT Monto * 2 FROM Ventas WHERE Vendedor = 'Ana' ORDER BY Fecha"))).toEqual([[201], [null]]);
  });

  it('DISTINCT treats NULLs as equal', () => {
    const t = { name: 'T', columns: [{ name: 'c', type: 'int' as const }], rows: [[null], [1], [null]] };
    const steps = run('SELECT DISTINCT c FROM T', [t]);
    expect(result(steps)).toEqual([[null], [1]]);
    expect(step(steps, 'distinct').notes.map((n) => n.key)).toContain('note.distinctNulls');
  });
});
