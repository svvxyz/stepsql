// Translation of the engine's language-neutral output (message keys, error
// codes, values) into the active language.

import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import type { ColumnType, EngineError, MessageRef, MsgParam, Value } from '../engine';

const OPEN = '\u0001';
const CLOSE = '\u0002';

const isSql = (p: unknown): p is { sql: string } => typeof p === 'object' && p !== null && 'sql' in p;

function list(items: string[], lang: string): string {
  try {
    return new Intl.ListFormat(lang, { type: 'conjunction' }).format(items);
  } catch {
    return items.join(', ');
  }
}

function prepare(params: Record<string, MsgParam> | undefined, lang: string, t: TFunction): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === null) out[k] = 'NULL';
    else if (isSql(v)) out[k] = `${OPEN}${v.sql}${CLOSE}`;
    else if (Array.isArray(v)) out[k] = list(v.map((x) => (isSql(x) ? `${OPEN}${x.sql}${CLOSE}` : String(x))), lang);
    else out[k] = v;
  }
  if (typeof out.feature === 'string') out.feature = featureName(out.feature, t);
  return out;
}

function featureName(feature: string, t: TFunction): string {
  const id = feature.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (feature.endsWith('()')) return t('feature.function', { name: `${OPEN}${feature}${CLOSE}` });
  const key = `feature.${id}`;
  const translated = t(key, { defaultValue: '' });
  return translated || `${OPEN}${feature}${CLOSE}`;
}

/** Renders a translated string, turning SQL fragments into <code> elements. */
export function rich(text: string): ReactNode {
  if (!text.includes(OPEN)) return text;
  const parts = text.split(new RegExp(`${OPEN}([\\s\\S]*?)${CLOSE}`));
  return parts.map((p, i) => (i % 2 === 1 ? <code key={i} className="sql-inline">{p}</code> : p));
}

export function messageText(m: MessageRef, t: TFunction, lang: string): ReactNode {
  return rich(t(m.key, prepare(m.params, lang, t)));
}

export function errorText(e: EngineError, t: TFunction, lang: string): ReactNode {
  return rich(t(`error.${e.code}`, prepare(e.params, lang, t)));
}

/** Plain text version (for titles and aria labels). */
export function plain(text: string): string {
  return text.replaceAll(OPEN, '').replaceAll(CLOSE, '');
}

const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();

export function formatNumber(n: number, lang: string): string {
  let f = numberFormats.get(lang);
  if (!f) {
    f = new Intl.NumberFormat(lang, { maximumFractionDigits: 10 });
    numberFormats.set(lang, f);
  }
  return f.format(n);
}

export function formatValue(v: Value, type: ColumnType, lang: string): string {
  if (v === null) return 'NULL';
  if (typeof v === 'number') return formatNumber(v, lang);
  if (type === 'date') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (m) {
      let f = dateFormats.get(lang);
      if (!f) {
        f = new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeZone: 'UTC' });
        dateFormats.set(lang, f);
      }
      return f.format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))));
    }
  }
  return v;
}
