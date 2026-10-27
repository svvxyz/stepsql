import { describe, expect, it } from 'vitest';
import { queryOutline, type OutlineStage } from '../../src/engine';

/** Text of each range of a stage, to keep the expectations readable. */
function texts(sql: string, stage: OutlineStage): string[] {
  return (queryOutline(sql).clauses[stage] ?? []).map((r) => sql.slice(r.start, r.end));
}

describe('query outline', () => {
  const sql = `SELECT TOP 3 Especie, SUM(Edad) AS Total
FROM dbo.Mascotas
WHERE Edad > 2
GROUP BY Especie
HAVING COUNT(*) > 1
ORDER BY Total DESC`;

  it('finds every clause of a full query', () => {
    expect(texts(sql, 'select')).toEqual(['SELECT', 'Especie, SUM(Edad) AS Total']);
    expect(texts(sql, 'top')).toEqual(['TOP 3']);
    expect(texts(sql, 'from')).toEqual(['FROM dbo.Mascotas']);
    expect(texts(sql, 'where')).toEqual(['WHERE Edad > 2']);
    expect(texts(sql, 'groupBy')).toEqual(['GROUP BY Especie']);
    expect(texts(sql, 'having')).toEqual(['HAVING COUNT(*) > 1']);
    expect(texts(sql, 'orderBy')).toEqual(['ORDER BY Total DESC']);
    expect(texts(sql, 'aggregate')).toEqual(['SUM(Edad)', 'COUNT(*)']);
    expect(texts(sql, 'result')).toEqual([sql]);
    expect(texts(sql, 'distinct')).toEqual([]);
    expect(queryOutline(sql).tables).toEqual(['Mascotas']);
  });

  it('separates DISTINCT and TOP (n) PERCENT from the select list', () => {
    const q = 'SELECT DISTINCT TOP (10) PERCENT Raza FROM [Mis Mascotas]';
    expect(texts(q, 'distinct')).toEqual(['DISTINCT']);
    expect(texts(q, 'top')).toEqual(['TOP (10) PERCENT']);
    expect(texts(q, 'select')).toEqual(['SELECT', 'Raza']);
    expect(queryOutline(q).tables).toEqual(['Mis Mascotas']);
  });

  it('ignores keywords inside strings, comments, brackets and subqueries', () => {
    const q = `SELECT Nombre -- WHERE in a comment
FROM Mascotas /* GROUP BY /* nested */ ORDER BY */
WHERE Nombre = 'FROM x WHERE' AND [Order By] IN (SELECT 1 FROM Otra WHERE 1 = 1)`;
    expect(texts(q, 'from')).toEqual(['FROM Mascotas']);
    expect(texts(q, 'where')).toEqual(["WHERE Nombre = 'FROM x WHERE' AND [Order By] IN (SELECT 1 FROM Otra WHERE 1 = 1)"]);
    expect(texts(q, 'groupBy')).toEqual([]);
    expect(texts(q, 'orderBy')).toEqual([]);
    expect(queryOutline(q).tables).toEqual(['Mascotas']);
  });

  it('marks JOIN clauses and their tables', () => {
    const q = 'SELECT * FROM Mascotas m INNER JOIN Duenos d ON m.Id = d.Id WHERE d.Id > 1';
    expect(texts(q, 'from')).toEqual(['FROM Mascotas m']);
    expect(texts(q, 'join')).toEqual(['INNER JOIN Duenos d ON m.Id = d.Id']);
    expect(queryOutline(q).tables).toEqual(['Mascotas', 'Duenos']);
  });

  it('never throws on half-typed or empty text', () => {
    for (const q of ['', '   ', 'SELECT', 'SELECT TOP', 'SELECT COUNT(', "SELECT 'abc", 'SELECT [x', 'FROM', '/* open', ')))(']) {
      expect(() => queryOutline(q)).not.toThrow();
    }
    expect(queryOutline('').clauses).toEqual({});
    expect(texts('SELECT COUNT(', 'aggregate')).toEqual(['COUNT(']);
  });
});
