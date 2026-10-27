# Changelog

All notable changes to StepSQL are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Until 1.0.0, minor versions (0.x.0) may change behavior.

## [Unreleased]

## [0.1.0] - 2026-10-26

First public version.

### Added

- Step-by-step engine for single-table T-SQL `SELECT` queries, following the logical processing
  order: `FROM`, `WHERE`, `GROUP BY`, aggregates, `HAVING`, `SELECT`, `DISTINCT`, `ORDER BY`, `TOP`
  and the final result.
- `WHERE` / `HAVING` with comparisons, `AND` / `OR` / `NOT`, `IN`, `BETWEEN`, `LIKE` and `IS [NOT] NULL`;
  `GROUP BY` on one or more columns; `COUNT(*)`, `COUNT(col)`, `COUNT(DISTINCT col)`, `SUM`, `AVG`,
  `MIN` and `MAX`; `ORDER BY` by column, alias or position; `TOP n`, `TOP (n)` and `TOP n PERCENT`.
- SQL Server semantics: three-valued logic with `NULL`, integer division, truncated `AVG` over integers,
  case-insensitive text comparison, `NULL` first in ascending order.
- Errors with the equivalent SQL Server error number (8120, 147, 207, 208…), underlined in the editor,
  and a clear "not supported yet" message for `JOIN`, subqueries, `UNION`, `CASE`, scalar and window
  functions, `ROLLUP` / `CUBE` / `GROUPING SETS`, `TOP … WITH TIES` and `OFFSET … FETCH`.
- Row lineage: each row of each step knows which source rows it comes from.
- Interface: editable tables panel with the 50-row sample table, CodeMirror query editor, logical order
  timeline linked with the editor, step viewer with explanations and teaching notes, "Show all steps".
- Animations for every stage, with replay, pause, skip, three speeds and `prefers-reduced-motion` support.
- English (main language) and Spanish, detected from the browser; translated sample table.
- Light and dark themes with AA contrast checked by a test, and a projector mode.
- Tests for the engine, translation key parity between English and Spanish, and color contrast.
- Static deployment to GitHub Pages with GitHub Actions; CI, release workflow and Dependabot.

[Unreleased]: https://github.com/svvxyz/stepsql/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/svvxyz/stepsql/releases/tag/v0.1.0
