import { Fragment, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { AggregateCalc, ColumnType, Group, Value } from '../../engine';
import { formatValue } from '../messages';
import { GroupTag, groupClass } from './DataTable';

const MAX_TERMS = 10;
const KEEP_TERMS = 7;
/** NULLs past the cut that are still shown, so a long sum keeps a visible example. */
const MAX_NULLS = 2;

function Formula({ calc, lang }: { calc: AggregateCalc; lang: string }) {
  const { t } = useTranslation();
  const type: ColumnType = calc.resultType;
  const fmt = (v: Value) => formatValue(v, typeof v === 'string' ? 'text' : type, lang);
  const values = calc.inputs.filter((v) => v !== null);
  const [expanded, setExpanded] = useState(false);
  // NULLs stay inside the operation, struck through, so students see them being ignored.
  const withNulls = (items: Value[]) => [...items, ...calc.inputs.filter((v) => v === null)];
  const join = (items: Value[], sep: string): ReactNode => {
    // In input order, so a NULL appears where it was; a cut sum still shows a couple of its NULLs.
    const all = calc.distinct ? withNulls(items) : calc.inputs;
    const cut = !expanded && all.length > MAX_TERMS;
    const shown = cut ? [...all.slice(0, KEEP_TERMS), ...all.slice(KEEP_TERMS).filter((v) => v === null).slice(0, MAX_NULLS)] : all;
    return (
      <>
        {shown.map((v, i) => (
          <Fragment key={i}>
            {i > 0 && <span className="op">{sep}</span>}
            {v === null ? (
              <s className="val null-term" title={t('steps.calc.nullTerm')}>
                NULL
              </s>
            ) : (
              <span className="val" style={{ '--i': i } as CSSProperties}>
                {fmt(v)}
              </span>
            )}
          </Fragment>
        ))}
        {cut && (
          <>
            <span className="op">{sep}</span>
            <button type="button" className="more-terms" onClick={() => setExpanded(true)} aria-label={t('steps.calc.showAllTerms', { count: all.length })}>
              … +{all.length - shown.length}
            </button>
          </>
        )}
      </>
    );
  };
  const result = <strong className="result">{fmt(calc.result)}</strong>;
  const eqResult = (
    <>
      <span className="op"> = </span>
      {result}
    </>
  );

  let body: ReactNode;
  if (calc.star) {
    body = (
      <>
        {t('steps.calc.countStar', { count: calc.count ?? 0 })}
        {eqResult}
      </>
    );
  } else if (values.length === 0 && calc.fn !== 'COUNT') {
    body = (
      <>
        {t('steps.calc.noValues')}
        {eqResult}
      </>
    );
  } else {
    switch (calc.fn) {
      case 'COUNT':
        body = (
          <>
            {t('steps.calc.countValues', { count: calc.count ?? 0 })}
            {eqResult}
          </>
        );
        break;
      case 'SUM':
        body = (
          <>
            {join(uniqueIfDistinct(calc), ' + ')}
            {eqResult}
          </>
        );
        break;
      case 'AVG': {
        const items = uniqueIfDistinct(calc);
        const exact = typeof calc.sum === 'number' && calc.count ? calc.sum / calc.count : null;
        const truncated = exact !== null && typeof calc.result === 'number' && exact !== calc.result;
        body = (
          <>
            <span className="op">(</span>
            {join(items, ' + ')}
            <span className="op">) / {calc.count}</span>
            {truncated && (
              <>
                <span className="op"> = </span>
                <span className="val">{formatValue(exact, 'decimal', lang)}</span>
                <span className="op"> → </span>
                {result}
                <span className="calc-note"> {t('steps.calc.truncated')}</span>
              </>
            )}
            {!truncated && eqResult}
          </>
        );
        break;
      }
      case 'MIN':
      case 'MAX':
        body = (
          <>
            <span className="op">{calc.fn}(</span>
            {join(uniqueIfDistinct(calc), ', ')}
            <span className="op">)</span>
            {eqResult}
          </>
        );
        break;
    }
  }

  return (
    <div className="calc">
      <code className="sql-inline">{calc.sql}</code>
      <span className="formula">{body}</span>
      {calc.ignoredNulls > 0 && <span className="calc-note ignored">{t('steps.calc.nullsIgnored', { count: calc.ignoredNulls })}</span>}
      {calc.ignoredDuplicates > 0 && <span className="calc-note ignored">{t('steps.calc.duplicatesIgnored', { count: calc.ignoredDuplicates })}</span>}
    </div>
  );
}

function uniqueIfDistinct(calc: AggregateCalc): Value[] {
  const values = calc.inputs.filter((v) => v !== null);
  if (!calc.distinct) return values;
  const seen: Value[] = [];
  for (const v of values) {
    if (!seen.some((s) => (typeof s === 'string' && typeof v === 'string' ? s.toLowerCase() === v.toLowerCase() : s === v))) seen.push(v);
  }
  return seen;
}

export function GroupsPanel({ groups, keyTypes }: { groups: Group[]; keyTypes: ColumnType[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  if (groups.length === 0) return null;
  return (
    <div className="groups">
      <h4>{groups.some((g) => g.aggregates?.length) ? t('steps.calcHeading') : t('steps.groupsHeading')}</h4>
      <ul>
        {groups.map((g) => (
          <li key={g.id} className={`group-card ${groupClass(g.id)}`} data-group={g.id}>
            <div className="group-title">
              <GroupTag id={g.id} />
              <span className="group-key">
                {g.key.length === 0
                  ? t('steps.wholeTable')
                  : g.key.map((v, i) => (
                      <Fragment key={i}>
                        {i > 0 && ', '}
                        <code className="sql-inline">{g.keySql[i]}</code> = <strong>{formatValue(v, keyTypes[i] ?? 'text', lang)}</strong>
                      </Fragment>
                    ))}
              </span>
              <span className="group-count">{t('common.rows', { count: g.rowIds.length })}</span>
            </div>
            {g.aggregates?.map((a, i) => <Formula key={i} calc={a} lang={lang} />)}
          </li>
        ))}
      </ul>
    </div>
  );
}
