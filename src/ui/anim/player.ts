// A small timeline player for the stage animations.
//
// A choreography schedules DOM changes at given times (`at`) and may start Web
// Animations (`animate`). The player owns the clock, so it can pause (the clock
// stops and every running animation in the card pauses), resume and skip to the
// end. Every change goes through the player, which undoes it all at the end:
// what remains on screen is always React's final render.

export type PlayerStatus = 'playing' | 'paused' | 'done';

export interface PlayerControl {
  pause: () => void;
  resume: () => void;
  skip: () => void;
}

interface Scheduled {
  t: number;
  fn: () => void;
}

export class Player implements PlayerControl {
  private events: Scheduled[] = [];
  private next = 0;
  private elapsed = 0;
  private last = 0;
  private raf = 0;
  private paused = false;
  private ended = false;
  private started = false;
  private end = 0;
  private animations: Animation[] = [];
  private attrs = new Map<HTMLElement, Set<string>>();
  private styled = new Set<HTMLElement>();
  private extras: Element[] = [];

  constructor(
    readonly root: HTMLElement,
    private readonly onStatus: (s: PlayerStatus) => void,
    private readonly onDone: () => void,
  ) {}

  /** Runs `fn` at `t` ms of animation time (paused time does not count). */
  at(t: number, fn: () => void): void {
    this.end = Math.max(this.end, t);
    if (!this.started) return void this.events.push({ t, fn });
    // Scheduled while playing: keep the pending events in time order.
    let i = this.next;
    while (i < this.events.length && this.events[i]!.t <= t) i++;
    this.events.splice(i, 0, { t, fn });
  }

  /** Keeps the animation alive until `t` (for a last movement that is still running). */
  hold(t: number): void {
    this.end = Math.max(this.end, t);
  }

  animate(el: Element, frames: Keyframe[], opts: KeyframeAnimationOptions): Animation {
    const a = el.animate(frames, { easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', fill: 'both', ...opts });
    if (this.paused) a.pause();
    this.animations.push(a);
    return a;
  }

  /** Sets a data-* attribute that CSS reads; removed at the end. */
  data(el: HTMLElement, name: string, value: string | null): void {
    if (value === null) delete el.dataset[name];
    else el.dataset[name] = value;
    const set = this.attrs.get(el) ?? new Set<string>();
    set.add(name);
    this.attrs.set(el, set);
  }

  style(el: HTMLElement, prop: string, value: string): void {
    el.style.setProperty(prop, value);
    this.styled.add(el);
  }

  /** An element the animation adds (badges, counters); removed at the end. */
  add<T extends Element>(el: T): T {
    this.extras.push(el);
    return el;
  }

  start(): void {
    this.events.sort((a, b) => a.t - b.t);
    this.started = true;
    this.onStatus('playing');
    // Events at time 0 run now, before the first paint.
    this.flush();
    this.last = performance.now();
    const tick = (now: number) => {
      if (this.ended) return;
      if (!this.paused) this.elapsed += now - this.last;
      this.last = now;
      this.flush();
      if (this.elapsed >= this.end && this.next >= this.events.length) this.finish();
      else this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private flush(): void {
    while (this.next < this.events.length && this.events[this.next]!.t <= this.elapsed) this.events[this.next++]!.fn();
  }

  pause = (): void => {
    if (this.ended || this.paused) return;
    this.paused = true;
    this.runningAnimations().forEach((a) => a.pause());
    this.onStatus('paused');
  };

  resume = (): void => {
    if (this.ended || !this.paused) return;
    this.paused = false;
    this.last = performance.now();
    this.runningAnimations().forEach((a) => a.play());
    this.onStatus('playing');
  };

  skip = (): void => this.finish();

  /** Ends normally: React shows the final state, then the animation's traces go. */
  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    cancelAnimationFrame(this.raf);
    this.onDone();
    this.cleanup();
    this.onStatus('done');
  }

  /** Stops without reporting (the step changed or the card left). */
  cancel(): void {
    if (this.ended) return;
    this.ended = true;
    cancelAnimationFrame(this.raf);
    this.cleanup();
  }

  private runningAnimations(): Animation[] {
    // Our own animations plus CSS transitions started by attribute changes.
    return [...new Set([...this.animations, ...this.root.getAnimations({ subtree: true })])];
  }

  private cleanup(): void {
    // No transitions while the traces are removed, or the final state would animate back.
    this.root.dataset.animReset = '';
    this.animations.forEach((a) => a.cancel());
    this.attrs.forEach((names, el) => names.forEach((n) => delete el.dataset[n]));
    this.styled.forEach((el) => el.removeAttribute('style'));
    this.extras.forEach((el) => el.remove());
    this.root.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    requestAnimationFrame(() => delete this.root.dataset.animReset);
  }
}
