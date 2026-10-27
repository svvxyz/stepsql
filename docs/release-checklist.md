# Release checklist / Lista para publicar una versión

Pasos para publicar una versión nueva de StepSQL. Sustituye `X.Y.Z` por el número de la versión.

## 1. Elegir el número (versionado semántico)

- `0.Y.Z → 0.Y.(Z+1)`: solo arreglos de errores.
- `0.Y.Z → 0.(Y+1).0`: funcionalidades nuevas (por ejemplo, importar CSV / JSON en 0.2.0).
- `1.0.0`: la versión estable, prevista con `JOIN`. A partir de 1.0.0, un cambio que rompa algo sube el primer número.

## 2. Preparar los cambios (en una rama o en `main`)

1. Comprueba que todo pasa en local:
   ```bash
   npm ci
   npm run typecheck
   npm test
   npm run build
   ```
2. Actualiza la versión de `package.json` y `package-lock.json` sin crear el tag todavía:
   ```bash
   npm version X.Y.Z --no-git-tag-version
   ```
3. En `CHANGELOG.md`:
   - Mueve lo que haya en `## [Unreleased]` a una sección nueva `## [X.Y.Z] - AAAA-MM-DD`.
   - Deja `## [Unreleased]` vacío arriba.
   - Actualiza los enlaces del final: `[Unreleased]` compara `vX.Y.Z...HEAD` y añade `[X.Y.Z]`.
4. Si la versión cambia funcionalidades, revisa las secciones "Features and project status" y "Funcionalidades y estado del proyecto" de los dos README, y los textos de la app que mencionan versiones (`feature.*` e `importSoon` en `src/i18n/locales/en.json` y `es.json`).
5. Escribe las notas del Release en `docs/release-notes/vX.Y.Z.md`, en inglés y en español.
6. Haz commit y súbelo:
   ```bash
   git add -A
   git commit -m "Release vX.Y.Z"
   git push
   ```
7. Espera a que el workflow **CI** de ese commit esté en verde en la pestaña Actions.

## 3. Crear el tag anotado

```bash
git tag -a vX.Y.Z -m "StepSQL vX.Y.Z"
git push origin vX.Y.Z
```

El workflow **Release** (`.github/workflows/release.yml`) se ejecuta con el tag: comprueba que no quedan marcadores COMPLETAR, vuelve a pasar los tests, compila, crea el Release de GitHub con notas generadas automáticamente y adjunta `stepsql-vX.Y.Z.zip`. Si el tag no coincide con la versión de `package.json`, falla a propósito.

## 4. Publicar el Release

1. En GitHub, ve a **Releases** y abre el Release `vX.Y.Z` que creó el workflow.
2. Pulsa **Edit**, sustituye o completa las notas generadas con el contenido de `docs/release-notes/vX.Y.Z.md` y guarda.
3. Para versiones `0.x` no marques "Set as a pre-release" salvo que de verdad sea una prueba; sí deja marcado "Set as the latest release".

## 5. Comprobar la demo

El workflow **Deploy to GitHub Pages** publica cada push a `main`.

1. En Actions, comprueba que el despliegue del commit de la versión terminó en verde.
2. Abre https://svvxyz.github.io/stepsql/ en una ventana privada (para evitar la caché).
3. Comprueba en inglés y en español: que la página carga, que la consulta inicial se ejecuta paso a paso, que el tema oscuro y el modo proyector funcionan y que la consola del navegador no muestra errores.
4. Si la versión trae funcionalidades nuevas, pruébalas en la demo publicada.

## Si algo sale mal

- Si el workflow Release falla, corrige el problema, borra el tag (`git tag -d vX.Y.Z` y `git push origin :refs/tags/vX.Y.Z`), borra el Release si llegó a crearse y vuelve al paso 3.
- Nunca reutilices un número de versión ya publicado: si un Release salió con un error, publica `X.Y.(Z+1)`.
