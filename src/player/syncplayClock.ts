import type { JellyfinApi } from '@/api/client';
import { parseTime } from './syncplayProtocol';

/**
 * The server's clock, as seen from here. Commands say at which moment on the server's clock to act,
 * so the offset between the two is measured now and then while in a group.
 */
export class ServerClock {
  /** Server clock minus local clock, in ms. */
  private offset = 0;
  private samples: { offset: number; delay: number }[] = [];
  private timer: number | undefined;

  private readonly api: JellyfinApi;
  /** Told the round trip of the best sample so far, in ms, after each measurement. */
  private readonly onSample: (delay: number) => void;

  constructor(api: JellyfinApi, onSample: (delay: number) => void) {
    this.api = api;
    this.onSample = onSample;
  }

  now(): number {
    return Date.now() + this.offset;
  }

  /** A moment on the server's clock, on the local one. */
  toLocal(serverIso: string): number {
    return parseTime(serverIso) - this.offset;
  }

  private async sample() {
    try {
      const t0 = Date.now();
      const r = await this.api.get<{ RequestReceptionTime: string; ResponseTransmissionTime: string }>('/GetUtcTime');
      const t3 = Date.now();
      const t1 = parseTime(r.RequestReceptionTime);
      const t2 = parseTime(r.ResponseTransmissionTime);
      if (!Number.isFinite(t1) || !Number.isFinite(t2)) return;
      const delay = Math.max(0, t3 - t0 - (t2 - t1));
      this.samples.push({ offset: (t1 - t0 + (t2 - t3)) / 2, delay });
      if (this.samples.length > 8) this.samples.shift();
      // The sample with the shortest round trip is the most trustworthy.
      const best = this.samples.reduce((a, b) => (b.delay < a.delay ? b : a));
      this.offset = best.offset;
      this.onSample(best.delay);
    } catch {
      /* try again on the next round */
    }
  }

  start() {
    if (this.timer !== undefined) return;
    this.samples = [];
    void (async () => {
      for (let i = 0; i < 3; i++) await this.sample();
    })();
    this.timer = window.setInterval(() => void this.sample(), 30_000);
  }

  stop() {
    window.clearInterval(this.timer);
    this.timer = undefined;
  }
}
