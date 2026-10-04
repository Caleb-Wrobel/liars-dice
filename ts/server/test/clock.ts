import type { Clock } from "../src/match.ts";

/** A clock a test winds by hand, so a game with slow bots runs in an instant. */
export class FakeClock implements Clock {
  now = 0;
  private next = 1;
  private readonly timers = new Map<number, { at: number; fn: () => void }>();

  setTimeout(fn: () => void, ms: number): number {
    const id = this.next++;
    this.timers.set(id, { at: this.now + ms, fn });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.timers.delete(handle as number);
  }

  /** How many timers are waiting. */
  get pending(): number {
    return this.timers.size;
  }

  /** Moves time on, running every timer that falls due, in order, including ones that run schedules. */
  advance(ms: number): void {
    const end = this.now + ms;
    for (;;) {
      let soonest: [number, { at: number; fn: () => void }] | undefined;
      for (const entry of this.timers) if (entry[1].at <= end && (!soonest || entry[1].at < soonest[1].at)) soonest = entry;
      if (!soonest) break;
      this.timers.delete(soonest[0]);
      this.now = soonest[1].at;
      soonest[1].fn();
    }
    this.now = end;
  }
}
