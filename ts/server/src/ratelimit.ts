/**
 * A token bucket: it holds up to `burst` tokens, each message takes one, and tokens come back at `perSecond`. A player
 * sending now and then never notices it; a flood runs it dry. Time comes in as a function so tests can wind it by hand.
 */
export class TokenBucket {
  private tokens: number;
  /** A new bucket is full, and a full bucket stays full, so when it starts counting from does not matter. */
  private last = 0;

  constructor(
    private readonly burst: number,
    private readonly perSecond: number,
    private readonly now: () => number,
  ) {
    this.tokens = burst;
  }

  /** Takes a token if there is one. False means the sender is going too fast. */
  take(): boolean {
    const t = this.now();
    this.tokens = Math.min(this.burst, this.tokens + ((t - this.last) / 1000) * this.perSecond);
    this.last = t;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
