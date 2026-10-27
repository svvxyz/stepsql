# Issues iniciales

Ideas pendientes redactadas como issues, listas para copiar a GitHub (**Issues → New issue → Open a blank issue**). Están en inglés, que es el idioma principal del repositorio; si prefieres crearlas en español, traduce el título y la descripción.

Milestones que hay que crear antes (**Issues → Milestones → New milestone**):

- **V2**: el camino hasta la versión estable. Incluye `v0.2.0` (importar datos) y `v1.0.0` (`JOIN`).
- **V3**: lo que viene después de la 1.0.

Etiquetas sugeridas (GitHub ya trae `bug`, `enhancement`, `documentation` y `good first issue`; crea las demás en **Issues → Labels**): `enhancement`, `engine`, `ui`, `i18n`, `docs`, `good first issue`.

✅ = buena para `good first issue` (pequeña, bien delimitada y sin tocar el núcleo del motor).

---

### 1. Import tables from CSV and JSON

- **Labels:** `enhancement`, `ui`
- **Milestone:** V2 (v0.2.0)

The "Import" button in the tables panel is visible but disabled. Allow importing a table from a CSV or JSON file: detect column types (text, integer, decimal, date), treat empty cells as `NULL`, show a preview and report rows that cannot be converted. Everything must stay in the browser.

### 2. Support JOIN (INNER, LEFT, RIGHT, FULL) with several tables

- **Labels:** `enhancement`, `engine`, `ui`
- **Milestone:** V2 (v1.0.0)

The timeline already shows a JOIN stage that is never used. Add queries over several tables with `INNER`, `LEFT`, `RIGHT` and `FULL OUTER JOIN` (and `CROSS JOIN`), a JOIN step that shows which row pairs match the `ON` condition and which rows are filled with `NULL`, and row lineage that points to both source tables.

### 3. Keep created and edited tables after reloading the page

- **Labels:** `enhancement`, `ui`
- **Milestone:** V2

Tables the user creates or edits are lost on reload. Save them in `localStorage` (with a size limit and a "Restore the sample table" option) so a class can prepare its tables beforehand.

### 4. Teaching mode and full mode for large tables

- **Labels:** `enhancement`, `ui`
- **Milestone:** V2

Today, animations only move the first 50 rows. Add a teaching mode (a small sample of the table, full animation) and a full mode (all the rows, summaries and pagination instead of animation).

### 5. Support the CASE expression

- **Labels:** `enhancement`, `engine`
- **Milestone:** V2

`CASE` is rejected as "not supported yet". Add simple and searched `CASE` in `SELECT`, `WHERE` and `ORDER BY`, showing in the SELECT step which branch each row took.

### 6. Common scalar functions: ISNULL, COALESCE, UPPER, LOWER, LEN, YEAR…

- **Labels:** `enhancement`, `engine`
- **Milestone:** V2

Scalar functions are rejected today. Start with a small, well-tested set that is useful in class: `ISNULL`, `COALESCE`, `UPPER`, `LOWER`, `LEN`, `LTRIM`, `RTRIM`, `ROUND`, `YEAR`, `MONTH`, `DAY`, with SQL Server's `NULL` and type rules.

### 7. ✅ Add a "not supported yet" checkbox to the bug report template

- **Labels:** `docs`, `good first issue`
- **Milestone:** V2

When a query fails with "not supported yet", the bug report should say so. Add a checkbox "The app said 'not supported yet'" to `.github/ISSUE_TEMPLATE/bug_report.yml` so these reports can be told apart from real errors.

### 8. ✅ Add a keyboard shortcut list to the info popover

- **Labels:** `ui`, `i18n`, `good first issue`
- **Milestone:** V2

The app already supports `Ctrl` + `Enter` in the editor and the arrow keys in the step viewer, but they are only hinted in place. List the shortcuts in the "i" popover, with the texts in both `en.json` and `es.json` (the parity test checks both files stay in sync).

### 9. ✅ Warn when COLLATE is used

- **Labels:** `enhancement`, `engine`, `good first issue`
- **Milestone:** V2

`COLLATE` is accepted but ignored, so `WHERE Name COLLATE Latin1_General_CS_AS = 'mora'` gives the case-insensitive result. Either reject it as "not supported yet" or add a teaching note saying it is ignored. Add a test in `tests/engine/errors.test.ts`.

### 10. ✅ Allow typing an empty string in a cell

- **Labels:** `enhancement`, `ui`, `good first issue`
- **Milestone:** V2

An empty cell is always `NULL`, so `''` cannot be represented. Add a way to enter an empty string (for example typing `''`) and show it differently from `NULL` in the table.

### 11. Add a linter (ESLint) to the project and the CI

- **Labels:** `docs`
- **Milestone:** V2

There is no linter today; the CI runs the typecheck, the tests and the build. Add ESLint with the TypeScript and React Hooks rules, a `lint` script, and a lint step in `.github/workflows/ci.yml`.

### 12. ROLLUP, CUBE and GROUPING SETS

- **Labels:** `enhancement`, `engine`, `ui`
- **Milestone:** V3

Show the extra subtotal rows these produce, which grouping each one belongs to, and `GROUPING()`.

### 13. Subqueries

- **Labels:** `enhancement`, `engine`, `ui`
- **Milestone:** V3

Start with `IN (SELECT …)` and scalar subqueries in `WHERE`, running the inner query as its own set of steps that the outer step can open.

### 14. AdventureWorks sample data

- **Labels:** `enhancement`, `docs`
- **Milestone:** V3

Offer a few tables from AdventureWorks2014 as an optional sample, after checking its license allows redistribution. Requires JOIN (issue 2) and the full mode for large tables (issue 4).

### 15. TOP … WITH TIES and OFFSET … FETCH

- **Labels:** `enhancement`, `engine`
- **Milestone:** V3

Both are rejected as "not supported yet" today. Show the extra tied rows of `WITH TIES` and the page window of `OFFSET … FETCH` in the TOP step.
