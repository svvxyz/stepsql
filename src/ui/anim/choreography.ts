// What each stage's animation shows. The step is rendered in its final state;
// a choreography uses the Player to show how the data gets there.
//
// - WHERE / HAVING: rows are tested one by one; the comparison appears next to
//   the row, rows that fail get struck and then removed.
// - ORDER BY: the result is built one row at a time: the next row in order
//   lights up and slides to its place while the others make room.
// - SELECT (with the work table rendered by SelectWorkTable): columns that are
//   not projected leave one by one, computed columns fill row by row with their
//   calculation, aliases replace their expression, columns settle in SELECT order.
// - GROUP BY: rows are read one by one; the key value opens a new group or adds to one; then
//   the rows gather into their blocks.
// - Aggregates (with the GROUP BY blocks rendered by StepCard): group by group, the formula is
//   written as the rows are read, a running total counts up, and the block folds into one row.
// - DISTINCT and TOP: duplicates merge into the row they repeat; rows past the cut leave.

import type { AggregateCalc, RowLineage, Step, StageId, Value } from '../../engine';
import type { Player } from './player';

export type Speed = 'slow' | 'normal' | 'fast';
export const SPEED_FACTOR: Record<Speed, number> = { slow: 2.5, normal: 1, fast: 0.5 };

/** Rows animated one by one before the rest is resolved at once. */
export const ANIMATED_ROWS_LIMIT = 50;
/** The first rows go slowly so the idea is clear; then the pace picks up. */
const SLOW_ROWS = 10;

export interface Labels {
  result: (r: boolean | null) => string;
  value: (v: Value) => string;
  /** "1 row", "3 rows" in the interface language. */
  rows: (n: number) => string;
  /** Tag shown when a row opens a new group. */
  newGroup: string;
}

/** FROM only reads the table and the result only shows it: there is nothing to animate. */
export const ANIMATED_STAGES: ReadonlySet<StageId> = new Set(['where', 'groupBy', 'aggregate', 'having', 'select', 'distinct', 'orderBy', 'top']);

export interface AnimContext {
  player: Player;
  root: HTMLElement;
  scroller: HTMLElement | null;
  step: Step;
  prev: Step | undefined;
  /** Duration multiplier from the speed setting. */
  f: number;
  labels: Labels;
}

const bodyRows = (root: HTMLElement) => [...root.querySelectorAll<HTMLTableRowElement>('.step-scroll tbody tr[data-key]')];
const lineageOf = (step: Step, el: HTMLElement): RowLineage | undefined => step.lineage?.[Number(el.dataset.index)];
const cssVar = (el: HTMLElement, name: string) => getComputedStyle(el).getPropertyValue(name).trim() || 'transparent';

/** Scrolls the table (not the page) so the row is in view below the sticky header. */
function reveal(scroller: HTMLElement | null, row: HTMLElement) {
  if (!scroller) return;
  const head = scroller.querySelector('thead')?.getBoundingClientRect().height ?? 0;
  const top = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
  const view = scroller.clientHeight;
  if (top < scroller.scrollTop + head || top + row.offsetHeight > scroller.scrollTop + view) {
    scroller.scrollTop = Math.max(0, top - head - view * 0.3);
  }
}

/** Top of a row inside the scroller's content. */
function rowTop(scroller: HTMLElement | null, row: HTMLElement): number {
  if (!scroller) return row.offsetTop;
  return row.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
}

export function choreograph(ctx: AnimContext): void {
  switch (ctx.step.stage) {
    case 'where':
    case 'having':
      return testRows(ctx);
    case 'orderBy':
      return buildOrder(ctx);
    case 'select':
      return selectColumns(ctx);
    case 'groupBy':
      return buildGroups(ctx);
    case 'aggregate':
      return computeAggregates(ctx);
    case 'distinct':
      return mergeDuplicates(ctx);
    case 'top':
      return cutRows(ctx);
  }
}

/* ---------------- WHERE / HAVING ---------------- */

