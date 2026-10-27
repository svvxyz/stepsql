// Where each clause sits in the query text, and which tables it names.
//
// The SQL parser gives no positions, so this is a small tokenizer of its own.
// It never throws: it works on half-typed queries too, because the editor uses
// it to highlight clauses while the user types.

import type { StageId } from '../types';

/** Stages of the full logical order, including those the engine does not run yet (JOIN). */
export type OutlineStage = StageId | 'join';

export interface ClauseRange {
  start: number;
  end: number;
}

export interface QueryOutline {
  clauses: Partial<Record<OutlineStage, ClauseRange[]>>;
  /** Table names after FROM and JOIN, without brackets or schema. */
  tables: string[];
}

type TokenKind = 'word' | 'ident' | 'string' | 'number' | 'open' | 'close' | 'punct';

interface Token {
  kind: TokenKind;
  text: string;
  start: number;
  end: number;
  /** Parenthesis depth the token sits at (an opening parenthesis counts at the outer level). */
  depth: number;
}

function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let depth = 0;
  let i = 0;
  const n = sql.length;
  const push = (kind: TokenKind, start: number, end: number, d = depth) => tokens.push({ kind, text: sql.slice(start, end), start, end, depth: d });

  while (i < n) {
    const c = sql[i]!;
    const next = sql[i + 1];
    if (/\s/.test(c)) {
      i++;
    } else if (c === '-' && next === '-') {
      while (i < n && sql[i] !== '\n') i++;
    } else if (c === '/' && next === '*') {
      // T-SQL block comments nest.
      let level = 0;
      while (i < n) {
        if (sql[i] === '/' && sql[i + 1] === '*') (level++, (i += 2));
        else if (sql[i] === '*' && sql[i + 1] === '/') {
          level--;
          i += 2;
          if (level === 0) break;
        } else i++;
      }
    } else if (c === "'" || ((c === 'N' || c === 'n') && next === "'")) {
      const start = i;
      i += c === "'" ? 1 : 2;
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
        else if (sql[i] === "'") {
          i++;
          break;
        } else i++;
      }
      push('string', start, i);
    } else if (c === '[' || c === '"') {
      const close = c === '[' ? ']' : '"';
      const start = i++;
      while (i < n) {
        if (sql[i] === close && sql[i + 1] === close) i += 2;
        else if (sql[i] === close) {
          i++;
          break;
        } else i++;
      }
      push('ident', start, i);
    } else if (c === '(') {
      push('open', i, i + 1);
      depth++;
      i++;
    } else if (c === ')') {
      depth = Math.max(0, depth - 1);
      push('close', i, i + 1);
      i++;
    } else if (/[A-Za-z_@#À-￿]/.test(c)) {
      const start = i;
      while (i < n && /[\w@#$À-￿]/.test(sql[i]!)) i++;
      push('word', start, i);
    } else if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(next ?? ''))) {
      const start = i;
      while (i < n && /[0-9.eE]/.test(sql[i]!)) i++;
      push('number', start, i);
    } else {
      push('punct', i, i + 1);
      i++;
    }
  }
  return tokens;
}

const AGGREGATES = new Set(['COUNT', 'COUNT_BIG', 'SUM', 'AVG', 'MIN', 'MAX']);
const JOIN_WORDS = new Set(['INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'OUTER']);

const upper = (t: Token | undefined) => (t && t.kind === 'word' ? t.text.toUpperCase() : '');

function unquote(t: Token): string {
  if (t.kind !== 'ident') return t.text;
  const close = t.text[0] === '[' ? ']' : '"';
  return t.text.slice(1, t.text.endsWith(close) ? -1 : undefined).replaceAll(close + close, close);
}

export function queryOutline(sql: string): QueryOutline {
  const tokens = tokenize(sql);
  const clauses: QueryOutline['clauses'] = {};
  const tables: string[] = [];
  const add = (stage: OutlineStage, from: number, to: number) => {
    if (from > to || from < 0 || to >= tokens.length) return;
    (clauses[stage] ??= []).push({ start: tokens[from]!.start, end: tokens[to]!.end });
  };

  // Clause starts at the outermost level, in text order.
  const starts: { stage: OutlineStage; at: number }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.depth !== 0) continue;
    const u = upper(t);
    const nextU = upper(tokens[i + 1]);
    if (u === 'SELECT' || u === 'FROM' || u === 'WHERE' || u === 'HAVING') {
      starts.push({ stage: u === 'SELECT' ? 'select' : u === 'FROM' ? 'from' : u === 'WHERE' ? 'where' : 'having', at: i });
    } else if ((u === 'GROUP' || u === 'ORDER') && nextU === 'BY') {
      starts.push({ stage: u === 'GROUP' ? 'groupBy' : 'orderBy', at: i });
    } else if (u === 'JOIN') {
      let at = i;
      while (at > 0 && JOIN_WORDS.has(upper(tokens[at - 1])) && tokens[at - 1]!.depth === 0) at--;
      starts.push({ stage: 'join', at });
    }
  }

  starts.forEach((s, k) => {
    const last = (k + 1 < starts.length ? starts[k + 1]!.at : tokens.length) - 1;
    if (s.stage !== 'select') {
      add(s.stage, s.at, last);
      if (s.stage === 'from' || s.stage === 'join') {
        let j = s.at + 1;
        while (j <= last && JOIN_WORDS.has(upper(tokens[j]))) j++;
        if (upper(tokens[j]) === 'JOIN') j++;
        // schema.table: the table is the last dotted part.
        let name: string | undefined;
        while (j <= last && (tokens[j]!.kind === 'word' || tokens[j]!.kind === 'ident')) {
          name = unquote(tokens[j]!);
          if (tokens[j + 1]?.text === '.') j += 2;
          else break;
        }
        if (name && !tables.some((x) => x.toLowerCase() === name!.toLowerCase())) tables.push(name);
      }
      return;
    }
    // SELECT [ALL | DISTINCT] [TOP (n) | TOP n [PERCENT] [WITH TIES]] list
    add('select', s.at, s.at);
    let j = s.at + 1;
    if (upper(tokens[j]) === 'DISTINCT') add('distinct', j, j);
    if (upper(tokens[j]) === 'DISTINCT' || upper(tokens[j]) === 'ALL') j++;
    if (upper(tokens[j]) === 'TOP') {
      const topStart = j++;
      if (tokens[j]?.kind === 'open') {
        while (j <= last && !(tokens[j]!.kind === 'close' && tokens[j]!.depth === 0)) j++;
        j++;
      } else if (tokens[j]) j++;
      if (upper(tokens[j]) === 'PERCENT') j++;
      if (upper(tokens[j]) === 'WITH' && upper(tokens[j + 1]) === 'TIES') j += 2;
      add('top', topStart, Math.min(j, last + 1) - 1);
    }
    add('select', j, last);
  });

  // Aggregate calls, wherever they are (SELECT list, HAVING, ORDER BY).
  for (let i = 0; i < tokens.length; i++) {
    if (!AGGREGATES.has(upper(tokens[i])) || tokens[i + 1]?.kind !== 'open') continue;
    const depth = tokens[i + 1]!.depth;
    let j = i + 2;
    while (j < tokens.length && !(tokens[j]!.kind === 'close' && tokens[j]!.depth === depth)) j++;
    add('aggregate', i, Math.min(j, tokens.length - 1));
  }

  if (tokens.length > 0) add('result', 0, tokens.length - 1);
  return { clauses, tables };
}
