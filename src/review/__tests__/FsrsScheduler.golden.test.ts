import { describe, it, expect } from 'vitest';
import { createEmptyCard } from 'ts-fsrs';
import { FsrsScheduler } from '../FsrsScheduler.js';
import type { ReviewCard, ReviewRating } from '../types.js';
import golden from './fixtures/FsrsScheduler.golden-intervals.json' with { type: 'json' };

const NOW = new Date('2026-07-08T00:00:00Z');

const SEQUENCES: Record<string, ReviewRating[]> = {
  'all-good': ['good', 'good', 'good', 'good'],
  'all-easy': ['easy', 'easy', 'easy', 'easy'],
  'lapse-then-recover': ['good', 'again', 'good', 'good'],
  'hard-grind': ['hard', 'hard', 'hard', 'hard'],
  'easy-then-lapse': ['easy', 'easy', 'again', 'good'],
};

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * Locks observable `schedule()` output (day-rounded intervals) against a committed
 * fixture, so a change to `generatorParameters` (or an unnoticed ts-fsrs behavioural
 * shift on a patch bump) surfaces as a reviewable diff instead of a silent pass.
 */
describe('FsrsScheduler golden fixture', () => {
  for (const [name, ratings] of Object.entries(SEQUENCES)) {
    it(`matches recorded intervals for sequence "${name}"`, () => {
      const scheduler = new FsrsScheduler();
      // Start from a bare card (bypassing seed()'s graduation-performance mapping)
      // so the sequence below drives every step explicitly via schedule().
      let card: ReviewCard = { wordId: 'w1', due: NOW, schedulerData: createEmptyCard(NOW) };

      const intervals: number[] = [];
      let prevDue = NOW;
      for (const rating of ratings) {
        card = scheduler.schedule(card, rating, prevDue);
        intervals.push(daysBetween(prevDue, card.due));
        prevDue = card.due;
      }

      expect(intervals).toEqual(golden[name as keyof typeof golden]);
    });
  }
});