function testRows({ player: p, root, scroller, step, f, labels }: AnimContext) {
  const rows = bodyRows(root);
  const tested = rows.slice(0, ANIMATED_ROWS_LIMIT);
  const rest = rows.slice(ANIMATED_ROWS_LIMIT);
  // Discarded rows look like any other row until their turn.
  for (const r of rows) if (r.classList.contains('discarded')) p.data(r, 'anim', 'wait');
  if (scroller) scroller.scrollTop = 0;

  const badge = p.add(document.createElement('div'));
  badge.className = 'eval-badge';
  badge.setAttribute('aria-hidden', 'true');
  scroller?.append(badge);

  let t = 120 * f;
  tested.forEach((row, i) => {
    const T = (i < SLOW_ROWS ? 1300 : 300) * f;
    const lin = lineageOf(step, row);
    const test = lin?.test;
    const failed = row.classList.contains('discarded');
    const cells = (test?.columns ?? []).map((c) => row.querySelector<HTMLElement>(`td[data-col="${c}"]`)).filter((c): c is HTMLElement => !!c);

    p.at(t, () => {
      reveal(scroller, row);
      p.data(row, 'scan', '1');
      cells.forEach((c) => p.data(c, 'scanCell', '1'));
      if (test) {
        badge.textContent = '';
        const code = document.createElement('code');
        code.textContent = test.sql;
        const verdict = document.createElement('strong');
        verdict.textContent = ` → ${labels.result(test.result)}`;
        badge.append(code, verdict);
        badge.className = `eval-badge ${test.result === true ? 'pass' : test.result === null ? 'unknown' : 'fail'}`;
        badge.style.top = `${rowTop(scroller, row) + row.offsetHeight / 2}px`;
        p.animate(badge, [{ opacity: 0, transform: 'translate(8px, -50%)' }, { opacity: 1, transform: 'translate(0, -50%)' }], { duration: Math.min(250, T * 0.3) });
      }
    });
    p.at(t + T * 0.45, () => p.data(row, 'anim', failed ? 'fail' : 'pass'));
    if (failed) {
      // The struck row fades, then leaves; the rows below slide up into its place.
      p.at(t + T * 0.7, () => p.animate(row, [{ opacity: 1 }, { opacity: 0.15 }], { duration: T * 0.2 }));
      p.at(t + T * 0.9, () => {
        const below = rows.filter((r) => r.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_PRECEDING && r.dataset.anim !== 'gone');
        const before = below.map((r) => r.getBoundingClientRect().top);
        p.data(row, 'anim', 'gone');
        p.data(row, 'scan', null);
        cells.forEach((c) => p.data(c, 'scanCell', null));
        badge.className = 'eval-badge hidden';
        below.forEach((r, k) => {
          const dy = before[k]! - r.getBoundingClientRect().top;
          if (Math.abs(dy) > 0.5) p.animate(r, [{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: Math.max(120, T * 0.25), fill: 'none' });
        });
      });
    } else {
      p.at(t + T * 0.9, () => {
        p.data(row, 'scan', null);
        cells.forEach((c) => p.data(c, 'scanCell', null));
        badge.className = 'eval-badge hidden';
      });
    }
    t += T;
  });
  // Rows past the limit are resolved at once.
  p.at(t, () => rest.forEach((r) => r.classList.contains('discarded') && p.data(r, 'anim', 'gone')));
  p.hold(t + 400 * f);
}

/* ---------------- ORDER BY ---------------- */

function buildOrder({ player: p, root, scroller, step, prev, f, labels }: AnimContext) {
  const rows = bodyRows(root);
  if (rows.length < 2) return;
  const prevIndex = new Map<string, number>();
  let n = 0;
  prev?.rows.forEach((r, i) => {
    if (r.status !== 'discarded') prevIndex.set(prev.lineage?.[i]?.key ?? '', n++);
  });
  const finalTop = rows.map((r) => rowTop(scroller, r));
  // Slot heights from the real layout (collapsed borders make offsetHeight drift by fractions of a pixel).
  const heights = rows.map((r, i) => (i + 1 < rows.length ? finalTop[i + 1]! - finalTop[i]! : r.offsetHeight));
  const base = finalTop[0]!;
  const keyOf = (r: HTMLElement) => r.dataset.key ?? '';

  /** Moves every row to the slot it has in `order` (row indexes in visual order). */
  const place = (order: number[], ms: number) => {
    let y = base;
    for (const idx of order) {
      const r = rows[idx]!;
      p.style(r, 'transition', ms > 0 ? `transform ${ms}ms cubic-bezier(0.3, 0.7, 0.2, 1)` : 'none');
      p.style(r, 'transform', `translateY(${y - finalTop[idx]!}px)`);
      y += heights[idx]!;
    }
  };

  // The value each row is sorted by, shown beside the row being placed (the key may not be a visible column).
  const badge = p.add(document.createElement('div'));
  badge.className = 'eval-badge sort';
  badge.setAttribute('aria-hidden', 'true');
  scroller?.append(badge);
  const keyText = (r: HTMLElement) =>
    (step.sort ?? []).map((s, i) => `${s.sql} = ${labels.value(lineageOf(step, r)?.sortKeys?.[i] ?? null)} ${s.dir === 'DESC' ? '▼' : '▲'}`).join(' · ');

  const initial = rows.map((_, i) => i).sort((a, b) => (prevIndex.get(keyOf(rows[a]!)) ?? a) - (prevIndex.get(keyOf(rows[b]!)) ?? b));
  p.at(0, () => {
    place(initial, 0);
    p.data(root, 'sorting', '1');
    if (scroller) scroller.scrollTop = 0;
  });

  const oneByOne = Math.min(rows.length, 24);
  let t = 500 * f;
  let placed: number[] = [];
  for (let k = 0; k < oneByOne; k++) {
    const T = (k < SLOW_ROWS ? 1400 : 380) * f;
    const row = rows[k]!;
    p.at(t, () => {
      p.data(row, 'anim', 'pick');
      reveal(scroller, row);
      badge.textContent = keyText(row);
      badge.classList.remove('hidden');
      badge.style.top = `${row.getBoundingClientRect().top - (scroller?.getBoundingClientRect().top ?? 0) + (scroller?.scrollTop ?? 0) + row.offsetHeight / 2}px`;
    });
    p.at(t + T * 0.3, () => {
      placed = [...placed, k];
      const remaining = initial.filter((i) => !placed.includes(i));
      place([...placed, ...remaining], T * 0.55);
      // The badge travels with the row to its slot.
      badge.style.transition = `top ${T * 0.55}ms cubic-bezier(0.3, 0.7, 0.2, 1)`;
      badge.style.top = `${finalTop[k]! + heights[k]! / 2}px`;
    });
    p.at(t + T * 0.95, () => {
      p.data(row, 'anim', 'placed');
      badge.classList.add('hidden');
      badge.style.transition = '';
    });
    t += T;
  }
  if (oneByOne < rows.length) {
    // The rest of a long table falls into place at once.
    p.at(t, () => {
      badge.classList.add('hidden');
      place(rows.map((_, i) => i), 700 * f);
    });
    t += 800 * f;
  }
  p.hold(t + 300 * f);
}

/* ---------------- SELECT ---------------- */

function selectColumns({ player: p, root, step, f }: AnimContext) {
  const table = root.querySelector<HTMLTableElement>('table.work-table');
  if (!table) return appear({ player: p, root, scroller: null, step, prev: undefined, f, labels: { result: String, value: String, rows: String, newGroup: '' } });
  const col = (key: string) => [...table.querySelectorAll<HTMLElement>(`[data-colkey="${key}"]`)];
  const th = (key: string) => table.querySelector<HTMLElement>(`th[data-colkey="${key}"]`)!;
  const keys = [...table.querySelectorAll<HTMLElement>('thead th[data-colkey]')].map((h) => h.dataset.colkey!);
  const dropped = keys.filter((k) => th(k).dataset.role === 'dropped');
  const computed = keys.filter((k) => th(k).dataset.role === 'computed');
  const aliased = keys.filter((k) => th(k).dataset.alias === 'from');
  const width = new Map(keys.map((k) => [k, th(k).getBoundingClientRect().width]));

  // Computed columns start closed; their cells start empty.
  p.at(0, () => {
    for (const k of computed) {
      col(k).forEach((c) => p.data(c, 'anim', 'col-hidden'));
      table.querySelectorAll<HTMLElement>(`td[data-colkey="${k}"]`).forEach((c) => p.data(c, 'empty', '1'));
    }
  });

  let t = 400 * f;
  // 1. Columns that are not projected are struck, then close, one by one.
  for (const k of dropped) {
    const T = 1100 * f;
    p.at(t, () => col(k).forEach((c) => p.data(c, 'anim', 'leaving')));
    p.at(t + T * 0.45, () => {
      const w = width.get(k) ?? 80;
      col(k).forEach((c) => {
        const inner = c.querySelector('.cv');
        if (inner) p.animate(inner, [{ maxWidth: `${w}px`, opacity: 0.6 }, { maxWidth: '0px', opacity: 0 }], { duration: T * 0.45 });
        p.animate(c, [{ paddingLeft: '12px', paddingRight: '12px' }, { paddingLeft: '0px', paddingRight: '0px' }], { duration: T * 0.45 });
      });
    });
    p.at(t + T * 0.95, () => col(k).forEach((c) => p.data(c, 'anim', 'gone-col')));
    t += T;
  }

  // 2. Computed columns open empty and fill row by row; the first rows show the calculation.
  for (const k of computed) {
    p.at(t, () => {
      const w = width.get(k) ?? 80;
      col(k).forEach((c) => {
        p.data(c, 'anim', 'col-new');
        const inner = c.querySelector('.cv');
        if (inner) p.animate(inner, [{ maxWidth: '0px' }, { maxWidth: `${w}px` }], { duration: 500 * f, fill: 'none' });
        p.animate(c, [{ paddingLeft: '0px', paddingRight: '0px' }, { paddingLeft: '12px', paddingRight: '12px' }], { duration: 500 * f, fill: 'none' });
      });
    });
    t += 600 * f;
    const cells = [...table.querySelectorAll<HTMLElement>(`td[data-colkey="${k}"]`)];
    cells.forEach((cell, i) => {
      const slow = i < 4;
      const T = (slow ? 1200 : 90) * f;
      const start = t;
      p.at(start, () => {
        const calc = cell.dataset.calc;
        if (slow && calc) {
          const tip = p.add(document.createElement('span'));
          tip.className = 'calc-tip';
          tip.textContent = `${calc} =`;
          cell.prepend(tip);
          p.animate(tip, [{ opacity: 0 }, { opacity: 1 }], { duration: T * 0.25 });
          p.at(start + T * 0.85, () => tip.remove());
        }
        p.at(start + (slow ? T * 0.45 : 0), () => {
          p.data(cell, 'empty', null);
          p.animate(cell, [{ backgroundColor: cssVar(root, '--accent-soft') }, { backgroundColor: 'transparent' }], { duration: Math.max(300, T), fill: 'none' });
        });
      });
      t += T;
    });
    t += 200 * f;
  }

  // 3. Aliases replace their expression in the header.
  for (const k of aliased) {
    const h = th(k);
    p.at(t, () => {
      p.data(h, 'alias', 'to');
      const to = h.querySelector('.h-to');
      if (to) p.animate(to, [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 600 * f });
    });
    t += 900 * f;
  }

  // 4. Columns settle in the order of the SELECT list.
  p.at(t, () => {
    const live = keys.filter((k) => th(k).dataset.anim !== 'gone-col');
    const target = [...live].sort((a, b) => Number(th(a).dataset.out) - Number(th(b).dataset.out));
    if (target.every((k, i) => k === live[i])) return;
    const left = new Map(live.map((k) => [k, th(k).getBoundingClientRect().left]));
    let x = Math.min(...live.map((k) => left.get(k)!));
    for (const k of target) {
      const dx = x - left.get(k)!;
      col(k).forEach((c) => {
        p.style(c, 'transition', `transform ${900 * f}ms cubic-bezier(0.3, 0.7, 0.2, 1)`);
        p.style(c, 'transform', `translateX(${dx}px)`);
        p.style(c, 'position', 'relative');
        p.style(c, 'z-index', '1');
      });
      x += th(k).getBoundingClientRect().width;
    }
  });
  p.hold(t + 1100 * f);
}

/* ---------------- Other stages ---------------- */

function appear({ player: p, root, f }: AnimContext) {
  const rows = bodyRows(root).slice(0, ANIMATED_ROWS_LIMIT);
  const s = rows.length > 1 ? Math.min(40, (500 * f) / rows.length) : 0;
  rows.forEach((r, i) => p.animate(r, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 400 * f, delay: i * s }));
  p.hold(400 * f + rows.length * s);
}

