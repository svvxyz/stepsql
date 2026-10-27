# StepSQL — SQL step by step

**English** · [Español](README.es.md)

An interactive web tool for anyone who wants to learn SQL by practicing. Write a **T-SQL** (SQL Server) query and see, stage by stage, how the data changes until it becomes the result.

<p>
  <a href="https://github.com/svvxyz/stepsql/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/svvxyz/stepsql/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <a href="CHANGELOG.md"><img alt="Version" src="https://img.shields.io/github/package-json/v/svvxyz/stepsql"></a>
</p>

**Live demo:** <a href="https://svvxyz.github.io/stepsql/">https://svvxyz.github.io/stepsql/</a>

## The problem it solves

SQL Server does not show the intermediate results of a query. The execution plan shows operators and row counts, but not the data. When you are learning, it is hard to picture what happens "behind the scenes" with `WHERE`, `GROUP BY`, `HAVING` or the aggregate functions, and why a query fails with errors such as 8120 ("is invalid in the select list…").

StepSQL runs the query with its own engine, stops at each stage of the **logical processing order** and shows the table at that point: which rows pass, how the groups are formed, how each aggregate is computed and which columns end up in the result. The explanations are generated from your own query, in English or Spanish, so you can try, make mistakes and understand why.

## Features and project status

Current version: **0.1.0**, the first public version. Everything below is implemented and covered by the tests in `tests/`.

### Supported SQL

| Area | Supported |
|---|---|
| `SELECT` | columns, `*`, aliases (`AS`, and `Total = SUM(x)`), arithmetic `+ - * / %`, literals |
| `FROM` | one table, with an optional alias and schema (`dbo.Pets p`) |
| `WHERE` / `HAVING` | `= <> != < <= > >=`, `AND` / `OR` / `NOT`, `IN (…)`, `BETWEEN`, `LIKE` (`%`, `_`, `[…]`), `IS [NOT] NULL` |
| `GROUP BY` | one or more columns |
| Aggregates | `COUNT(*)`, `COUNT(col)`, `COUNT(DISTINCT col)`, `SUM`, `AVG`, `MIN`, `MAX` |
| `ORDER BY` | `ASC` / `DESC`, several columns, by alias or by position |
| `DISTINCT`, `TOP` | `TOP n`, `TOP (n)`, `TOP n PERCENT` |

SQL Server semantics that the engine reproduces: three-valued logic with `NULL`, aggregates that ignore `NULL`, integer division (`7 / 2 = 3`), `AVG` truncated over integers, case-insensitive text comparison, `NULL` sorted first with `ORDER BY ASC`, and errors with the equivalent SQL Server error number (8120, 147, 207, 208…).

### Not supported yet

The engine rejects these with a clear "not supported yet" message instead of guessing: `JOIN` and several tables, subqueries, `UNION` / `INTERSECT` / `EXCEPT`, `WITH` (CTE), `CASE`, `CAST` / `CONVERT`, scalar functions (`UPPER`, `ISNULL`, `GETDATE`…), window functions (`OVER`), `ROLLUP` / `CUBE` / `GROUPING SETS`, `TOP … WITH TIES`, `OFFSET … FETCH`, `SELECT … INTO` and `FOR XML / JSON`. Only `SELECT` statements run, one at a time.

### Interface

