# StepSQL — SQL paso a paso

[English](README.md) · **Español**

Herramienta web interactiva para quien quiere aprender SQL practicando. Escribe una consulta **T-SQL** (SQL Server) y mira, etapa por etapa, cómo cambian los datos hasta convertirse en el resultado.

<p>
  <a href="https://github.com/svvxyz/stepsql/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/svvxyz/stepsql/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="Licencia: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <a href="CHANGELOG.md"><img alt="Versión" src="https://img.shields.io/github/package-json/v/svvxyz/stepsql"></a>
</p>

**Demo en vivo:** <a href="https://svvxyz.github.io/stepsql/">https://svvxyz.github.io/stepsql/</a>

## Qué problema resuelve

SQL Server no muestra los resultados intermedios de una consulta. El plan de ejecución muestra operadores y conteos de filas, pero no los datos. Cuando estás aprendiendo, cuesta imaginar qué pasa "por detrás" con `WHERE`, `GROUP BY`, `HAVING` o las funciones de agregado, y por qué una consulta falla con errores como el 8120 ("no es válida en la lista de selección…").

StepSQL ejecuta la consulta con un motor propio, se detiene en cada etapa del **orden lógico de procesamiento** y muestra la tabla en ese punto: qué filas pasan, cómo se forman los grupos, cómo se calcula cada agregado y qué columnas llegan al resultado. Las explicaciones se generan a partir de tu propia consulta, en español o en inglés, para que puedas probar, equivocarte y entender por qué.

## Funcionalidades y estado del proyecto

Versión actual: **0.1.0**, la primera versión pública. Todo lo que sigue está implementado y cubierto por los tests de `tests/`.

### SQL soportado

| Área | Soportado |
|---|---|
| `SELECT` | columnas, `*`, alias (`AS` y `Total = SUM(x)`), aritmética `+ - * / %`, literales |
| `FROM` | una tabla, con alias y esquema opcionales (`dbo.Mascotas m`) |
| `WHERE` / `HAVING` | `= <> != < <= > >=`, `AND` / `OR` / `NOT`, `IN (…)`, `BETWEEN`, `LIKE` (`%`, `_`, `[…]`), `IS [NOT] NULL` |
| `GROUP BY` | una o varias columnas |
| Agregados | `COUNT(*)`, `COUNT(col)`, `COUNT(DISTINCT col)`, `SUM`, `AVG`, `MIN`, `MAX` |
| `ORDER BY` | `ASC` / `DESC`, varias columnas, por alias o por posición |
| `DISTINCT`, `TOP` | `TOP n`, `TOP (n)`, `TOP n PERCENT` |

Semántica de SQL Server que reproduce el motor: lógica de tres valores con `NULL`, agregados que ignoran `NULL`, división entera (`7 / 2 = 3`), `AVG` truncado sobre enteros, comparación de texto sin distinguir mayúsculas, `NULL` primero con `ORDER BY ASC` y errores con el número equivalente de SQL Server (8120, 147, 207, 208…).

### Todavía no soportado

El motor rechaza esto con un mensaje claro de "todavía no está soportado" en lugar de adivinar: `JOIN` y varias tablas, subconsultas, `UNION` / `INTERSECT` / `EXCEPT`, `WITH` (CTE), `CASE`, `CAST` / `CONVERT`, funciones escalares (`UPPER`, `ISNULL`, `GETDATE`…), funciones de ventana (`OVER`), `ROLLUP` / `CUBE` / `GROUPING SETS`, `TOP … WITH TIES`, `OFFSET … FETCH`, `SELECT … INTO` y `FOR XML / JSON`. Solo se ejecutan sentencias `SELECT`, de una en una.

### Interfaz

- **Panel de tablas**: la tabla de ejemplo `Mascotas` (50 filas y 8 columnas: Id, Nombre, Especie, Raza, Color, Edad, Peso, FechaAdopcion, con algunos `NULL` a propósito). Puedes crear tablas y editar celdas, filas, columnas, tipos de columna (texto, entero, decimal, fecha) y nombres. Una celda vacía es `NULL`.
- **Editor de consultas** (CodeMirror) con resaltado SQL, posición de línea y columna, y `Ctrl` + `Enter` para ejecutar. Los errores se subrayan en el editor.
- **Línea de etapas** con el orden lógico completo. Las etapas que la consulta no usa aparecen atenuadas, y la línea y el editor se resaltan mutuamente.
- **Paso a paso**: anterior / siguiente (también con las flechas del teclado), clic en la línea de etapas, o "Ver todos los pasos" apilados.
- **Qué muestra cada etapa**: en `WHERE` y `HAVING`, el motivo por el que cada fila pasa o no y la celda que lo decidió; `GROUP BY` en bloques G1, G2…; el cálculo de cada agregado con los `NULL` tachados; en `SELECT`, qué columnas se proyectan, se calculan, se renombran o se quedan fuera; la línea de corte de `TOP`; el cambio en el número de filas (`50 → 40 · −10`).
- **Linaje de filas**: al pasar el ratón por una fila se ve de qué filas de la tabla original viene.
- **Animaciones** para `WHERE`, `HAVING`, `GROUP BY`, agregados, `SELECT`, `DISTINCT`, `ORDER BY` y `TOP`, con repetir, pausa, saltar y tres velocidades. Con `prefers-reduced-motion` se convierten en fundidos.
- **Modo proyector** con texto más grande, **tema claro y oscuro** con contraste AA comprobado por un test, y **inglés y español** (la página se abre en el idioma del navegador y la tabla de ejemplo también se traduce).
- 100 % estática: los datos nunca salen del navegador.

