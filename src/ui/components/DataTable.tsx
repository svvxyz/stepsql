import { Fragment, useState, type ReactNode, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import type { Group, Step, StepRow } from '../../engine';
import { formatValue, messageText } from '../messages';
import { groupKeyTypes, lineageAt } from '../stepUtils';

/** Six marker tones; the short label (G1, G2…) keeps groups apart without relying on color. */
export const GROUP_COLORS = 6;
export const groupClass = (id: number | undefined) => (id === undefined ? '' : `g${id % GROUP_COLORS}`);
export const groupLabel = (id: number) => `G${id + 1}`;

export function GroupTag({ id }: { id: number }) {
  return <span className={`gtag ${groupClass(id)}`}>{groupLabel(id)}</span>;
}

export type RowFilter = 'all' | 'kept' | 'discarded';

/** Above this many rows, big groups start collapsed. */
const COLLAPSE_TOTAL = 60;
const COLLAPSE_GROUP = 10;

interface Props {
  step: Step;
  filter?: RowFilter;
  /** Show the per-row "Reason" column (WHERE shows one summary instead). */
  reasons?: boolean;
  /** GROUP BY: one block per group, with a header and a collapse toggle. */
  groupBlocks?: boolean;
  /** TOP: index of the first row left out, where the cut line is drawn. */
  cutAt?: number | undefined;
  /** Extra line under a column header (SELECT: the expression behind an alias). */
  headerNote?: (index: number) => ReactNode;
  /** Columns that are new in this step. */
  newColumns?: boolean[];
  scrollRef?: Ref<HTMLDivElement>;
}

export function DataTable({ step, filter = 'all', reasons, groupBlocks, cutAt, headerNote, newColumns, scrollRef }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const showReasons = (reasons ?? true) && step.rows.some((r) => r.status === 'discarded');
  const hasGroups = step.rows.some((r) => r.groupId !== undefined);
  const sortDir = new Map(step.sort?.map((s) => [s.sql.toLowerCase(), s.dir]) ?? []);
  const width = step.columns.length + (showReasons ? 1 : 0) + (hasGroups ? 1 : 0);
  const groups = step.groups ?? [];
  const [collapsed, setCollapsed] = useState<Set<number>>(
    () => new Set(groupBlocks && step.rows.length > COLLAPSE_TOTAL ? groups.filter((g) => g.rowIds.length > COLLAPSE_GROUP).map((g) => g.id) : []),
  );

  const visible = (r: StepRow) => filter === 'all' || (filter === 'kept' ? r.status !== 'discarded' : r.status === 'discarded');

  const renderRow = (r: StepRow, index: number) => {
    const lin = lineageAt(step, index);
    const decisive = new Set(lin.decisive ?? []);
    const evaluated = r.reason?.params?.evaluated;
    const evaluatedText = evaluated && typeof evaluated === 'object' && 'sql' in evaluated ? evaluated.sql : undefined;
    const cls = [r.status, groupClass(r.groupId), cutAt === index ? 'cut-first' : ''].join(' ');
    return (
      <tr
        key={lin.key}
        className={cls}
        data-key={lin.key}
        data-index={index}
      >
        {hasGroups && <td className="group-col">{r.groupId !== undefined && <GroupTag id={r.groupId} />}</td>}
        {r.values.map((v, i) => {
          const col = step.columns[i]!;
          const numeric = col.type === 'int' || col.type === 'decimal';
          const isDecisive = decisive.has(i);
          const cellCls = [numeric ? 'num' : '', v === null ? 'null' : '', col.highlight ? `hl-${col.highlight}` : '', isDecisive ? 'decisive' : '', newColumns?.[i] ? 'new-col' : ''].join(' ');
          return (
            <td key={i} className={cellCls} data-col={i} title={isDecisive ? evaluatedText : undefined}>
              {i === 0 && !showReasons && r.status === 'discarded' && <span className="sr-only">{t('steps.discarded')}: </span>}
              {formatValue(v, col.type, lang)}
              {isDecisive && evaluatedText && <span className="sr-only"> ({evaluatedText})</span>}
            </td>
          );
        })}
        {showReasons && (
          <td className="reason">
            {r.status === 'discarded' && r.reason ? (
              <>
                <span className="sr-only">{t('steps.discarded')}: </span>
                {messageText(r.reason, t, lang)}
              </>
            ) : null}
          </td>
        )}
      </tr>
    );
  };

  const keyTypes = groupBlocks ? groupKeyTypes(step) : [];
  const groupHead = (g: Group) => {
    const isCollapsed = collapsed.has(g.id);
    return (
      <tr className={`group-head ${groupClass(g.id)}`} data-group={g.id}>
        <td colSpan={width}>
          <button
            type="button"
            className="group-toggle"
            aria-expanded={!isCollapsed}
            onClick={() =>
              setCollapsed((s) => {
                const n = new Set(s);
                if (n.has(g.id)) n.delete(g.id);
                else n.add(g.id);
                return n;
              })
            }
          >
            <span className="chevron" aria-hidden="true">{isCollapsed ? '▸' : '▾'}</span>
            <GroupTag id={g.id} />
            <span className="group-key">
              {g.key.length === 0
                ? t('steps.wholeTable')
                : g.key.map((v, i) => (
                    <Fragment key={i}>
                      {i > 0 && ', '}
                      <code>{g.keySql[i]}</code> = <strong>{formatValue(v, keyTypes[i] ?? 'text', lang)}</strong>
                    </Fragment>
                  ))}
            </span>
            <span className="group-count">{t('common.rows', { count: g.rowIds.length })}</span>
          </button>
        </td>
      </tr>
    );
  };

  let body: ReactNode;
  if (step.rows.length === 0) {
    body = (
      <tr>
        <td colSpan={width} className="empty">
          {t('steps.emptyTable')}
        </td>
      </tr>
    );
  } else if (groupBlocks && groups.length > 0) {
    body = groups.map((g) => (
      <Fragment key={`g${g.id}`}>
        {groupHead(g)}
        {!collapsed.has(g.id) && step.rows.map((r, i) => (r.groupId === g.id && visible(r) ? renderRow(r, i) : null))}
      </Fragment>
    ));
  } else {
    body = step.rows.map((r, i) => (visible(r) ? renderRow(r, i) : null));
  }

  return (
    <div className="table-scroll step-scroll" ref={scrollRef}>
      <table className="data-table">
        <thead>
          <tr>
            {hasGroups && (
              <th scope="col" className="group-col">
                <span className="sr-only">{t('steps.groupColumn')}</span>
              </th>
            )}
            {step.columns.map((c, i) => {
              const dir = sortDir.get(c.name.toLowerCase());
              const cls = [c.highlight ? `hl-${c.highlight}` : '', newColumns?.[i] ? 'new-col' : ''].join(' ');
              return (
                <th key={i} scope="col" className={cls} data-col={i} title={c.unnamed ? t('steps.noColumnName') : undefined}>
                  <span className={c.unnamed ? 'unnamed col-name' : 'col-name'}>{c.name}</span>
                  {dir && (
                    <span className="sort-badge">
                      {' '}
                      {dir === 'ASC' ? '▲' : '▼'} {dir}
                    </span>
                  )}
                  {headerNote?.(i)}
                  <span className="col-type">{t(`table.types.${c.type}`)}</span>
                </th>
              );
            })}
            {showReasons && (
              <th scope="col" className="reason-col">
                {t('steps.reasonColumn')}
              </th>
            )}
          </tr>
        </thead>
        <tbody>{body}</tbody>
      </table>
    </div>
  );
}
