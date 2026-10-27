import { useMemo, useRef, useState, type MutableRefObject } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { MessageRef, Step } from '../../engine';
import type { Speed } from '../anim/choreography';
import type { PlayerControl, PlayerStatus } from '../anim/player';
import { useStageAnimation } from '../anim/useStageAnimation';
import { formatValue, messageText } from '../messages';
import { groupKeyTypes } from '../stepUtils';
import { DataTable, type RowFilter } from './DataTable';
import { GroupsPanel } from './GroupsPanel';
import { RowDelta } from './RowDelta';
import { buildWorkColumns, SelectWorkTable } from './SelectWorkTable';

interface Props {
  step: Step;
  /** The step before this one in logical order (what the animation starts from). */
  prev: Step | undefined;
  index: number;
  total: number;
  /** Animations allowed (one step at a time, not "show all steps"). */
  animate: boolean;
  speed: Speed;
  /** How many times the animation was requested for this step; 0 = not yet, the step is shown as is. */
  replay: number;
  control?: MutableRefObject<PlayerControl | null>;
  onStatus?: (s: PlayerStatus) => void;
}

/** Stages whose animation removes the rows that do not pass: afterwards only those that pass are listed. */
const FILTERING = new Set(['where', 'having']);

export function StepCard({ step, prev, index, total, animate, speed, replay, control, onStatus }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const root = useRef<HTMLElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<RowFilter>('all');
  // The replay whose animation has finished; while they differ, the animation is playing.
  const [doneFor, setDoneFor] = useState<number | null>(null);
  const requested = animate && replay > 0;
  const animating = requested && doneFor !== replay;
  const filtering = FILTERING.has(step.stage) && step.rows.some((r) => r.status === 'discarded');
  const workColumns = useMemo(() => (step.stage === 'select' ? buildWorkColumns(step, prev) : null), [step, prev]);
  useStageAnimation({
    root,
    scroller,
    step,
    prev,
    enabled: requested,
    speed,
    replay,
    labels: {
      result: (r) => t(r === true ? 'anim.true' : r === false ? 'anim.false' : 'anim.unknown'),
      value: (v) => (typeof v === 'number' ? formatValue(v, 'decimal', lang) : v === null ? 'NULL' : v),
      rows: (n) => t('common.rows', { count: n }),
      newGroup: t('anim.newGroup'),
    },
    control,
    onStatus,
    onDone: (sync) => {
      const apply = () => {
        setDoneFor(replay);
        if (filtering) setFilter('kept');
      };
      if (sync) flushSync(apply);
      else apply();
    },
  });

  const groups = step.groups ?? [];
  const showGroups = step.stage === 'groupBy' || step.stage === 'aggregate';
  const discarded = step.rows.filter((r) => r.status === 'discarded').length;
  const kept = step.rows.length - discarded;
  const cutAt = step.stage === 'top' ? step.rows.findIndex((r) => r.status === 'discarded') : -1;

  return (
    <article ref={root} className={`step-card stage-${step.stage}`} aria-labelledby={`step-title-${index}`}>
      <header className="step-header">
        <div className="step-heading">
          <span className="step-number stage-label">{t('steps.stepOf', { current: index + 1, total })}</span>
          <h3 id={`step-title-${index}`}>{t(`stage.${step.stage}.title`)}</h3>
        </div>
        <RowDelta rowsIn={step.stats.rowsIn} rowsOut={step.stats.rowsOut} />
      </header>
      {step.clauseSql && (
        <div className="clause-row">
          <pre className="clause-sql">
            <code>{step.clauseSql}</code>
          </pre>
        </div>
      )}
      <p className="explanation">{messageText(step.explanation, t, lang)}</p>
      {step.notes.length > 0 && (
        <ul className="notes">
          {step.notes.map((n, i) => (
            <li key={i} className="note">
              <span className="note-icon" aria-hidden="true">
                i
              </span>
              <span>{messageText(n, t, lang)}</span>
            </li>
          ))}
        </ul>
      )}

      {step.stage === 'where' && discarded > 0 && <WhereSummary step={step} />}
      {step.stage === 'select' && <ProjectionStrip step={step} />}
      {step.stage === 'result' && (
        <p className="result-summary">
          <strong>{t('common.rows', { count: step.rows.length })}</strong> × <strong>{t('common.columns', { count: step.columns.length })}</strong>
        </p>
      )}
      {filtering && (
        <div className="row-filter" role="group" aria-label={t('steps.filter.label')}>
          {(['all', 'kept', 'discarded'] as const).map((f) => (
            <button key={f} type="button" className="btn small" aria-pressed={(animating ? 'all' : filter) === f} disabled={animating} onClick={() => setFilter(f)}>
              {t(`steps.filter.${f}`)} <span className="count">{f === 'all' ? step.rows.length : f === 'kept' ? kept : discarded}</span>
            </button>
          ))}
        </div>
      )}

      <div className={showGroups && groups.length > 0 ? 'step-body with-groups' : 'step-body'}>
        {animating && workColumns ? (
          <SelectWorkTable step={step} columns={workColumns} scrollRef={scroller} />
        ) : animating && step.stage === 'aggregate' && prev?.stage === 'groupBy' ? (
          // The aggregates are computed on the GROUP BY blocks; the animation folds each block into one row.
          <div className="agg-work">
            <DataTable key="agg-work" step={prev} groupBlocks scrollRef={scroller} />
          </div>
        ) : (
        <DataTable
          key={step.stage}
          step={step}
          filter={filtering && !animating ? filter : 'all'}
          reasons={step.stage !== 'where'}
          groupBlocks={step.stage === 'groupBy' && groups.length > 0}
          cutAt={cutAt >= 0 ? cutAt : undefined}
          headerNote={step.stage === 'select' ? (i) => aliasNote(step, i) : undefined}
          newColumns={step.stage === 'select' ? step.columnLineage?.map((c) => c.source === null) : undefined}
          scrollRef={scroller}
        />
        )}
        {showGroups && <GroupsPanel groups={groups} keyTypes={groupKeyTypes(step)} />}
      </div>
    </article>
  );
}