function buildGroups({ player: p, root, scroller, step, prev, f, labels }: AnimContext) {
  // The table starts as the previous step left it: no colors, no blocks, the
  // groups panel empty. Rows are read one by one; the value of the key decides
  // the group: a new value opens a group, a known one adds a row to it. At the
  // end the rows gather into their blocks.
  const rows = bodyRows(root);
  if (rows.length === 0) return;
  const heads = [...root.querySelectorAll<HTMLElement>('tr.group-head')];
  const cards = new Map([...root.querySelectorAll<HTMLElement>('.group-card[data-group]')].map((c) => [c.dataset.group!, c]));

  const prevIndex = new Map<string, number>();
  let n = 0;
  prev?.rows.forEach((r, i) => {
    if (r.status !== 'discarded') prevIndex.set(prev.lineage?.[i]?.key ?? '', n++);
  });
  const finalTop = rows.map((r) => rowTop(scroller, r));
  const heights = rows.map((r) => r.offsetHeight);
  const order = rows.map((_, i) => i).sort((a, b) => (prevIndex.get(rows[a]!.dataset.key!) ?? a) - (prevIndex.get(rows[b]!.dataset.key!) ?? b));
  // Rows sit stacked in the previous step's order, starting where the first block starts.
  const start = Math.min(...heads.map((h) => rowTop(scroller, h)), ...finalTop);

  const badge = p.add(document.createElement('div'));
  badge.className = 'eval-badge hidden';
  badge.setAttribute('aria-hidden', 'true');
  scroller?.append(badge);

  const counts = new Map<string, number>();
  const counters = new Map<string, HTMLElement>();

  p.at(0, () => {
    heads.forEach((h) => p.data(h, 'anim', 'ghost'));
    cards.forEach((c) => p.data(c, 'anim', 'gone'));
    let y = start;
    for (const i of order) {
      const r = rows[i]!;
      p.data(r, 'anim', 'pending');
      p.style(r, 'transform', `translateY(${y - finalTop[i]!}px)`);
      y += heights[i]!;
    }
    if (scroller) scroller.scrollTop = 0;
  });

  let t = 300 * f;
  order.forEach((i, k) => {
    const T = (k < SLOW_ROWS ? 1100 : 220) * f;
    const row = rows[i]!;
    const group = step.rows[Number(row.dataset.index)]?.groupId;
    const g = group === undefined ? undefined : String(group);
    const keyCells = [...row.querySelectorAll<HTMLElement>('td.hl-groupKey')];
    p.at(t, () => {
      reveal(scroller, row);
      badge.classList.add('hidden');
      p.data(row, 'scan', '1');
      keyCells.forEach((c) => p.data(c, 'scanCell', '1'));
    });
    p.at(t + T * 0.4, () => {
      p.data(row, 'anim', null);
      if (g === undefined) return;
      const count = (counts.get(g) ?? 0) + 1;
      counts.set(g, count);
      const card = cards.get(g);
      if (card && count === 1) {
        p.data(card, 'anim', null);
        p.animate(card, [{ opacity: 0, transform: 'translateX(12px)' }, { opacity: 1, transform: 'none' }], { duration: Math.max(150, T * 0.4), fill: 'none' });
        const countEl = card.querySelector<HTMLElement>('.group-count');
        if (countEl) {
          const overlay = p.add(document.createElement('span'));
          overlay.className = 'anim-counter';
          overlay.setAttribute('aria-hidden', 'true');
          countEl.append(overlay);
          p.data(countEl, 'counting', '1');
          counters.set(g, overlay);
        }
      }
      const counter = counters.get(g);
      if (counter) counter.textContent = labels.rows(count);
      if (k < SLOW_ROWS) {
        badge.textContent = '';
        const key = document.createElement('code');
        key.textContent = keyCells.map((c) => c.textContent).join(', ');
        const verdict = document.createElement('strong');
        verdict.textContent = ` → G${Number(g) + 1} ${count === 1 ? labels.newGroup : '+1'}`;
        badge.append(key, verdict);
        badge.className = `eval-badge group ${row.className.match(/\bg\d\b/)?.[0] ?? ''}`;
        badge.style.top = `${rowTop(scroller, row) + row.offsetHeight / 2}px`;
      } else badge.classList.add('hidden');
    });
    p.at(t + T * 0.9, () => {
      p.data(row, 'scan', null);
      keyCells.forEach((c) => p.data(c, 'scanCell', null));
    });
    t += T;
  });

  // The rows gather into their blocks and the block headers appear.
  const move = 1400 * f;
  p.at(t, () => {
    badge.classList.add('hidden');
    if (scroller) scroller.scrollTop = 0;
    rows.forEach((r) => {
      p.style(r, 'transition', `transform ${move}ms cubic-bezier(0.3, 0.7, 0.2, 1)`);
      p.style(r, 'transform', 'translateY(0px)');
    });
  });
  p.at(t + move * 0.7, () => heads.forEach((h) => p.data(h, 'anim', null)));
  p.hold(t + move + 300 * f);
}