- **Tables panel**: the sample table `Pets` (50 rows, 8 columns: Id, Name, Species, Breed, Color, Age, Weight, AdoptionDate, with some deliberate `NULL`s). You can create tables and edit cells, rows, columns, column types (text, integer, decimal, date) and names. An empty cell is `NULL`.
- **Query editor** (CodeMirror) with SQL highlighting, line and column position and `Ctrl` + `Enter` to run. Errors are underlined in the editor.
- **Timeline** with the full logical order. Stages the query does not use are dimmed, and the timeline and the editor highlight each other.
- **Step by step**: previous / next (also with the arrow keys), click on the timeline, or "Show all steps" stacked.
- **What each stage shows**: in `WHERE` and `HAVING`, the reason each row passes or not and the cell that decided it; `GROUP BY` in blocks G1, G2…; each aggregate's calculation with the `NULL`s struck through; in `SELECT`, which columns are projected, computed, renamed or left out; the `TOP` cut line; the row count change (`50 → 40 · −10`).
- **Row lineage**: hovering a row shows which rows of the source table it comes from.
- **Animations** for `WHERE`, `HAVING`, `GROUP BY`, aggregates, `SELECT`, `DISTINCT`, `ORDER BY` and `TOP`, with replay, pause, skip and three speeds. They become fades with `prefers-reduced-motion`.
- **Projector mode** with larger text, **light and dark themes** with AA contrast checked by a test, and **English and Spanish** (the page opens in the browser's language and the sample table is translated too).
- 100% static: the data never leaves the browser.

### Known limitations

- Simplified types: text, integer, decimal (a floating point number rounded to 10 places) and date. `decimal(p, s)`, overflows and `datetime` are not modeled.
- Text collation approximates `Modern_Spanish_CI_AS` (case-insensitive, accent-sensitive). `COLLATE` is accepted but ignored.
- `TOP` without `ORDER BY` takes the rows in table order (SQL Server guarantees no order).
- Error messages follow SQL Server's criteria but are not literal copies, and syntax error positions are approximate.
- An empty cell is always `NULL`, so an empty string cannot be entered.
- Tables you create or edit are lost when the page reloads. The theme, language, speed and projector mode are remembered.
- Above 50 rows, animations only move the first 50 rows.
- CSV / JSON import is not available yet (the button is visible but disabled).

## Teaching note: logical order, not the physical plan

StepSQL shows the **logical** processing order of a `SELECT`: `FROM → WHERE → GROUP BY → aggregates → HAVING → SELECT → DISTINCT → ORDER BY → TOP`. That order defines what the result must be, and it explains rules such as "you cannot use a `SELECT` alias in `WHERE`".

It is **not** the physical execution plan of SQL Server. The real optimizer may read indexes, reorder or merge operations and run them in parallel, as long as the result is the same. StepSQL does not show execution plans, indexes or performance.

## Run it locally

Requirements: [Node.js](https://nodejs.org/) 22.12 or later (the version in `.nvmrc`) and npm.

```bash
git clone https://github.com/svvxyz/stepsql.git
cd stepsql
npm ci              # install the exact versions from package-lock.json
npm run dev         # http://localhost:5173
npm test            # engine, translation parity and contrast tests
npm run typecheck   # TypeScript checks
npm run build       # builds the static site into dist/
npm run preview     # serves dist/ to check the build
```

## Technologies and code structure

React 19, TypeScript, Vite, CodeMirror 6, i18next and [node-sql-parser](https://github.com/taozhi8833998/node-sql-parser) (T-SQL dialect). Tests run with Vitest. The site is deployed to GitHub Pages with GitHub Actions.

The project is split in two parts that do not know about each other's details:

- **`src/engine/`** is a pure TypeScript engine with no React, no browser APIs and no text. It receives the SQL and the tables and returns a list of **steps**. Each step carries its rows, its row lineage and its explanation as a message key with parameters, never as a sentence.
- **`src/ui/`** is the React interface. It renders the steps, translates the message keys with i18next and runs the animations.

```
src/
  engine/        pure TypeScript engine: no UI, no i18n, no text
    parse/       node-sql-parser (transactsql) → own AST; unsupported features rejected here
    analyze/     validation with SQL Server's rules and types
    eval/        expressions, NULL, LIKE, aggregates
    stages/      one logical stage per file (from, where, groupBy, …)
    describe/    canonical SQL text, clause positions in the query, row lineage
  i18n/          i18next setup and locales/en.json, locales/es.json
  data/          sample table and starter query (names per language)
  ui/            React components, animations (anim/) and styles (styles/)
tests/
  engine/        clauses, NULLs, groups, errors, lineage, outline
  i18n/          key parity between en and es, and engine keys translated
  ui/            AA contrast of the color tokens in both themes
```

The engine's public interface is one function:

```ts
runStepByStep(sql: string, tables: Table[]): { ok: true; steps: Step[] } | { ok: false; error: EngineError }
```

More detail in [docs/architecture.md](docs/architecture.md): the step model, row lineage and the translation system, and how to add a language.

## License and credits

Code under the [MIT license](LICENSE) © 2026 Abimael Aviles Melchor.

StepSQL uses open-source packages and fonts under their own licenses (Apache-2.0, OFL-1.1, MIT and others); see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). SQL Server is a trademark of Microsoft; StepSQL is an independent project, not affiliated with Microsoft.

Changes between versions are in [CHANGELOG.md](CHANGELOG.md).
