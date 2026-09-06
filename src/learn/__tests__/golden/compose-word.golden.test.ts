import { describe, it, expect } from 'vitest';
import { wordPool } from '../../../../data/mock/mock-word-pool.js';
import { mockConsonants } from '../../../../data/mock/mock-consonants.js';
import { composeWordBatchMulti } from '../../engine/compose-word-batch.js';
import type { MCQQuestion } from '../../types/quiz.js';
import { seededRng } from '../../../../test-support/seeded-rng.js';
import fillerFixture from '../fixtures/compose-word.filler.golden.json' with { type: 'json' };
import truncatedFixture from '../fixtures/compose-word.truncated.golden.json' with { type: 'json' };

// A failure here is a diff, not a verdict. Triage it by hand: confirm the
// change producing the diff is intended, then regenerate this fixture in the
// same commit as that change, reviewed alongside it. Never add an
// auto-regenerate escape hatch — a silently-refreshed fixture stops proving
// anything.

const WORDS = wordPool.slice(0, 3);
const POOL = [...wordPool, ...mockConsonants];
const SEED = 42;

function runFiller(): MCQQuestion[] {
  return composeWordBatchMulti(WORDS, POOL, {
    // 3 words * 4 directions = 12 possible questions; coverage alone (3)
    // cannot fill 8, so the filler path (leftover shuffle + slice) engages.
    questionLimit: 8,
    rng: seededRng(SEED),
  });
}

function runTruncated(): MCQQuestion[] {
  return composeWordBatchMulti(WORDS, POOL, {
    // questionLimit (2) < words.length (3): coverage itself is truncated,
    // so the filler path never engages.
    questionLimit: 2,
    rng: seededRng(SEED),
  });
}

describe('word composition golden fixture', () => {
  it('is deterministic across repeated runs with the same seed (filler path)', () => {
    const first = runFiller();
    const second = runFiller();
    expect(second).toEqual(first);
  });

  it('matches recorded output for the filler path (questionLimit > words.length)', () => {
    expect(runFiller()).toEqual(fillerFixture);
  });

  it('is deterministic across repeated runs with the same seed (truncated path)', () => {
    const first = runTruncated();
    const second = runTruncated();
    expect(second).toEqual(first);
  });

  it('matches recorded output for the truncated path (questionLimit < words.length)', () => {
    expect(runTruncated()).toEqual(truncatedFixture);
  });
});
