import { describe, it } from 'vitest';
import fc from 'fast-check';
import {
  initBatchState,
  nextQuestion,
  submitBatchResult,
  finishBatch,
} from '../../engine/batch-queue.js';
import type { QuizQuestion, QuizResult } from '../../types/quiz.js';
import type { BatchState } from '../../engine/batch-queue.js';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

function makeQuestion(wordId: string): QuizQuestion {
  return {
    kind: 'mcq',
    wordId,
    direction: 'native-to-english',
    prompt: `${wordId}-prompt`,
    choices: [],
  };
}

const wordPoolArb = fc.uniqueArray(fc.stringMatching(/^w[0-9]{1,2}$/), {
  minLength: 1,
  maxLength: 6,
});

const retryPerWordCapArb = fc.integer({ min: 0, max: 4 });
const retryPerSessionCapArb = fc.integer({ min: 0, max: 6 });

/** A command sequence of per-answer correctness outcomes, one per serve. */
const outcomesArb = fc.array(fc.boolean(), { minLength: 0, maxLength: 40 });

function resultFor(question: QuizQuestion, correct: boolean): QuizResult {
  return question.kind === 'mcq'
    ? { wordId: question.wordId, correct }
    : { sentenceId: question.sentenceId, correct };
}

/** Builds an all-wrong outcome sequence long enough to exhaust every retry. */
function allWrongOutcomes(questionCount: number, retryPerWordCap: number): boolean[] {
  return new Array<boolean>(questionCount * (retryPerWordCap + 1) + 5).fill(false);
}

interface DriveResult {
  finalState: BatchState;
  steps: number;
  drainedWithinCeiling: boolean;
  firstServeIdentityViolation: boolean;
}

/**
 * Drives a batch to completion, feeding `outcomes` as the correctness of each
 * successive serve. Stops early if outcomes run out (treats remaining serves
 * as "not yet answered" and just calls finishBatch on whatever state exists).
 * A hard step ceiling guards against a non-terminating queue turning a test
 * hang into a property failure instead.
 */
function driveBatch(state: BatchState, outcomes: boolean[]): DriveResult {
  const STEP_CEILING = 500;
  let steps = 0;
  let outcomeIndex = 0;
  let current = state;
  const servedIdentity = new Map<string, QuizQuestion>();
  let firstServeIdentityViolation = false;

  while (steps < STEP_CEILING) {
    const { question, state: served } = nextQuestion(current);
    if (!question) {
      current = served;
      break;
    }
    current = served;

    const id = question.kind === 'mcq' ? question.wordId : question.sentenceId;
    const priorIdentity = servedIdentity.get(id);
    if (priorIdentity && priorIdentity !== question) {
      firstServeIdentityViolation = true;
    }
    servedIdentity.set(id, question);

    if (outcomeIndex >= outcomes.length) {
      // No more scripted outcomes — stop driving, leaving remaining queue unresolved.
      break;
    }
    const correct = outcomes[outcomeIndex++];
    current = submitBatchResult(current, resultFor(question, correct));
    steps++;
  }

  return { finalState: current, steps, drainedWithinCeiling: steps < STEP_CEILING, firstServeIdentityViolation };
}

describe('batch queue — retry and drain invariants', () => {
  it('per-word batch retries never exceed the per-word retry cap', () => {
    fc.assert(
      fc.property(
        wordPoolArb,
        retryPerWordCapArb,
        retryPerSessionCapArb,
        outcomesArb,
        (wordPool, retryPerWordCap, retryPerSessionCap, outcomes) => {
          const questions = wordPool.map(makeQuestion);
          const state = initBatchState(questions, retryPerWordCap, new Map(), retryPerSessionCap);
          const { finalState } = driveBatch(state, outcomes);
          return [...finalState.batchRetryCounts.values()].every((count) => count <= retryPerWordCap);
        },
      ),
    );
  });

  it('a batch always drains given enough outcomes to answer every serve', () => {
    fc.assert(
      fc.property(
        wordPoolArb,
        retryPerWordCapArb,
        retryPerSessionCapArb,
        (wordPool, retryPerWordCap, retryPerSessionCap) => {
          const questions = wordPool.map(makeQuestion);
          const state = initBatchState(questions, retryPerWordCap, new Map(), retryPerSessionCap);
          const { drainedWithinCeiling, finalState } = driveBatch(
            state,
            allWrongOutcomes(questions.length, retryPerWordCap),
          );
          return drainedWithinCeiling && finalState.queue.length === 0;
        },
      ),
    );
  });

  it('a retried question is the exact same object instance as its first serve', () => {
    fc.assert(
      fc.property(
        wordPoolArb,
        retryPerWordCapArb,
        retryPerSessionCapArb,
        outcomesArb,
        (wordPool, retryPerWordCap, retryPerSessionCap, outcomes) => {
          const questions = wordPool.map(makeQuestion);
          const state = initBatchState(questions, retryPerWordCap, new Map(), retryPerSessionCap);
          const { firstServeIdentityViolation } = driveBatch(state, outcomes);
          return !firstServeIdentityViolation;
        },
      ),
    );
  });

  it('finishBatch totals equal prior session counts plus this batch increments', () => {
    fc.assert(
      fc.property(
        wordPoolArb,
        retryPerWordCapArb,
        retryPerSessionCapArb,
        outcomesArb,
        (wordPool, retryPerWordCap, retryPerSessionCap, outcomes) => {
          const priorCounts = new Map(wordPool.map((id, i) => [id, i % 3]));
          const questions = wordPool.map(makeQuestion);
          const state = initBatchState(questions, retryPerWordCap, priorCounts, retryPerSessionCap);
          const { finalState } = driveBatch(state, outcomes);
          const output = finishBatch(finalState);

          for (const [id, batchCount] of finalState.batchRetryCounts.entries()) {
            const expected = (priorCounts.get(id) ?? 0) + batchCount;
            if (output.sessionRetryCounts.get(id) !== expected) return false;
          }
          // No word gains a session count entry it never earned.
          for (const [id, total] of output.sessionRetryCounts.entries()) {
            const prior = priorCounts.get(id) ?? 0;
            const batchCount = finalState.batchRetryCounts.get(id) ?? 0;
            if (total !== prior + batchCount) return false;
          }
          return true;
        },
      ),
    );
  });

  it('a word already at or past the session retry cap gets no further retries in this batch', () => {
    fc.assert(
      fc.property(
        wordPoolArb,
        retryPerWordCapArb,
        retryPerSessionCapArb,
        outcomesArb,
        (wordPool, retryPerWordCap, retryPerSessionCap, outcomes) => {
          const priorCounts = new Map(wordPool.map((id) => [id, retryPerSessionCap]));
          const questions = wordPool.map(makeQuestion);
          const state = initBatchState(questions, retryPerWordCap, priorCounts, retryPerSessionCap);
          const { finalState } = driveBatch(state, outcomes);
          return [...finalState.batchRetryCounts.values()].every((count) => count === 0);
        },
      ),
    );
  });
});

