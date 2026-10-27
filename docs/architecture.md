# Architecture / Arquitectura

[English](#english) · [Español](#español)

---

## English

StepSQL has two parts with one contract between them:

```
SQL text + tables ──► engine (src/engine)  ──►  Step[]  ──►  UI (src/ui)  ──► screen
                      pure TypeScript            data only     React + i18next
```

The engine never produces human-readable text and never touches the DOM. The UI never evaluates SQL. Everything the UI shows comes from the steps.

### The engine pipeline

`runStepByStep(sql, tables)` in `src/engine/index.ts`:

1. **Parse** (`parse/parser.ts`): `node-sql-parser` with the `transactsql` dialect builds its AST, which is converted into StepSQL's own small AST (`parse/ast.ts`). Anything the engine cannot run (JOIN, subqueries, CASE, OFFSET … FETCH…) is rejected here with `UNSUPPORTED_FEATURE`, so later stages only see shapes they know.
2. **Validate** (`analyze/validate.ts`): SQL Server's rules before running anything: unknown tables and columns, columns not in `GROUP BY` (8120), aggregates in `WHERE` (147), type clashes, aliases where they are not allowed…
3. **Run the stages** (`stages/*.ts`), one file per logical stage, in this order: `from → where → groupBy → aggregate → having → select → distinct → orderBy → top`, then `result`. A stage that the query does not use produces no step. Each stage receives a working state (`stages/state.ts`) and returns the next state plus its `Step`.
4. **Describe** (`describe/`): canonical SQL text for each clause (`sqlText.ts`), the position of each clause in the original text for highlighting (`outline.ts`, which never throws) and the row lineage (`lineage.ts`).

Evaluation helpers live in `eval/`: expressions with three-valued logic (`expr.ts`), values, comparison and conversions (`values.ts`), `LIKE` (`like.ts`) and aggregates (`aggregates.ts`).

### The Step model

A `Step` (`src/engine/types.ts`) is a snapshot of the data after one stage:

| Field | What it holds |
|---|---|
| `stage` | `from`, `where`, `groupBy`, `aggregate`, `having`, `select`, `distinct`, `orderBy`, `top` or `result` |
| `clauseSql` | canonical text of the clause, e.g. `WHERE Age > 5` |
| `columns`, `rows` | the table at that point; every row has a status `kept`, `discarded` or `new`, and a `reason` when discarded |
| `groups` | from `GROUP BY` on: each group's key, its rows and the detail of each aggregate (inputs, ignored `NULL`s, sum and count for `AVG`) |
| `explanation`, `notes` | `MessageRef` objects: a key plus parameters, never a sentence |
| `stats` | `rowsIn` and `rowsOut` |
| `lineage`, `columnLineage`, `droppedColumns` | where each row and column comes from (below) |

Discarded rows stay in the step so the UI can show them struck out; the next stage only receives the kept rows.

Errors follow the same idea: `{ code: 'COLUMN_NOT_IN_GROUP_BY', params: { column: 'Name', clause: 'SELECT' }, sqlServerError: 8120, location }`.

### Row lineage

`step.lineage` is aligned with `step.rows` (same index) and is kept beside the rows instead of inside them:

- `key`: stable identity across steps. `Pets#12` is row 12 of the source table; `g:3` is group 3. A row keeps its key from `FROM` until it is grouped.
- `parents`: keys of the rows in the previous step this row comes from.
- `origin`: keys of the source-table rows behind it (all the rows of a group, or the merged duplicates).
- `decisive` and `test` (WHERE / HAVING): the columns that decided the discard and the condition with the row's values in place (`7 > 5`) with its result.
- `mergedInto` (DISTINCT), `cells` (computed SELECT columns, e.g. `7 * 2`) and `sortKeys` (ORDER BY).

`columnLineage` says, for each column from `SELECT` on, which previous column it comes from (or that it is computed) and its expression. `droppedColumns` lists the columns that `SELECT` does not project. The UI uses all of this for the hover highlight and for the animations in `src/ui/anim/`.

### Translations

- `src/i18n/locales/en.json` and `es.json` hold every text: the interface, stage explanations, notes, discard reasons, errors and the sample table vocabulary (`sample` section, so each language has its own table: `Pets` / `Mascotas`).
- `src/i18n/languages.ts` lists the languages offered. English is the fallback. The language is detected from the browser and remembered in `localStorage`.
- `src/ui/messages.tsx` turns a `MessageRef` into text: SQL parameters (`{ sql: … }`) are rendered as `<code>` and never translated, lists are joined with `Intl.ListFormat`.
- `src/i18n/plurals.ts` fills plural forms a language needs but the file does not write (for example Spanish `_many`) with the `_other` text.
- `tests/i18n/parity.test.ts` fails when the locale files do not have exactly the same keys, when a text is empty or contains TODO, when the `{{variables}}` differ, or when a key or error code the engine can emit is not translated.

**Adding a language:** copy `en.json` to `locales/<code>.json` and translate the values (not the keys, the `{{variables}}` or the SQL keywords), add `{ code: '<code>', nativeName: '…' }` to `languages.ts`, and run `npm test`.

---

## Español

StepSQL tiene dos partes con un único contrato entre ellas:

```
texto SQL + tablas ──► motor (src/engine)  ──►  Step[]  ──►  UI (src/ui)  ──► pantalla
                       TypeScript puro           solo datos    React + i18next
```

El motor nunca produce texto legible ni toca el DOM. La interfaz nunca evalúa SQL. Todo lo que muestra la interfaz sale de los pasos.

### La secuencia del motor

`runStepByStep(sql, tables)` en `src/engine/index.ts`:

1. **Análisis sintáctico** (`parse/parser.ts`): `node-sql-parser` con el dialecto `transactsql` construye su AST, que se convierte en un AST propio y pequeño (`parse/ast.ts`). Lo que el motor no sabe ejecutar (JOIN, subconsultas, CASE, OFFSET … FETCH…) se rechaza aquí con `UNSUPPORTED_FEATURE`, para que las etapas siguientes solo vean formas conocidas.
2. **Validación** (`analyze/validate.ts`): las reglas de SQL Server antes de ejecutar nada: tablas y columnas desconocidas, columnas que no están en el `GROUP BY` (8120), agregados en el `WHERE` (147), tipos incompatibles, alias donde no se permiten…
3. **Ejecución de las etapas** (`stages/*.ts`), un archivo por etapa lógica, en este orden: `from → where → groupBy → aggregate → having → select → distinct → orderBy → top` y luego `result`. Una etapa que la consulta no usa no genera paso. Cada etapa recibe un estado de trabajo (`stages/state.ts`) y devuelve el estado siguiente y su `Step`.
4. **Descripción** (`describe/`): texto SQL canónico de cada cláusula (`sqlText.ts`), la posición de cada cláusula en el texto original para resaltarla (`outline.ts`, que nunca lanza errores) y el linaje de filas (`lineage.ts`).

Las funciones de evaluación están en `eval/`: expresiones con lógica de tres valores (`expr.ts`), valores, comparación y conversiones (`values.ts`), `LIKE` (`like.ts`) y agregados (`aggregates.ts`).

### El modelo de Paso

Un `Step` (`src/engine/types.ts`) es una foto de los datos después de una etapa:

| Campo | Qué contiene |
|---|---|
| `stage` | `from`, `where`, `groupBy`, `aggregate`, `having`, `select`, `distinct`, `orderBy`, `top` o `result` |
| `clauseSql` | texto canónico de la cláusula, por ejemplo `WHERE Edad > 5` |
| `columns`, `rows` | la tabla en ese punto; cada fila tiene un estado `kept`, `discarded` o `new`, y un `reason` cuando se descarta |
| `groups` | desde `GROUP BY`: la clave de cada grupo, sus filas y el detalle de cada agregado (valores de entrada, `NULL` ignorados, suma y conteo del `AVG`) |
| `explanation`, `notes` | objetos `MessageRef`: una clave más parámetros, nunca una frase |
| `stats` | `rowsIn` y `rowsOut` |
| `lineage`, `columnLineage`, `droppedColumns` | de dónde viene cada fila y cada columna (ver abajo) |

Las filas descartadas siguen en el paso para que la interfaz las muestre tachadas; la etapa siguiente solo recibe las filas que se quedan.

Los errores siguen la misma idea: `{ code: 'COLUMN_NOT_IN_GROUP_BY', params: { column: 'Nombre', clause: 'SELECT' }, sqlServerError: 8120, location }`.

### Linaje de filas

`step.lineage` está alineado con `step.rows` (mismo índice) y se guarda al lado de las filas, no dentro de ellas:

- `key`: identidad estable entre pasos. `Mascotas#12` es la fila 12 de la tabla original; `g:3` es el grupo 3. Una fila conserva su clave desde el `FROM` hasta que se agrupa.
- `parents`: claves de las filas del paso anterior de las que viene esta fila.
- `origin`: claves de las filas de la tabla original que hay detrás (todas las filas de un grupo, o los duplicados fusionados).
- `decisive` y `test` (WHERE / HAVING): las columnas que decidieron el descarte y la condición con los valores de la fila (`7 > 5`) junto con su resultado.
- `mergedInto` (DISTINCT), `cells` (columnas calculadas del SELECT, por ejemplo `7 * 2`) y `sortKeys` (ORDER BY).

`columnLineage` indica, para cada columna desde el `SELECT`, de qué columna anterior viene (o que es calculada) y su expresión. `droppedColumns` lista las columnas que el `SELECT` no proyecta. La interfaz usa todo esto para el resaltado al pasar el ratón y para las animaciones de `src/ui/anim/`.

### Traducciones

- `src/i18n/locales/en.json` y `es.json` contienen todos los textos: interfaz, explicaciones de las etapas, notas, motivos de descarte, errores y el vocabulario de la tabla de ejemplo (sección `sample`, para que cada idioma tenga su tabla: `Pets` / `Mascotas`).
- `src/i18n/languages.ts` lista los idiomas que se ofrecen. El inglés es el idioma de reserva. El idioma se detecta del navegador y se recuerda en `localStorage`.
- `src/ui/messages.tsx` convierte un `MessageRef` en texto: los parámetros SQL (`{ sql: … }`) se muestran como `<code>` y nunca se traducen, y las listas se unen con `Intl.ListFormat`.
- `src/i18n/plurals.ts` rellena las formas de plural que un idioma necesita pero que el archivo no escribe (por ejemplo `_many` en español) con el texto de `_other`.
- `tests/i18n/parity.test.ts` falla si los archivos de idioma no tienen exactamente las mismas claves, si un texto está vacío o contiene TODO, si las `{{variables}}` no coinciden, o si una clave o un código de error que puede emitir el motor no está traducido.

**Añadir un idioma:** copia `en.json` a `locales/<código>.json` y traduce los valores (no las claves, ni las `{{variables}}`, ni las palabras clave de SQL), añade `{ code: '<código>', nativeName: '…' }` a `languages.ts` y ejecuta `npm test`.
