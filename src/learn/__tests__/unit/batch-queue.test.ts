import { describe, it, expect } from 'vitest';
import {
  initBatchState,
  nextQuestion,
  submitBatchResult,
  finishBatch,
  isBatchDone,
} from '../../engine/batch-queue.js';
import { type QuizQuestion } from '../../types/quiz.js';
import { type BatchState } from '../../engine/batch-queue.js';

describe('BatchQueueManager (Pure Functions)', () => {
  const q1: QuizQuestion = {
    kind: 'mcq',
    wordId: 'w1',
    direction: 'native-to-english',
    prompt: 'w1-native',
    choices: [],
  };

  const q2: QuizQuestion = {
    kind: 'mcq',
    wordId: 'w2',
    direction: 'native-to-english',
    prompt: 'w2-native',
    choices: [],
  };

  it('serves initial questions in order', () => {
    let state = initBatchState([q1, q2], 1, new Map(), 5);

    let res = nextQuestion(state);
    expect(res.question).toBe(q1);
    state = res.state;

    res = nextQuestion(state);
    expect(res.question).toBe(q2);
    state = res.state;

    res = nextQuestion(state);
    expect(res.question).toBeNull();
    expect(isBatchDone(res.state)).toBe(true);
  });

  it('re-enqueues incorrect answers up to the batch cap', () => {
    // Cap of 1 retry per word
    let state = initBatchState([q1], 1, new Map(), 5);

    let res = nextQuestion(state);
    expect(res.question).toBe(q1);
    state = submitBatchResult(res.state, { wordId: 'w1', correct: false });

    // Should reappear once
    res = nextQuestion(state);
    expect(res.question).toBe(q1);
    state = submitBatchResult(res.state, { wordId: 'w1', correct: false });

    // Should not reappear again
    res = nextQuestion(state);
    expect(res.question).toBeNull();
    expect(isBatchDone(res.state)).toBe(true);
  });

  it('blocks a second in-batch retry once the running session total hits the session cap', () => {
    // Regression: retryPerWordCap must not push a word's session total past
    // retryPerSessionCap within a single batch. Word starts at 0 prior
    // session retries, cap is 1, but retryPerWordCap allows 2 — the second
    // retry must be blocked once the first one brings the running total to 1.
    let state = initBatchState([q1], 2, new Map(), 1);

    let res = nextQuestion(state);
    state = submitBatchResult(res.state, { wordId: 'w1', correct: false }); // retry #1 granted

    res = nextQuestion(state);
    expect(res.question).toBe(q1);
    state = submitBatchResult(res.state, { wordId: 'w1', correct: false }); // retry #2 must be blocked

    res = nextQuestion(state);
    expect(res.question).toBeNull();

    const output = finishBatch(state);
    expect(output.sessionRetryCounts.get('w1')).toBe(1);
  });

  it('respects the session-wide retry cap', () => {
    // Word w1 already hit the session cap of 5 in previous batches
    const sessionRetryCounts = new Map([['w1', 5]]);
    let state = initBatchState([q1], 2, sessionRetryCounts, 5);

    let res = nextQuestion(state);
    expect(res.question).toBe(q1);
    state = submitBatchResult(res.state, { wordId: 'w1', correct: false });

    // Should NOT reappear because session cap is hit
    res = nextQuestion(state);
    expect(res.question).toBeNull();
    expect(isBatchDone(res.state)).toBe(true);
  });

  it('ensures replay consistency (D11)', () => {
    let state = initBatchState([q1], 1, new Map(), 5);

    let res = nextQuestion(state);
    const first = res.question;
    state = submitBatchResult(res.state, { wordId: 'w1', correct: false });

    res = nextQuestion(state);
    const second = res.question;

    // Must be the exact same object instance
    expect(second).toBe(first);
  });

  it('calculates initialCount correctly', () => {
    const state = initBatchState([q1, q2], 1, new Map(), 5);
    expect(state.initialCount).toBe(2);
  });

  it('finishes with correct results and updated session counts', () => {
    const sessionCounts = new Map([['w1', 1]]);
    let state = initBatchState([q1, q2], 2, sessionCounts, 10);

    // w1 fails once, retries once and fails again
    let res = nextQuestion(state);
    state = submitBatchResult(res.state, { wordId: 'w1', correct: false });

    res = nextQuestion(state);
    state = submitBatchResult(res.state, { wordId: 'w1', correct: false });

    // w2 succeeds first time
    res = nextQuestion(state);
    state = submitBatchResult(res.state, { wordId: 'w2', correct: true });

    const output = finishBatch(state);
    expect(output.results.length).toBe(3);
    // w1 retried once (max 2 hit, so served twice total, but only 1 retry actually happened)
    // Wait, if it fails once, it is re-queued. Total serves: 2. Retries: 1.
    // session: 1 (previous) + 1 (retry in this batch) = 2.
    expect(output.sessionRetryCounts.get('w1')).toBe(3);
    expect(output.sessionRetryCounts.get('w2')).toBeUndefined();
  });

  it('supports early exit via finishBatch()', () => {
    let state = initBatchState([q1, q2], 1, new Map(), 5);
    const res = nextQuestion(state);
    state = submitBatchResult(res.state, { wordId: 'w1', correct: true });

    const output = finishBatch(state);
    expect(output.results.length).toBe(1);
    expect(isBatchDone(state)).toBe(false); // Queue still had q2
  });

  it('preserves the cached instance on a cache hit, ignoring the fresh queue instance for the same id', () => {
    const qCached: QuizQuestion = { ...q1 };
    const qQueued: QuizQuestion = { ...q1 };
    const state: BatchState = {
      queue: [qQueued],
      results: [],
      batchRetryCounts: new Map(),
      questionCache: new Map([['w1', qCached]]),
      initialCount: 1,
      retryPerWordCap: 1,
      retryPerSessionCap: 5,
      sessionRetryCounts: new Map(),
    };

    const res = nextQuestion(state);
    expect(res.question).toBe(qCached);
    expect(res.question).not.toBe(qQueued);
    expect(res.state.questionCache.get('w1')).toBe(qCached);
  });

  it('re-enqueues sentence questions (word-block) correctly', () => {
    const sq: QuizQuestion = {
      kind: 'word-block',
      sentenceId: 's1',
      direction: 'english-to-native',
      prompt: 's1-prompt',
      tiles: [],
      answer: [],
    };

    let state = initBatchState([sq], 1, new Map(), 5);

    let res = nextQuestion(state);
    expect(res.question).toBe(sq);
    state = submitBatchResult(res.state, { sentenceId: 's1', correct: false });

    // Should reappear
    res = nextQuestion(state);
    expect(res.question).toBe(sq);
    state = submitBatchResult(res.state, { sentenceId: 's1', correct: true });

    res = nextQuestion(state);
    expect(res.question).toBeNull();
    expect(isBatchDone(res.state)).toBe(true);
  });
});