describe('batch queue — results integrity', () => {
  it('finishBatch results are exactly the submitted results, in submission order', () => {
    fc.assert(
      fc.property(
        wordPoolArb,
        retryPerWordCapArb,
        retryPerSessionCapArb,
        outcomesArb,
        (wordPool, retryPerWordCap, retryPerSessionCap, outcomes) => {
          const questions = wordPool.map(makeQuestion);
          let state = initBatchState(questions, retryPerWordCap, new Map(), retryPerSessionCap);
          const submitted: QuizResult[] = [];

          const STEP_CEILING = 500;
          let steps = 0;
          let outcomeIndex = 0;
          while (steps < STEP_CEILING) {
            const { question, state: served } = nextQuestion(state);
            state = served;
            if (!question) break;
            if (outcomeIndex >= outcomes.length) break;
            const result = resultFor(question, outcomes[outcomeIndex++]);
            state = submitBatchResult(state, result);
            submitted.push(result);
            steps++;
          }

          const output = finishBatch(state);
          if (output.results.length !== submitted.length) return false;
          return output.results.every((r, i) => r === submitted[i]);
        },
      ),
    );
  });

  it('a batch with per-word and per-session retry caps at least 1 still drains within the step ceiling', () => {
    const retryPerWordCapAtLeastOne = fc.integer({ min: 1, max: 4 });
    const retryPerSessionCapAtLeastOne = fc.integer({ min: 1, max: 6 });
    fc.assert(
      fc.property(
        wordPoolArb,
        retryPerWordCapAtLeastOne,
        retryPerSessionCapAtLeastOne,
        (wordPool, retryPerWordCap, retryPerSessionCap) => {
          const questions = wordPool.map(makeQuestion);
          const state = initBatchState(questions, retryPerWordCap, new Map(), retryPerSessionCap);
          const { drainedWithinCeiling, finalState } = driveBatch(
            state,
            allWrongOutcomes(questions.length, retryPerWordCap),
          );
          return drainedWithinCeiling && finalState.queue.length === 0;
        },
      ),
    );
  });
});

describe('batch queue — submitting for a question not served this batch', () => {
  it('submitting a result for an unserved word does not enqueue a retry, and does not throw', () => {
    fc.assert(
      fc.property(
        wordPoolArb,
        retryPerWordCapArb,
        retryPerSessionCapArb,
        (wordPool, retryPerWordCap, retryPerSessionCap) => {
          const questions = wordPool.map(makeQuestion);
          const state = initBatchState(questions, retryPerWordCap, new Map(), retryPerSessionCap);
          // Nothing has been served yet, so questionCache is empty — this id
          // was never cached regardless of whether it's in the pool.
          const unservedId = 'never-served';
          const next = submitBatchResult(state, { wordId: unservedId, correct: false });
          return (
            next.queue.length === state.queue.length &&
            (next.batchRetryCounts.get(unservedId) ?? 0) === 0
          );
        },
      ),
    );
  });
});

describe('batch queue — session retry cap ceiling on final totals', () => {
  it('finishBatch output never lets a word\'s session retry total exceed the session cap', () => {
    fc.assert(
      fc.property(
        wordPoolArb,
        retryPerWordCapArb,
        retryPerSessionCapArb,
        outcomesArb,
        (wordPool, retryPerWordCap, retryPerSessionCap, outcomes) => {
          const priorCounts = new Map(wordPool.map((id) => [id, Math.max(0, retryPerSessionCap - 1)]));
          const questions = wordPool.map(makeQuestion);
          const state = initBatchState(questions, retryPerWordCap, priorCounts, retryPerSessionCap);
          const drivingOutcomes = outcomes.length
            ? outcomes
            : allWrongOutcomes(questions.length, retryPerWordCap);
          const { finalState } = driveBatch(state, drivingOutcomes);
          const output = finishBatch(finalState);
          return [...output.sessionRetryCounts.values()].every((total) => total <= retryPerSessionCap);
        },
      ),
    );
  });
});
