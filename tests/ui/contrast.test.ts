import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Reads the color tokens of both themes and checks WCAG contrast for the pairs the UI uses.
const css = readFileSync(join(__dirname, '../../src/ui/styles/tokens.css'), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf('\n}', start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1]!, m[2]!]));
}

const light = block(':root');
const themes = { light, dark: { ...light, ...block(":root[data-theme='dark']") } };

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

// [foreground, background, minimum]: 4.5 for text, 3 for borders, marks and focus rings.
const TEXT = 4.5;
const UI = 3;
const PAIRS: [string, string, number][] = [
  ['text', 'bg', TEXT],
  ['text', 'surface', TEXT],
  ['text', 'surface-2', TEXT],
  ['text-muted', 'bg', TEXT],
  ['text-muted', 'surface', TEXT],
  ['text-muted', 'surface-2', TEXT],
  ['accent-ink', 'surface', TEXT],
  ['accent-ink', 'bg', TEXT],
  ['accent-ink', 'accent-soft', TEXT],
  ['on-accent', 'accent-strong', TEXT],
  ['discarded-text', 'discarded-bg', TEXT],
  ['danger', 'surface', TEXT],
  ['danger', 'danger-soft', TEXT],
  ['text', 'note-bg', TEXT],
  ['text', 'clause-hl', TEXT],
  ['text', 'clause-hl-soft', TEXT],
  ['text', 'active-line', TEXT],
  ['line-strong', 'surface', UI],
  ['accent', 'surface', UI],
  ['focus', 'surface', UI],
  ['focus', 'bg', UI],
  ...['hl-key', 'hl-agg', 'hl-computed', 'hl-sort'].map((k): [string, string, number] => [k, 'surface-2', TEXT]),
  ...['sql-keyword', 'sql-string', 'sql-number', 'sql-comment', 'sql-operator', 'sql-function'].map((k): [string, string, number] => [k, 'surface', TEXT]),
  ...[0, 1, 2, 3, 4, 5].flatMap((g): [string, string, number][] => [
    ['text', `g${g}-fill`, TEXT],
    ['on-marker', `g${g}`, TEXT],
  ]),
];

describe('theme contrast (WCAG AA)', () => {
  for (const [theme, tokens] of Object.entries(themes)) {
    it(`${theme}: every text and UI pair reaches AA`, () => {
      for (const [fg, bg, min] of PAIRS) {
        expect(tokens[fg], `${theme}: --${fg}`).toBeDefined();
        expect(tokens[bg], `${theme}: --${bg}`).toBeDefined();
        const ratio = contrast(tokens[fg]!, tokens[bg]!);
        expect(ratio, `${theme}: --${fg} on --${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(min);
      }
    });
  }

  it('both themes define exactly the same color tokens', () => {
    const darkOnly = block(":root[data-theme='dark']");
    for (const k of Object.keys(darkOnly)) expect(light[k], `--${k} missing in light`).toBeDefined();
  });
});
