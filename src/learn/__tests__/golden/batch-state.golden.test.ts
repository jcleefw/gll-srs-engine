import { describe, it, expect } from 'vitest';
import { wordPool } from '../../../../data/mock/mock-word-pool.js';
import { mockConsonants } from '../../../../data/mock/mock-consonants.js';
import { assembleBatch } from '../../engine/assemble-batch.js';
import { initBatchState, finishBatch } from '../../engine/batch-queue.js';
import { runAutoInteractive } from '../../../../test-support/auto-answerer.js';
import { DeterministicAccuracyAutoAnswerStrategy } from '../../../../test-support/auto-answer-strategy.js';
import golden from '../fixtures/batch-state.golden.json' with { type: 'json' };

// A failure here is a diff, not a verdict. Triage it by hand: confirm the
// change producing the diff is intended, then regenerate this fixture in the
// same commit as that change, reviewed alongside it. Never add an
// auto-regenerate escape hatch — a silently-refreshed fixture stops proving
// anything.

const ACTIVE_WORDS = wordPool.slice(0, 8);
const ACTIVE_FOUNDATIONAL = mockConsonants.slice(0, 4);
const ACTIVE = [...ACTIVE_WORDS, ...ACTIVE_FOUNDATIONAL];
const WORDS_PER_BATCH = 12;
const RETRY_PER_WORD_CAP = 2;
const RETRY_PER_SESSION_CAP = 5;

interface BatchRunResult {
  correct: number;
  total: number;
  results: { wordId?: string; sentenceId?: string; correct: boolean }[];
  sessionRetryCounts: Record<string, number>;
}

function runBatch(): BatchRunResult {
  // shuffle: false — the final-batch shuffle and per-question choice shuffle
  // (inside makeChoices) both use Math.random with no seam yet. Disabling the
  // outer shuffle keeps queue order deterministic; choice order does not leak
  // into BatchOutput.results, which only records { wordId, correct }.
  const questions = assembleBatch(
    ACTIVE,
    wordPool,
    mockConsonants,
    WORDS_PER_BATCH,
    { shuffle: false },
  );

  const state = initBatchState(
    questions,
    RETRY_PER_WORD_CAP,
    new Map(),
    RETRY_PER_SESSION_CAP,
  );
  const strategy = new DeterministicAccuracyAutoAnswerStrategy(0.8);
  const { correct, total, state: finalState } = runAutoInteractive(state, strategy);
  const output = finishBatch(finalState);

  return {
    correct,
    total,
    results: output.results,
    sessionRetryCounts: Object.fromEntries(output.sessionRetryCounts),
  };
}

describe('batch state machine golden fixture', () => {
  it('matches recorded output for assembleBatch -> initBatchState -> finishBatch', () => {
    expect(runBatch()).toEqual(golden);
  });

  it('is deterministic across repeated runs', () => {
    const first = runBatch();
    for (let i = 0; i < 9; i++) {
      expect(runBatch()).toEqual(first);
    }
  });
});
