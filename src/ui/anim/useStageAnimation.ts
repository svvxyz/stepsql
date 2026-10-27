import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import type { Step } from '../../engine';
import { choreograph, SPEED_FACTOR, type Labels, type Speed } from './choreography';
import { Player, type PlayerControl, type PlayerStatus } from './player';

const REDUCED = '(prefers-reduced-motion: reduce)';

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(REDUCED).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(REDUCED);
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

interface Options {
  root: RefObject<HTMLElement | null>;
  scroller: RefObject<HTMLElement | null>;
  step: Step;
  prev: Step | undefined;
  enabled: boolean;
  speed: Speed;
  /** Changes when the user presses "Replay". */
  replay: number;
  labels: Labels;
  /** Where the viewer's pause / skip buttons reach the running animation. */
  control?: MutableRefObject<PlayerControl | null>;
  onStatus?: (s: PlayerStatus) => void;
  /**
   * Called when the animation ends or is skipped, before its traces are removed.
   * `sync` asks for the final state to be rendered right away (flushSync), which
   * is only allowed outside React's own effects.
   */
  onDone: (sync: boolean) => void;
}

/**
 * Plays the stage's animation when the step appears and on every replay. It
 * starts in a layout effect, before paint, so the first frame already shows the
 * "before" state. With reduced motion there is no movement: a short fade, and
 * the final state at once.
 */
export function useStageAnimation(o: Options): void {
  const reduced = usePrefersReducedMotion();
  const latest = useRef(o);
  latest.current = o;

  useLayoutEffect(() => {
    const el = o.root.current;
    const cur = latest.current;
    if (!o.enabled || !el || typeof el.animate !== 'function') return;
    if (reduced) {
      const fade = el.querySelector('.step-body')?.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 250 });
      cur.onDone(false);
      cur.onStatus?.('done');
      return () => fade?.cancel();
    }
    const player = new Player(
      el,
      (s) => latest.current.onStatus?.(s),
      () => latest.current.onDone(true),
    );
    choreograph({ player, root: el, scroller: o.scroller.current, step: o.step, prev: o.prev, f: SPEED_FACTOR[cur.speed], labels: cur.labels });
    if (cur.control) cur.control.current = player;
    player.start();
    return () => {
      player.cancel();
      if (cur.control?.current === player) cur.control.current = null;
    };
    // speed and labels only matter for the next play.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.step, o.replay, o.enabled]);
}