function computeAggregates({ player: p, root, scroller, step, f, labels }: AnimContext) {
  // Starts from the GROUP BY blocks (rendered by StepCard while this plays).
  // Group by group: the values the aggregate reads light up row by row while
  // its formula is written term by term and a running total counts in the
  // block header; then the block folds into one row.
  const work = root.querySelector<HTMLElement>('.agg-work');
  if (!work) return;
  const groups = step.groups ?? [];
  const cols = [...work.querySelectorAll<HTMLElement>('thead th[data-col]')];
  const colIndex = (sql: string) => {
    const inner = /\((?:DISTINCT\s+)?(.*)\)$/i.exec(sql)?.[1]?.replace(/^\[(.*)\]$/, '$1').toLowerCase();
    return cols.findIndex((th) => th.querySelector('.col-name')?.textContent?.toLowerCase() === inner);
  };
  if (scroller) scroller.scrollTop = 0;
  // Every formula starts blank; each one is written when its group's turn comes.
  p.at(0, () =>
    root.querySelectorAll<HTMLElement>('.group-card .formula > *').forEach((el) => p.data(el, 'anim', 'hidden-term')),
  );

  let t = 300 * f;
  groups.forEach((g, gi) => {
    const head = work.querySelector<HTMLElement>(`tr.group-head[data-group="${g.id}"]`);
    const rows: HTMLElement[] = [];
    for (let el = head?.nextElementSibling; el && !el.classList.contains('group-head'); el = el.nextElementSibling) {
      if (el instanceof HTMLElement && el.dataset.key) rows.push(el);
    }
    const card = root.querySelector<HTMLElement>(`.group-card[data-group="${g.id}"]`);
    // The formula's pieces in reading order (terms, operators, result); term k belongs to row k.
    const parts = card ? [...card.querySelectorAll<HTMLElement>('.formula > *')] : [];
    const termAt = parts.flatMap((el, i) => (el.matches('.val, .null-term') ? [i] : []));
    const results = parts.filter((el) => el.classList.contains('result'));
    const calcs = g.aggregates ?? [];
    const per = (gi === 0 ? 700 : 120) * f;
    const T = Math.min(gi === 0 ? 12000 * f : 2000 * f, per * Math.max(1, rows.length));
    const step_ = rows.length ? T / rows.length : T;

    p.at(t, () => {
      if (head) {
        reveal(scroller, head);
        p.data(head, 'scan', '1');
      }
      if (card) p.data(card, 'scan', '1');
    });
    const overlay = head ? p.add(document.createElement('span')) : null;
    if (overlay && head) {
      overlay.className = 'head-calc';
      overlay.setAttribute('aria-hidden', 'true');
      p.at(t, () => head.querySelector('.group-key')?.after(overlay));
    }

    rows.forEach((r, k) => {
      const at = t + k * step_;
      const cells = calcs.map((c) => (c.star ? null : r.querySelector<HTMLElement>(`td[data-col="${colIndex(c.sql)}"]`)));
      p.at(at, () => {
        reveal(scroller, r);
        p.data(r, 'scan', '1');
        cells.forEach((c) => c && p.data(c, 'scanCell', '1'));
        // Each row writes its term (and the operator before it); a cut formula shows "… +N" after its last visible term.
        const upto = k < termAt.length ? termAt[k]! : -1;
        if (upto >= 0) parts.slice(0, upto + 1).forEach((el) => el.dataset.anim === 'hidden-term' && p.data(el, 'anim', null));
        if (overlay) overlay.textContent = calcs.map((c) => `${c.sql} = ${labels.value(running(c, k + 1))}`).join(' · ');
      });
      p.at(at + step_ * 0.85, () => {
        p.data(r, 'scan', null);
        cells.forEach((c) => c && p.data(c, 'scanCell', null));
      });
    });
    t += T;
    p.at(t, () => {
      parts.forEach((el) => p.data(el, 'anim', null));
      results.forEach((el) => {
        p.animate(el, [{ transform: 'scale(0.6)', opacity: 0 }, { transform: 'scale(1.2)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 400 * f, fill: 'none' });
      });
      if (overlay) overlay.textContent = calcs.map((c) => `${c.sql} = ${labels.value(c.result)}`).join(' · ');
      // The block folds into its header row.
      rows.forEach((r) => p.animate(r, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scaleY(0.3)' }], { duration: 450 * f }));
    });
    p.at(t + 460 * f, () => {
      rows.forEach((r) => p.data(r, 'anim', 'gone'));
      if (head) p.data(head, 'scan', null);
      if (card) p.data(card, 'scan', null);
    });
    t += 700 * f;
  });
  p.hold(t + 300 * f);
}

/** The aggregate's value after its first `n` inputs, to count up while the rows are read. */
function running(c: AggregateCalc, n: number): Value {
  const seen = c.inputs.slice(0, n);
  if (c.star) return n;
  const values = seen.filter((v): v is number | string => v !== null);
  if (c.fn === 'COUNT') return values.length;
  if (values.length === 0) return null;
  const nums = values.filter((v): v is number => typeof v === 'number');
  switch (c.fn) {
    case 'SUM':
      return round(nums.reduce((a, b) => a + b, 0));
    case 'AVG':
      return round(nums.reduce((a, b) => a + b, 0) / (nums.length || 1));
    case 'MIN':
      return values.reduce((a, b) => (compare(a, b) <= 0 ? a : b));
    case 'MAX':
      return values.reduce((a, b) => (compare(a, b) >= 0 ? a : b));
  }
}

const round = (x: number) => Math.round(x * 1e6) / 1e6;
const compare = (a: number | string, b: number | string) =>
  typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { sensitivity: 'accent' });

function mergeDuplicates({ player: p, root, step, f }: AnimContext) {
  // A duplicate slides onto the row it repeats and melts into it.
  const rows = bodyRows(root);
  const byKey = new Map(rows.map((r) => [r.dataset.key!, r]));
  const D = 1400 * f;
  let t = 200 * f;
  for (const r of rows.slice(0, ANIMATED_ROWS_LIMIT)) {
    const to = byKey.get(lineageOf(step, r)?.mergedInto ?? '');
    if (!to) continue;
    p.data(r, 'anim', 'wait');
    p.at(t, () => {
      const dy = to.offsetTop - r.offsetTop;
      p.animate(r, [{ transform: 'none', opacity: 1 }, { transform: `translateY(${dy}px)`, opacity: 0.1, offset: 0.6 }, { transform: 'none', opacity: 0.1, offset: 0.65 }, { transform: 'none', opacity: 1 }], { duration: D });
      p.animate(to, [{ boxShadow: 'none' }, { boxShadow: `inset 0 0 0 2px ${cssVar(root, '--accent')}`, offset: 0.6 }, { boxShadow: 'none' }], { duration: D, fill: 'none' });
    });
    p.at(t + D * 0.62, () => p.data(r, 'anim', null));
    t += D * 0.4;
  }
  p.hold(t + D);
}

function cutRows({ player: p, root, f }: AnimContext) {
  // The cut line drops in; rows past it leave one after another.
  const rows = bodyRows(root);
  const cut = root.querySelector<HTMLElement>('tr.cut-first');
  if (cut) p.animate(cut, [{ transform: 'translateY(-10px)', opacity: 0.3 }, { transform: 'none', opacity: 1 }], { duration: 500 * f, delay: 200 * f });
  const out = rows.filter((r) => r.classList.contains('discarded')).slice(0, ANIMATED_ROWS_LIMIT);
  const s = out.length > 1 ? Math.min(120, (900 * f) / out.length) : 0;
  out.forEach((r, i) => {
    const at = 700 * f + i * s;
    p.data(r, 'anim', 'wait');
    p.at(at, () => p.data(r, 'anim', null));
    p.animate(r, [{ transform: 'none' }, { transform: 'translateX(14px)', offset: 0.5 }, { transform: 'none' }], { duration: 500 * f, delay: at });
  });
  p.hold(700 * f + out.length * s + 600 * f);
}
