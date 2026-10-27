import type { EngineError, ErrorCode, MsgParam } from './types';

/** Internal exception carrying a structured engine error. Never leaves `runStepByStep`. */
export class EngineFailure extends Error {
  constructor(public readonly error: EngineError) {
    super(error.code);
  }
}

export function fail(
  code: ErrorCode,
  params: Record<string, MsgParam> = {},
  sqlServerError?: number,
  location?: { start: number; end: number },
): never {
  const error: EngineError = { code, params };
  if (sqlServerError !== undefined) error.sqlServerError = sqlServerError;
  if (location) error.location = location;
  throw new EngineFailure(error);
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Finds where an identifier or fragment appears in the query (case-insensitive,
 * plain or between brackets), so the UI can underline it.
 */
export function locate(sql: string, text: string): { start: number; end: number } | undefined {
  if (!text) return undefined;
  const e = escapeRegExp(text);
  const patterns = [
    new RegExp(`\\[${e}\\]`, 'i'),
    new RegExp(`(?<![\\w\\[])${e}(?![\\w\\]])`, 'i'),
    new RegExp(e, 'i'),
  ];
  for (const re of patterns) {
    const m = re.exec(sql);
    if (m) return { start: m.index, end: m.index + m[0].length };
  }
  return undefined;
}
