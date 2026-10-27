import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import i18next from 'i18next';
import { describe, expect, it } from 'vitest';
import { ENGINE_ERROR_CODES, ENGINE_MESSAGE_KEYS, runStepByStep, type MessageRef } from '../../src/engine';
import { sampleTable, starterQuery, type SampleVocabulary } from '../../src/data/samples';
import { LANGUAGES } from '../../src/i18n/languages';
import { fillPluralForms } from '../../src/i18n/plurals';

const LOCALES_DIR = join(__dirname, '../../src/i18n/locales');
type Tree = { [k: string]: string | Tree };

const locales: Record<string, Tree> = Object.fromEntries(
  LANGUAGES.map((l) => [l.code, JSON.parse(readFileSync(join(LOCALES_DIR, `${l.code}.json`), 'utf8')) as Tree]),
);

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[key] = v;
    else Object.assign(out, flatten(v, key));
  }
  return out;
}

const flat = Object.fromEntries(Object.entries(locales).map(([code, tree]) => [code, flatten(tree)]));
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const baseKey = (k: string) => k.replace(PLURAL_SUFFIX, '');
const hasKey = (code: string, key: string) =>
  key in flat[code]! || Object.keys(flat[code]!).some((k) => PLURAL_SUFFIX.test(k) && baseKey(k) === key);
const variables = (s: string) => [...s.matchAll(/\{\{\s*([\w.]+)/g)].map((m) => m[1]).sort();

describe('translation files', () => {
  it('every registered language has a locale file and every locale file is registered', () => {
    const files = readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));
    expect(files.sort()).toEqual(LANGUAGES.map((l) => l.code).sort());
  });

  it('es.json and en.json have exactly the same keys', () => {
    expect(Object.keys(flat.es!).sort()).toEqual(Object.keys(flat.en!).sort());
  });

  it('all languages share the same base keys (plural variants may differ by language)', () => {
    const reference = new Set(Object.keys(flat.en!).map(baseKey));
    for (const code of Object.keys(flat)) {
      expect(new Set(Object.keys(flat[code]!).map(baseKey)), code).toEqual(reference);
    }
  });

  it('plural keys have an _other form, and every form the language needs once filled', () => {
    for (const code of Object.keys(flat)) {
      const bases = new Set(Object.keys(flat[code]!).filter((k) => PLURAL_SUFFIX.test(k)).map(baseKey));
      for (const base of bases) expect(flat[code]![`${base}_other`], `${code}: ${base}_other`).toBeTypeOf('string');
      const filled = flatten(fillPluralForms(locales[code]!, code) as Tree);
      const categories = new Intl.PluralRules(code).resolvedOptions().pluralCategories;
      for (const base of bases) {
        for (const cat of categories) expect(filled[`${base}_${cat}`], `${code}: ${base}_${cat}`).toBeTypeOf('string');
      }
    }
  });

  it('no empty or untranslated values', () => {
    for (const [code, entries] of Object.entries(flat)) {
      for (const [k, v] of Object.entries(entries)) {
        expect(v.trim(), `${code}: ${k}`).not.toBe('');
        expect(v, `${code}: ${k}`).not.toBe(k);
        expect(v, `${code}: ${k}`).not.toMatch(/TODO|FIXME/);
      }
    }
  });

  it('the same variables are used in every language', () => {
    for (const k of Object.keys(flat.en!)) {
      for (const code of Object.keys(flat)) {
        if (flat[code]![k] === undefined) continue;
        expect(variables(flat[code]![k]!), `${code}: ${k}`).toEqual(variables(flat.en![k]!));
      }
    }
  });

  it('every message key and error code the engine can emit is translated', () => {
    for (const code of Object.keys(flat)) {
      for (const key of ENGINE_MESSAGE_KEYS) expect(hasKey(code, key), `${code}: ${key}`).toBe(true);
      for (const err of ENGINE_ERROR_CODES) expect(hasKey(code, `error.${err}`), `${code}: error.${err}`).toBe(true);
      for (const stage of ['from', 'where', 'groupBy', 'aggregate', 'having', 'select', 'distinct', 'orderBy', 'top', 'result']) {
        expect(hasKey(code, `stage.${stage}.title`) && hasKey(code, `stage.${stage}.short`), `${code}: stage.${stage}`).toBe(true);
      }
    }
  });
});

