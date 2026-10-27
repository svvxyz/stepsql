import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { queryOutline, runStepByStep, type MessageRef, type OutlineStage, type RunResult } from '../engine';
import { sampleTable, starterQuery, type SampleVocabulary } from '../data/samples';
import { changeLanguage } from '../i18n';
import { LANGUAGES } from '../i18n/languages';
import { ErrorPanel } from './components/ErrorPanel';
import { InfoPopover } from './components/InfoPopover';
import { QueryEditor } from './components/QueryEditor';
import { StageTimeline } from './components/StageTimeline';
import { StepViewer } from './components/StepViewer';
import { TableEditorPane } from './components/TableEditorPane';
import { TableSheet } from './components/TableSheet';
import { TablesPanel } from './components/TablesPanel';
import { messageText } from './messages';
import { readStorage, writeStorage } from './storage';
import { fromTable, toEngineTable } from './tableModel';
import { emptyEntry, entryProblems, isUsedBy, sampleEntry, type TableEntry } from './tables';

type Theme = 'light' | 'dark';
const THEME_KEY = 'stepsql.theme';
const PROJECTOR_KEY = 'stepsql.projector';

function initialTheme(): Theme {
  const stored = readStorage(THEME_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

interface TableProblems {
  name: string;
  problems: MessageRef[];
}

export function App() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const vocab = useMemo(() => t('sample', { returnObjects: true }) as unknown as SampleVocabulary, [t, lang]);

  const [entries, setEntries] = useState<TableEntry[]>(() => [sampleEntry(sampleTable(vocab))]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [query, setQuery] = useState(() => starterQuery(vocab));
  const [queryIsStarter, setQueryIsStarter] = useState(true);
  const [result, setResult] = useState<RunResult | null>(null);
  const [tableProblems, setTableProblems] = useState<TableProblems[]>([]);
  const [stale, setStale] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [hoverStage, setHoverStage] = useState<OutlineStage | null>(null);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [projector, setProjector] = useState(() => readStorage(PROJECTOR_KEY) === '1');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writeStorage(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (projector) document.documentElement.dataset.projector = '';
    else delete document.documentElement.dataset.projector;
    writeStorage(PROJECTOR_KEY, projector ? '1' : '0');
  }, [projector]);

  const usedNames = useMemo(() => queryOutline(query).tables, [query]);
  const problemsById = useMemo(() => new Map(entries.map((e) => [e.id, entryProblems(e, entries)])), [entries]);
  const invalidIds = useMemo(() => new Set([...problemsById].filter(([, p]) => p.length > 0).map(([id]) => id)), [problemsById]);

  const execute = useCallback((list: TableEntry[], sql: string, keepIndex = false) => {
    // Only the tables the query names can stop the run; a half-built new table elsewhere does not.
    const names = queryOutline(sql).tables;
    const blocking = list
      .filter((e) => isUsedBy(e, names))
      .map((e) => ({ name: e.table.name.trim() || '—', problems: entryProblems(e, list) }))
      .filter((p) => p.problems.length > 0);
    setTableProblems(blocking);
    setStale(false);
    if (blocking.length > 0) {
      setResult(null);
      return;
    }
    const usable = list.filter((e) => entryProblems(e, list).length === 0).map((e) => toEngineTable(e.table).table);
    const r = runStepByStep(sql, usable);
    setResult(r);
    if (!keepIndex) setStepIndex(0);
    else if (r.ok) setStepIndex((i) => Math.min(i, r.steps.length - 1));
  }, []);

  const run = () => execute(entries, query);

  // Language change: sample tables follow the language while the user has not edited them.
  // The query is the user's own and is never rewritten, except the untouched starter query,
  // which names the sample table. Explanations re-translate on their own.
  const prevLang = useRef(lang);
  useEffect(() => {
    if (prevLang.current === lang) return;
    prevLang.current = lang;
    if (!entries.some((e) => e.isSample)) return;
    const sample = sampleTable(vocab);
    const next = entries.map((e) => (e.isSample ? { ...e, table: fromTable(sample) } : e));
    const newQuery = queryIsStarter ? starterQuery(vocab) : query;
    setEntries(next);
    if (newQuery !== query) setQuery(newQuery);
    if (result && !stale) execute(next, newQuery, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const onQueryChange = (v: string) => {
    setQuery(v);
    if (v !== starterQuery(vocab)) setQueryIsStarter(false);
  };

  const updateEntry = (entry: TableEntry) => {
    setEntries((list) => list.map((e) => (e.id === entry.id ? entry : e)));
    if (result) setStale(true);
  };
  const deleteEntry = (id: number) => {
    setEntries((list) => list.filter((e) => e.id !== id));
    setEditingId(null);
    if (result) setStale(true);
  };
  const createEntry = () => {
    const entry = emptyEntry(entries, t('tables.newTableName'));
    setEntries((list) => [...list, entry]);
    setEditingId(entry.id);
  };
  const restoreSample = () => {
    const entry = sampleEntry(sampleTable(vocab));
    setEntries((list) => [...list, entry]);
    if (result) setStale(true);
  };

  const editing = entries.find((e) => e.id === editingId) ?? null;
  const steps = result && result.ok ? result.steps : null;
  const index = steps ? Math.min(stepIndex, steps.length - 1) : 0;
  const activeStage = steps && !showAll ? steps[index]!.stage : null;
  const errorRange = result && !result.ok ? result.error.location : undefined;

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <h1>
            {t('app.title')} <span className="tagline">{t('app.tagline')}</span>
          </h1>
          <p className="subtitle">{t('app.subtitle')}</p>
        </div>
        <div className="header-controls">
          <label className="lang-select">
            <span className="sr-only">{t('app.language')}</span>
            <select value={lang} onChange={(e) => changeLanguage(e.target.value)} aria-label={t('app.language')}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.nativeName}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn ghost" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={t('app.toggleTheme')}>
            {theme === 'dark' ? `☀ ${t('app.themeLight')}` : `☾ ${t('app.themeDark')}`}
          </button>
          <button type="button" className="btn ghost projector-btn" aria-pressed={projector} onClick={() => setProjector(!projector)} title={t('projector.hint')}>
            ⛶ {projector ? t('projector.off') : t('projector.on')}
          </button>
          <InfoPopover />
        </div>
      </header>

      <main>
        <div className="workbench">
          <TablesPanel
            entries={entries}
            usedNames={usedNames}
            invalidIds={invalidIds}
            editingId={editingId}
            onOpen={setEditingId}
            onCreate={createEntry}
            onRestoreSample={entries.some((e) => e.fromSample) ? undefined : restoreSample}
          />

          <section className="panel query-panel" aria-labelledby="query-heading">
            <div className="panel-header">
              <h2 id="query-heading" className="stage-label">
                {t('query.heading')}
              </h2>
            </div>
            <QueryEditor
              value={query}
              onChange={onQueryChange}
              onRun={run}
              errorRange={errorRange}
              label={t('query.editorLabel')}
              placeholder={t('query.placeholder')}
              positionLabel={(line, column) => t('query.cursorPosition', { line, column })}
              highlightStage={hoverStage ?? activeStage}
              onHoverStage={setHoverStage}
            />
            <div className="panel-footer">
              <button type="button" className="btn primary" onClick={run}>
                ▶ {t('query.run')}
              </button>
              <span className="hint">
                <kbd>Ctrl</kbd> + <kbd>Enter</kbd> {t('query.runShortcutSuffix')}
              </span>
            </div>
          </section>
        </div>

        <StageTimeline
          steps={steps}
          index={index}
          showAll={showAll}
          onSelect={(i) => {
            setShowAll(false);
            setStepIndex(i);
          }}
          hovered={hoverStage}
          onHover={setHoverStage}
        />

        <div className="stage">
          {stale && (
            <div className="stale-notice" role="status">
              <span>{t('stale.message')}</span>
              <button type="button" className="btn small primary" onClick={run}>
                ▶ {t('stale.run')}
              </button>
            </div>
          )}
          {tableProblems.length > 0 && (
            <div className="error-panel" role="alert">
              {tableProblems.map((tp) => (
                <div key={tp.name}>
                  <h2>{t('table.problems.titleNamed', { name: tp.name })}</h2>
                  <ul>
                    {tp.problems.map((p, i) => (
                      <li key={i}>{messageText(p, t, lang)}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {result && !result.ok && <ErrorPanel error={result.error} />}
          {steps && (
            <StepViewer steps={steps} index={index} onIndex={setStepIndex} showAll={showAll} onShowAll={setShowAll} />
          )}
          {!result && tableProblems.length === 0 && <p className="empty-state">{t('steps.empty')}</p>}
        </div>
      </main>

      <footer className="app-footer">
        <span>{t('app.footer')}</span>
      </footer>

      <TableSheet open={editing !== null} onClose={() => setEditingId(null)} labelledBy="sheet-title">
        {(closeButton) =>
          editing && (
            <TableEditorPane
              entry={editing}
              problems={problemsById.get(editing.id) ?? []}
              onChange={updateEntry}
              onDelete={() => deleteEntry(editing.id)}
              onResetSample={
                editing.fromSample && !editing.isSample
                  ? () => updateEntry({ ...editing, table: fromTable(sampleTable(vocab)), isSample: true })
                  : undefined
              }
              toolbarEnd={closeButton}
              titleId="sheet-title"
            />
          )
        }
      </TableSheet>
    </div>
  );
}