/** Under a column header: the expression an alias stands for. */
function aliasNote(step: Step, i: number) {
  const lin = step.columnLineage?.[i];
  const col = step.columns[i];
  if (!lin || !col || col.unnamed || lin.exprSql.toLowerCase() === col.name.toLowerCase()) return null;
  return <code className="alias-of">← {lin.exprSql}</code>;
}

/**
 * WHERE: how many rows were discarded and why, once per reason. The condition is
 * already in the SQL box above, so it is only named when the part that failed is
 * one piece of an AND / OR.
 */
function WhereSummary({ step }: { step: Step }) {
  const { t, i18n } = useTranslation();
  const whole = (step.explanation.params?.condition as { sql: string } | undefined)?.sql;
  const byReason = new Map<string, { ref: MessageRef; count: number }>();
  for (const r of step.rows) {
    if (r.status !== 'discarded' || !r.reason) continue;
    const cond = r.reason.params?.condition as { sql: string } | undefined;
    const unknown = r.reason.key.endsWith('unknown');
    const part = cond && cond.sql !== whole;
    const id = `${unknown}|${cond?.sql}`;
    const entry = byReason.get(id);
    if (entry) entry.count++;
    else {
      const key = `steps.where.summary${unknown ? 'Unknown' : 'False'}${part ? 'Part' : ''}`;
      byReason.set(id, { ref: { key, params: { condition: cond ?? null } }, count: 1 });
    }
  }
  return (
    <ul className="discard-summary">
      {[...byReason.values()].map(({ ref, count }, i) => (
        <li key={i}>
          <span className="discard-count">{count}</span> {messageText({ ...ref, params: { ...ref.params, count } }, t, i18n.language)}
        </li>
      ))}
    </ul>
  );
}

/** SELECT: which columns are projected, renamed, computed and left out. */
function ProjectionStrip({ step }: { step: Step }) {
  const { t } = useTranslation();
  const lineage = step.columnLineage ?? [];
  const dropped = step.droppedColumns ?? [];
  return (
    <div className="projection">
      <div className="proj-group">
        <span className="stage-label">{t('steps.select.projected')}</span>
        <ul>
          {step.columns.map((c, i) => {
            const l = lineage[i];
            const computed = l?.source === null;
            const renamed = l && !c.unnamed && l.exprSql.toLowerCase() !== c.name.toLowerCase();
            return (
              <li key={i} className={`proj-chip ${computed ? 'proj-new' : ''}`}>
                {renamed ? (
                  <>
                    <code className="alias-from">{l.exprSql}</code>
                    <span className="alias-to">
                      {' → '}
                      <code>{c.name}</code>
                    </span>
                  </>
                ) : (
                  <code>{c.name}</code>
                )}
                {computed && <span className="proj-tag">{t('steps.select.computed')}</span>}
              </li>
            );
          })}
        </ul>
      </div>
      {dropped.length > 0 && (
        <div className="proj-group">
          <span className="stage-label">{t('steps.select.dropped')}</span>
          <ul>
            {dropped.map((c, i) => (
              <li key={i} className="proj-chip proj-dropped">
                <code>{c.name}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
