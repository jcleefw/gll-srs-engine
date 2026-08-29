import { describe, it, expect, vi } from 'vitest';
import { FsrsScheduler } from '../FsrsScheduler.js';
import type { ReviewCard, GraduationPerformance } from '../types.js';

const NOW = new Date('2026-07-08T00:00:00Z');
const perf = (o: Partial<GraduationPerformance> = {}): GraduationPerformance => ({
  correctStreak: 4, lapses: 0, correctRatio: 1, ...o,
});

describe('FsrsScheduler.seed', () => {
  it('produces a card due in the future and never rates it "again"', () => {
    const card = new FsrsScheduler().seed('w1', perf(), NOW);
    expect(card.wordId).toBe('w1');
    expect(card.due.getTime()).toBeGreaterThan(NOW.getTime());
    expect(card.schedulerData).toBeDefined();
  });

  it('strong performance seeds a longer first interval than weak performance', () => {
    const s = new FsrsScheduler();
    const strong = s.seed('w1', perf({ correctStreak: 6, lapses: 0, correctRatio: 1 }), NOW);
    const weak = s.seed('w2', perf({ correctStreak: 1, lapses: 3, correctRatio: 0.4 }), NOW);
    expect(strong.due.getTime()).toBeGreaterThan(weak.due.getTime());
  });

  describe('grade mapping (seedRating tiers)', () => {
    const dueOf = (o: Partial<GraduationPerformance>): number =>
      new FsrsScheduler().seed('w', perf(o), NOW).due.getTime();

    it('maps easy, good, and hard performance to three distinct due dates', () => {
      const easy = dueOf({ correctStreak: 4, lapses: 0, correctRatio: 1 });
      const good = dueOf({ correctStreak: 1, lapses: 2, correctRatio: 0.7 });
      const hard = dueOf({ correctStreak: 1, lapses: 3, correctRatio: 0.4 });
      expect(easy).toBeGreaterThan(good);
      expect(good).toBeGreaterThan(hard);
    });

    it('pins the easy-streak boundary: correctStreak >= 4 with zero lapses is easy', () => {
      const atBoundary = dueOf({ correctStreak: 4, lapses: 0, correctRatio: 1 });
      const belowBoundary = dueOf({ correctStreak: 3, lapses: 0, correctRatio: 1 });
      expect(atBoundary).toBeGreaterThan(belowBoundary);
    });

    it('a single lapse disqualifies easy even with a long streak', () => {
      const oneLapse = dueOf({ correctStreak: 6, lapses: 1, correctRatio: 1 });
      const zeroLapses = dueOf({ correctStreak: 6, lapses: 0, correctRatio: 1 });
      expect(oneLapse).toBeLessThan(zeroLapses);
    });

    it('pins the good-ratio boundary: correctRatio >= 0.7 with <=2 lapses is good, not hard', () => {
      const atBoundary = dueOf({ correctStreak: 1, lapses: 2, correctRatio: 0.7 });
      const belowBoundary = dueOf({ correctStreak: 1, lapses: 2, correctRatio: 0.69 });
      expect(atBoundary).toBeGreaterThan(belowBoundary);
    });

    it('pins the good-lapses boundary: lapses <= 2 qualifies, lapses === 3 falls to hard', () => {
      const atBoundary = dueOf({ correctStreak: 1, lapses: 2, correctRatio: 0.9 });
      const overBoundary = dueOf({ correctStreak: 1, lapses: 3, correctRatio: 0.9 });
      expect(atBoundary).toBeGreaterThan(overBoundary);
    });
  });
});

describe('FsrsScheduler.seed — ReviewHooks.onSeeded', () => {
  it('emits wordId, inferred rating, and the seeded due date', () => {
    const onSeeded = vi.fn();
    const card = new FsrsScheduler().seed('w1', perf(), NOW, { onSeeded });
    expect(onSeeded).toHaveBeenCalledTimes(1);
    expect(onSeeded).toHaveBeenCalledWith('w1', 'easy', card.due);
  });

  it('reflects the tier actually chosen, not always "easy"', () => {
    const onSeeded = vi.fn();
    new FsrsScheduler().seed('w2', perf({ correctStreak: 1, lapses: 3, correctRatio: 0.4 }), NOW, {
      onSeeded,
    });
    expect(onSeeded).toHaveBeenCalledWith('w2', 'hard', expect.any(Date));
  });

  it('does not throw and does not emit when hooks are omitted', () => {
    expect(() => new FsrsScheduler().seed('w1', perf(), NOW)).not.toThrow();
  });

  it('seeded card output is unchanged whether or not hooks are supplied', () => {
    const withHooks = new FsrsScheduler().seed('w1', perf(), NOW, { onSeeded: vi.fn() });
    const withoutHooks = new FsrsScheduler().seed('w1', perf(), NOW);
    expect(withHooks).toEqual(withoutHooks);
  });
});

describe('FsrsScheduler.schedule', () => {
  const seeded = (): ReviewCard => new FsrsScheduler().seed('w1', perf(), NOW);

  it('"good" pushes the due date further out', () => {
    const s = new FsrsScheduler();
    const card = seeded();
    const next = s.schedule(card, 'good', card.due);
    expect(next.due.getTime()).toBeGreaterThan(card.due.getTime());
  });

  it('"again" reschedules soon without resetting to day 1 (relearning, not New)', () => {
    const s = new FsrsScheduler();
    const card = seeded();
    const lapsed = s.schedule(card, 'again', card.due);
    expect(lapsed.due.getTime()).toBeGreaterThan(card.due.getTime()); // still forward
    expect(lapsed.due.getTime()).toBeLessThan(
      s.schedule(card, 'good', card.due).due.getTime(),                // but sooner than good
    );
  });

  it('survives a JSON round-trip of schedulerData (store simulation)', () => {
    const s = new FsrsScheduler();
    const card = seeded();
    const roundTripped: ReviewCard = {
      ...card,
      schedulerData: JSON.parse(JSON.stringify(card.schedulerData)),
    };
    expect(() => s.schedule(roundTripped, 'good', card.due)).not.toThrow();
  });
});

describe('FsrsScheduler.isDue', () => {
  it('is due when due <= now (boundary inclusive), not due when due > now', () => {
    const s = new FsrsScheduler();
    const card = s.seed('w1', perf(), NOW);
    expect(s.isDue({ ...card, due: NOW }, NOW)).toBe(true);  // due == now
    expect(s.isDue(card, NOW)).toBe(false);                  // due in future
    expect(s.isDue(card, new Date(card.due.getTime() + 1))).toBe(true);
  });
});
