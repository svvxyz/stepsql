import { describe, expect, it } from 'vitest';
import { runError } from './helpers';

describe('errors follow SQL Server criteria', () => {
  it('column not in GROUP BY (8120)', () => {
    const e = runError('SELECT Especie, Nombre, SUM(Edad) FROM Mascotas GROUP BY Especie');
    expect(e).toMatchObject({ code: 'COLUMN_NOT_IN_GROUP_BY', params: { column: 'Nombre', clause: 'SELECT' }, sqlServerError: 8120 });
    expect(e.location).toEqual({ start: 16, end: 22 });
  });

  it('SELECT * with GROUP BY (8120)', () => {
    expect(runError('SELECT * FROM Mascotas GROUP BY Especie').code).toBe('COLUMN_NOT_IN_GROUP_BY');
  });

  it('non-aggregated column next to an aggregate without GROUP BY (8120)', () => {
    expect(runError('SELECT Nombre, COUNT(*) FROM Mascotas').code).toBe('COLUMN_NOT_IN_GROUP_BY');
  });

  it('column in HAVING not grouped', () => {
    expect(runError('SELECT Especie FROM Mascotas GROUP BY Especie HAVING Edad > 1')).toMatchObject({
      code: 'COLUMN_NOT_IN_GROUP_BY',
      params: { column: 'Edad', clause: 'HAVING' },
    });
  });

  it('aggregate in WHERE (147)', () => {
    expect(runError('SELECT Especie FROM Mascotas WHERE SUM(Edad) > 5')).toMatchObject({
      code: 'AGGREGATE_IN_WHERE',
      params: { aggregate: { sql: 'SUM(Edad)' } },
      sqlServerError: 147,
    });
  });

  it('aggregate in GROUP BY (144) and nested aggregate (130)', () => {
    expect(runError('SELECT COUNT(*) FROM Mascotas GROUP BY SUM(Edad)').code).toBe('AGGREGATE_IN_GROUP_BY');
    expect(runError('SELECT SUM(COUNT(*)) FROM Mascotas').code).toBe('NESTED_AGGREGATE');
  });

  it('table not found (208) and column not found (207)', () => {
    expect(runError('SELECT * FROM Gatos')).toMatchObject({ code: 'TABLE_NOT_FOUND', params: { table: 'Gatos' }, sqlServerError: 208 });
    expect(runError('SELECT Color FROM Mascotas')).toMatchObject({ code: 'COLUMN_NOT_FOUND', params: { column: 'Color' }, sqlServerError: 207 });
  });

  it('alias used in WHERE (207)', () => {
    expect(runError('SELECT Edad * 2 AS Doble FROM Mascotas WHERE Doble > 10')).toMatchObject({
      code: 'ALIAS_NOT_ALLOWED',
      params: { alias: 'Doble', clause: 'WHERE' },
      sqlServerError: 207,
    });
  });

  it('wrong table qualifier (4104)', () => {
    expect(runError('SELECT x.Nombre FROM Mascotas AS m').code).toBe('INVALID_QUALIFIER');
  });

  it('syntax error reports the token and position', () => {
    const e = runError('SELECT Nombre, FROM Mascotas');
    expect(e.code).toBe('PARSE_ERROR');
    expect(e.params).toMatchObject({ near: 'FROM', line: 1 });
    expect(runError('SELEC * FROM Mascotas')).toMatchObject({ code: 'PARSE_ERROR', params: { near: 'SELEC' } });
  });

  it('empty query and other statements', () => {
    expect(runError('   ').code).toBe('EMPTY_QUERY');
    expect(runError('DELETE FROM Mascotas')).toMatchObject({ code: 'NOT_A_SELECT', params: { statement: 'DELETE' } });
  });

  it('unsupported V1 features', () => {
    expect(runError('SELECT * FROM Mascotas m JOIN Ventas v ON m.Nombre = v.Vendedor')).toMatchObject({ code: 'UNSUPPORTED_FEATURE', params: { feature: 'JOIN' } });
    expect(runError('SELECT * FROM Mascotas WHERE Edad IN (SELECT Unidades FROM Ventas)').params.feature).toBe('SUBQUERY');
    expect(runError('SELECT Especie FROM Mascotas GROUP BY ROLLUP(Especie)').params.feature).toBe('ROLLUP');
    expect(runError('SELECT UPPER(Nombre) FROM Mascotas').params.feature).toBe('UPPER()');
    expect(runError('SELECT Nombre FROM Mascotas ORDER BY Nombre OFFSET 2 ROWS FETCH NEXT 2 ROWS ONLY').params.feature).toBe('OFFSET ... FETCH');
  });

  it('type errors', () => {
    expect(runError('SELECT SUM(Nombre) FROM Mascotas')).toMatchObject({ code: 'AGGREGATE_TYPE_INVALID', params: { fn: 'SUM', type: 'varchar' }, sqlServerError: 8117 });
    expect(runError("SELECT * FROM Mascotas WHERE Edad = 'siete'")).toMatchObject({ code: 'CONVERSION_FAILED', params: { value: 'siete', type: 'int' }, sqlServerError: 245 });
    expect(runError('SELECT Edad / 0 FROM Mascotas').code).toBe('DIVIDE_BY_ZERO');
    expect(runError('SELECT * FROM Mascotas WHERE Edad').code).toBe('NON_BOOLEAN_CONDITION');
  });

  it('ORDER BY rules', () => {
    expect(runError('SELECT Nombre FROM Mascotas ORDER BY 3')).toMatchObject({ code: 'ORDER_BY_POSITION_OUT_OF_RANGE', sqlServerError: 108 });
    expect(runError('SELECT DISTINCT Especie FROM Mascotas ORDER BY Edad')).toMatchObject({ code: 'ORDER_BY_NOT_IN_SELECT_DISTINCT', sqlServerError: 145 });
  });

  it('invalid table data', () => {
    const t = { name: 'T', columns: [{ name: 'n', type: 'int' as const }], rows: [[1.5]] };
    expect(runError('SELECT * FROM T', [t])).toMatchObject({ code: 'INVALID_TABLE_DATA', params: { column: 'n', row: 1 } });
  });
});
