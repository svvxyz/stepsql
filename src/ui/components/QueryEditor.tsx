import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { MSSQL, sql } from '@codemirror/lang-sql';
import { HighlightStyle, bracketMatching, syntaxHighlighting } from '@codemirror/language';
import { EditorState, Prec, StateEffect, StateField, type Extension } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder as cmPlaceholder,
  type DecorationSet,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { useEffect, useMemo, useRef, useState } from 'react';
import { queryOutline, type OutlineStage } from '../../engine';

const setErrorRange = StateEffect.define<{ from: number; to: number } | null>();

const errorField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setErrorRange)) {
        deco = e.value && e.value.to > e.value.from ? Decoration.set([Decoration.mark({ class: 'cm-sql-error' }).range(e.value.from, e.value.to)]) : Decoration.none;
      }
    }
    if (tr.docChanged) deco = Decoration.none;
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const setClauseRanges = StateEffect.define<{ from: number; to: number }[]>();

// Highlight of the clause that belongs to the active (or hovered) stage.
const clauseField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setClauseRanges)) {
        const marks = e.value.filter((r) => r.to > r.from).map((r) => Decoration.mark({ class: 'cm-clause-hl' }).range(r.from, r.to));
        deco = Decoration.set(marks, true);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// When the pointer is over text that belongs to several stages, the narrowest wins.
const HOVER_PRIORITY: OutlineStage[] = ['aggregate', 'distinct', 'top', 'join', 'select', 'from', 'where', 'groupBy', 'having', 'orderBy'];

// Colors come from CSS variables so the editor follows the light/dark theme.
const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--sql-keyword)', fontWeight: '700' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--sql-string)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--sql-number)' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--sql-comment)', fontStyle: 'italic' },
  { tag: [tags.operator, tags.punctuation], color: 'var(--sql-operator)' },
  { tag: [tags.typeName, tags.standard(tags.name)], color: 'var(--sql-function)' },
]);

interface Props {
  value: string;
  onChange: (v: string) => void;
  onRun: () => void;
  errorRange?: { start: number; end: number } | undefined;
  label: string;
  placeholder: string;
  positionLabel: (line: number, column: number) => string;
  /** Stage whose clause is highlighted. */
  highlightStage?: OutlineStage | null | undefined;
  /** Called with the stage under the pointer, or null. */
  onHoverStage?: ((stage: OutlineStage | null) => void) | undefined;
}

export function QueryEditor({ value, onChange, onRun, errorRange, label, placeholder, positionLabel, highlightStage, onHoverStage }: Props) {
  const [pos, setPos] = useState({ line: 1, column: 1 });
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const outline = useMemo(() => queryOutline(value), [value]);
  const callbacks = useRef({ onChange, onRun, onHoverStage, outline });
  callbacks.current = { onChange, onRun, onHoverStage, outline };
  const hoverStage = useRef<OutlineStage | null>(null);

  useEffect(() => {
    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      drawSelection({ cursorBlinkRate: 1000 }),
      history(),
      bracketMatching(),
      sql({ dialect: MSSQL, upperCaseKeywords: true }),
      syntaxHighlighting(highlight),
      errorField,
      clauseField,
      EditorView.domEventHandlers({
        mousemove: (e, v) => {
          const pos = v.posAtCoords({ x: e.clientX, y: e.clientY }, false);
          const { clauses } = callbacks.current.outline;
          const stage = HOVER_PRIORITY.find((s) => clauses[s]?.some((r) => pos >= r.start && pos < r.end)) ?? null;
          if (stage !== hoverStage.current) {
            hoverStage.current = stage;
            callbacks.current.onHoverStage?.(stage);
          }
        },
        mouseleave: () => {
          if (hoverStage.current !== null) {
            hoverStage.current = null;
            callbacks.current.onHoverStage?.(null);
          }
        },
      }),
      EditorView.lineWrapping,
      cmPlaceholder(placeholder),
      Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => (callbacks.current.onRun(), true) }])),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) callbacks.current.onChange(u.state.doc.toString());
        if (u.docChanged || u.selectionSet) {
          const head = u.state.selection.main.head;
          const line = u.state.doc.lineAt(head);
          setPos({ line: line.number, column: head - line.from + 1 });
        }
      }),
      EditorView.contentAttributes.of({ 'aria-label': label, spellcheck: 'false' }),
    ];
    view.current = new EditorView({ state: EditorState.create({ doc: value, extensions }), parent: host.current! });
    return () => view.current?.destroy();
    // The editor is created once; later prop changes are synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label, placeholder]);

  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const len = v.state.doc.length;
    const range = errorRange ? { from: Math.min(errorRange.start, len), to: Math.min(errorRange.end, len) } : null;
    v.dispatch({ effects: setErrorRange.of(range) });
  }, [errorRange]);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const len = v.state.doc.length;
    const ranges = highlightStage ? (outline.clauses[highlightStage] ?? []) : [];
    v.dispatch({ effects: setClauseRanges.of(ranges.map((r) => ({ from: Math.min(r.start, len), to: Math.min(r.end, len) }))) });
  }, [highlightStage, outline]);

  return (
    <div className="query-editor-wrap">
      <div className="query-editor" ref={host} />
      <div className="cursor-pos" aria-live="off">{positionLabel(pos.line, pos.column)}</div>
    </div>
  );
}