describe('localized sample table', () => {
  const vocabOf = (code: string) => (locales[code] as unknown as { sample: SampleVocabulary }).sample;
  const q = (v: SampleVocabulary) => {
    const c = v.columns;
    return [
      starterQuery(v),
      `SELECT ${c.species}, COUNT(*) AS n, AVG(${c.age}) AS a, SUM(${c.weight}) AS w FROM ${v.table} WHERE ${c.age} > 2 GROUP BY ${c.species} HAVING COUNT(*) > 4 ORDER BY n DESC`,
      `SELECT TOP 5 ${c.name}, ${c.age} / 2 AS h FROM ${v.table} ORDER BY ${c.age}`,
      `SELECT DISTINCT ${c.breed} FROM ${v.table}`,
      `SELECT ${c.color}, COUNT(*) FROM ${v.table} GROUP BY ${c.color}`,
      `SELECT ${c.name} FROM ${v.table} WHERE ${c.adoption} BETWEEN '2020-01-01' AND '2022-12-31' AND ${c.breed} IS NOT NULL`,
      `SELECT ${c.breed}, COUNT(*) FROM ${v.table} GROUP BY ${c.breed}`,
    ];
  };

  for (const { code } of LANGUAGES) {
    it(`[${code}] has 50 rows and 8 columns, and typical queries only emit known keys`, () => {
      const v = vocabOf(code);
      const table = sampleTable(v);
      expect(table.rows).toHaveLength(50);
      expect(table.columns).toHaveLength(8);
      for (const sql of q(v)) {
        const r = runStepByStep(sql, [table]);
        expect(r.ok, `${sql}: ${r.ok ? '' : JSON.stringify(r.error)}`).toBe(true);
        if (!r.ok) continue;
        const refs: MessageRef[] = r.steps.flatMap((s) => [s.explanation, ...s.notes, ...s.rows.flatMap((row) => (row.reason ? [row.reason] : []))]);
        for (const ref of refs) expect(ENGINE_MESSAGE_KEYS as readonly string[], ref.key).toContain(ref.key);
      }
    });
  }

  it('both languages hold the same data, only names change', () => {
    const es = runStepByStep(starterQuery(vocabOf('es')), [sampleTable(vocabOf('es'))]);
    const en = runStepByStep(starterQuery(vocabOf('en')), [sampleTable(vocabOf('en'))]);
    const counts = (r: typeof es) => (r.ok ? r.steps.at(-1)!.rows.map((x) => x.values[1]) : null);
    expect(counts(es)).toEqual(counts(en));
    expect(counts(es)!.reduce((a, b) => (a as number) + (b as number), 0)).toBe(50);
  });
});
describe('rendered translations', () => {
  it('nested plurals and variables resolve in both languages', async () => {
    const i18n = i18next.createInstance();
    await i18n.init({
      resources: Object.fromEntries(Object.entries(locales).map(([c, tree]) => [c, { translation: fillPluralForms(tree, c) }])),
      lng: 'es',
      interpolation: { escapeValue: false },
    });
    expect(i18n.t('step.top.percent', { percent: 10, count: 7, n: 1 })).toContain('son 1 fila.');
    expect(i18n.t('step.top.percent', { percent: 50, count: 7, n: 4 })).toContain('son 4 filas.');
    expect(i18n.t('steps.where.summaryFalse', { count: 1 })).toBe('fila da falso.');
    expect(i18n.t('table.problems.invalidCell', { row: 1, column: 'Edad', value: 'x', type: 'int' })).toContain('tipo Entero');
    expect(i18n.t('common.rows', { count: 1000000 })).toContain('filas');
    await i18n.changeLanguage('en');
    expect(i18n.t('step.top.percent', { percent: 10, count: 7, n: 1 })).toContain('is 1 row.');
    expect(i18n.t('steps.where.summaryFalse', { count: 2 })).toBe('rows are false.');
    for (const code of Object.keys(flat)) {
      await i18n.changeLanguage(code);
      for (const key of Object.keys(flat[code]!)) {
        const text = i18n.t(baseKey(key), {
          count: 2, kept: 1, discarded: 1, n: 2, type: 'int', columnCount: 3, rowsIn: 3, rowsOut: 2, current: 1, total: 4,
          shownRows: 5, totalRows: 50, shownCols: 5, totalCols: 7,
        });
        expect(text, `${code}: ${key}`).not.toMatch(/\$t\(/);
      }
    }
  });
});

describe('engine purity', () => {
  it('the engine does not import UI or i18n code', () => {
    const dir = join(__dirname, '../../src/engine');
    const walk = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
    for (const file of walk(dir)) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).not.toMatch(/from ['"](react|react-dom|i18next|react-i18next)['"]/);
      expect(src, file).not.toMatch(/from ['"]\.\.\/(\.\.\/)?(ui|i18n)\b/);
    }
  });
});