### Limitaciones conocidas

- Tipos simplificados: texto, entero, decimal (un número de coma flotante redondeado a 10 decimales) y fecha. No se modelan `decimal(p, s)`, los desbordamientos ni `datetime`.
- La intercalación de texto se aproxima a `Modern_Spanish_CI_AS` (no distingue mayúsculas, sí acentos). `COLLATE` se acepta pero se ignora.
- `TOP` sin `ORDER BY` toma las filas en el orden de la tabla (SQL Server no garantiza ningún orden).
- Los mensajes de error siguen el criterio de SQL Server pero no son copias literales, y la posición de los errores de sintaxis es aproximada.
- Una celda vacía siempre es `NULL`, así que no se puede escribir una cadena vacía.
- Las tablas que creas o editas se pierden al recargar la página. El tema, el idioma, la velocidad y el modo proyector sí se recuerdan.
- Con más de 50 filas, las animaciones solo mueven las 50 primeras.
- La importación de CSV / JSON todavía no está disponible (el botón se ve, pero está desactivado).

## Aviso pedagógico: orden lógico, no plan físico

StepSQL muestra el orden **lógico** de procesamiento de un `SELECT`: `FROM → WHERE → GROUP BY → agregados → HAVING → SELECT → DISTINCT → ORDER BY → TOP`. Ese orden define cuál debe ser el resultado y explica reglas como "no se puede usar un alias del `SELECT` en el `WHERE`".

**No** es el plan de ejecución físico de SQL Server. El optimizador real puede leer índices, reordenar o combinar operaciones y ejecutarlas en paralelo, siempre que el resultado sea el mismo. StepSQL no muestra planes de ejecución, índices ni rendimiento.

## Cómo ejecutarlo localmente

Requisitos: [Node.js](https://nodejs.org/) 22.12 o posterior (la versión de `.nvmrc`) y npm.

```bash
git clone https://github.com/svvxyz/stepsql.git
cd stepsql
npm ci              # instala las versiones exactas de package-lock.json
npm run dev         # http://localhost:5173
npm test            # tests del motor, de paridad de traducciones y de contraste
npm run typecheck   # comprobación de tipos de TypeScript
npm run build       # genera el sitio estático en dist/
npm run preview     # sirve dist/ para comprobar la compilación
```

## Tecnologías y estructura del código

React 19, TypeScript, Vite, CodeMirror 6, i18next y [node-sql-parser](https://github.com/taozhi8833998/node-sql-parser) (dialecto T-SQL). Los tests usan Vitest. El sitio se publica en GitHub Pages con GitHub Actions.

El proyecto está dividido en dos partes que no conocen los detalles de la otra:

- **`src/engine/`** es un motor en TypeScript puro, sin React, sin APIs del navegador y sin textos. Recibe el SQL y las tablas y devuelve una lista de **pasos**. Cada paso lleva sus filas, el linaje de cada fila y su explicación como una clave de mensaje con parámetros, nunca como una frase.
- **`src/ui/`** es la interfaz en React. Dibuja los pasos, traduce las claves de mensaje con i18next y ejecuta las animaciones.

```
src/
  engine/        motor en TypeScript puro: sin UI, sin i18n, sin textos
    parse/       node-sql-parser (transactsql) → AST propio; aquí se rechaza lo no soportado
    analyze/     validación con las reglas y los tipos de SQL Server
    eval/        expresiones, NULL, LIKE, agregados
    stages/      una etapa lógica por archivo (from, where, groupBy, …)
    describe/    texto SQL canónico, posición de cada cláusula en la consulta, linaje de filas
  i18n/          configuración de i18next y locales/en.json, locales/es.json
  data/          tabla de ejemplo y consulta inicial (nombres según el idioma)
  ui/            componentes de React, animaciones (anim/) y estilos (styles/)
tests/
  engine/        cláusulas, NULL, grupos, errores, linaje, posiciones
  i18n/          paridad de claves entre en y es, y claves del motor traducidas
  ui/            contraste AA de los colores en ambos temas
```

La interfaz pública del motor es una sola función:

```ts
runStepByStep(sql: string, tables: Table[]): { ok: true; steps: Step[] } | { ok: false; error: EngineError }
```

Más detalle en [docs/architecture.md](docs/architecture.md): el modelo de paso, el linaje de filas, el sistema de traducciones y cómo añadir un idioma.

## Licencia y créditos

Código bajo [licencia MIT](LICENSE) © 2026 Abimael Aviles Melchor.

StepSQL usa paquetes y fuentes de código abierto con sus propias licencias (Apache-2.0, OFL-1.1, MIT y otras); ver [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). SQL Server es una marca de Microsoft; StepSQL es un proyecto independiente, sin relación con Microsoft.

Los cambios entre versiones están en [CHANGELOG.md](CHANGELOG.md).
