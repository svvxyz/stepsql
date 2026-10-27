import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Step } from '../../engine';
import { ANIMATED_STAGES, SPEED_FACTOR, type Speed } from '../anim/choreography';
import type { PlayerControl, PlayerStatus } from '../anim/player';
import { usePrefersReducedMotion } from '../anim/useStageAnimation';
import { readStorage, writeStorage } from '../storage';
import { StepCard } from './StepCard';

const SPEED_KEY = 'stepsql.speed';
const SPEEDS = Object.keys(SPEED_FACTOR) as Speed[];

interface Props {
  steps: Step[];
  index: number;
  onIndex: (i: number) => void;
  showAll: boolean;
  onShowAll: (v: boolean) => void;
}

export function StepViewer({ steps, index, onIndex, showAll, onShowAll }: Props) {
  const { t } = useTranslation();
  const last = steps.length - 1;
  const [speed, setSpeed] = useState<Speed>(() => {
    const s = readStorage(SPEED_KEY);
    return SPEEDS.includes(s as Speed) ? (s as Speed) : 'normal';
  });
  const reduced = usePrefersReducedMotion();
  const control = useRef<PlayerControl | null>(null);
  // Replay count and player status belong to one visit of a step. Keying them by
  // visit means a step renders still and with "Animate" in the very same render
  // that shows it, instead of inheriting a previous animation's state.
  const stepKey = useVisitKey(steps, index, showAll);
  const [anim, setAnim] = useState({ key: -1, replay: 0, status: 'done' as PlayerStatus });
  const current = anim.key === stepKey ? anim : { key: stepKey, replay: 0, status: 'done' as PlayerStatus };
  const { replay, status } = current;
  const startReplay = () => setAnim({ ...current, replay: replay + 1 });
  const setStatus = (s: PlayerStatus) => setAnim((a) => (a.key === stepKey ? { ...a, status: s } : { key: stepKey, replay: 0, status: s }));

  useEffect(() => writeStorage(SPEED_KEY, speed), [speed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.closest('input, select, textarea, dialog, .cm-editor') || target.isContentEditable)) return;
      if (e.key === 'ArrowRight') onIndex(Math.min(last, index + 1));
      else if (e.key === 'ArrowLeft') onIndex(Math.max(0, index - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, last, onIndex]);

  const card = (s: Step, i: number) => (
    <StepCard
      key={i}
      step={s}
      prev={steps[i - 1]}
      index={i}
      total={steps.length}
      animate={!showAll && ANIMATED_STAGES.has(s.stage)}
      speed={speed}
      replay={replay}
      control={control}
      onStatus={setStatus}
    />
  );

  return (
    <section className="steps-panel" aria-labelledby="steps-heading">
      <div className="stage-bar">
        <h2 id="steps-heading" className="stage-label">
          {t('steps.heading')}
        </h2>
        <div className="step-controls">
          {!showAll && (
            <>
              {ANIMATED_STAGES.has(steps[index]!.stage) && (
              <div className="anim-controls" role="group" aria-label={t('anim.label')}>
                {status === 'done' ? (
                  <button type="button" className="btn small" onClick={startReplay}>
                    {replay === 0 ? `▶ ${t('anim.start')}` : `↻ ${t('anim.replay')}`}
                  </button>
                ) : (
                  <>
                    {status === 'paused' ? (
                      <button type="button" className="btn small" onClick={() => control.current?.resume()}>
                        ▶ {t('anim.resume')}
                      </button>
                    ) : (
                      <button type="button" className="btn small" onClick={() => control.current?.pause()}>
                        ⏸ {t('anim.pause')}
                      </button>
                    )}
                    <button type="button" className="btn small" onClick={() => control.current?.skip()}>
                      ⏭ {t('anim.skip')}
                    </button>
                  </>
                )}
                <label className="speed">
                  <span className="sr-only">{t('anim.speed')}</span>
                  <select value={speed} onChange={(e) => setSpeed(e.target.value as Speed)} aria-label={t('anim.speed')}>
                    {SPEEDS.map((s) => (
                      <option key={s} value={s}>
                        {t(`anim.speeds.${s}`)}
                      </option>
                    ))}
                  </select>
                </label>
                {reduced && (
                  <span className="hint reduced-hint" title={t('anim.reducedHint')}>
                    {t('anim.reduced')}
                  </span>
                )}
              </div>
              )}
              <button type="button" className="btn" onClick={() => onIndex(Math.max(0, index - 1))} disabled={index === 0}>
                ← {t('steps.prev')}
              </button>
              <button type="button" className="btn" onClick={() => onIndex(Math.min(last, index + 1))} disabled={index === last}>
                {t('steps.next')} →
              </button>
            </>
          )}
          <button type="button" className="btn ghost" aria-pressed={showAll} onClick={() => onShowAll(!showAll)}>
            {showAll ? t('steps.showOne') : t('steps.showAll')}
          </button>
        </div>
      </div>

      {showAll ? <div className="all-steps">{steps.map((s, i) => card(s, i))}</div> : <div aria-live="polite">{card(steps[index]!, index)}</div>}
    </section>
  );
}

/**
 * Changes on every visit to a step: a new result, another step, or switching
 * "show all steps". Coming back to a step is a new visit, so it starts still.
 */
function useVisitKey(steps: Step[], index: number, showAll: boolean): number {
  const ref = useRef({ steps, index, showAll, visit: 0 });
  const r = ref.current;
  if (r.steps !== steps || r.index !== index || r.showAll !== showAll) ref.current = { steps, index, showAll, visit: r.visit + 1 };
  return ref.current.visit;
}
