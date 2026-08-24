import { describe, it } from 'vitest';
import fc from 'fast-check';
import { assembleBatch } from '../../engine/assemble-batch.js';
import { validateBatch } from '../../engine/validate-batch.js';
import type { QuizItem } from '../../engine/compose-word-batch.js';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const idArb = fc.stringMatching(/^v[0-9]{1,2}$/);

function makeWord(id: string): QuizItem {
  return {
    id,
    native: `native-${id}`,
    romanization: `roman-${id}`,
    english: `english-${id}`,
    type: 'noun',
    language: 'th',
  };
}

const uniqueIdsArb = fc.uniqueArray(idArb, { minLength: 1, maxLength: 10 });

/** Generates a pool of words plus a same-sized-or-smaller active subset and an exclude set. */
const scenarioArb = uniqueIdsArb.chain((ids) => {
  const words = ids.map(makeWord);
  return fc.record({
    words: fc.constant(words),
    active: fc.subarray(words),
    excludeIds: fc.subarray(ids).map((subset) => new Set(subset)),
    wordsPerBatch: fc.integer({ min: 0, max: 12 }),
  });
});

/**
 * These properties use `validateBatch` as the pass/fail oracle for
 * `assembleBatch`'s output. That is an integration-level check, not a
 * correctness proof of `validateBatch` itself — a bug inside `validateBatch`
 * (e.g. it stops checking one question kind, or checks the wrong field)
 * would make both this suite and the code it's guarding pass together.
 * `validate-batch.test.ts` (unit-level, oracle-free) is what actually pins
 * down `validateBatch`'s own behavior.
 */
describe('validateBatch — assembleBatch oracle', () => {
  it('a batch assembled with excludeIds always passes validateBatch with the same excludeIds', () => {
    fc.assert(
      fc.property(scenarioArb, ({ words, active, excludeIds, wordsPerBatch }) => {
        const questions = assembleBatch(active, words, [], wordsPerBatch, {
          excludeIds,
          shuffle: false,
        });
        const result = validateBatch(questions, { excludeIds });
        return result.valid && result.violations.length === 0;
      }),
    );
  });

  it('no question in the assembled batch carries an excluded word ID, checked independently of validateBatch', () => {
    fc.assert(
      fc.property(scenarioArb, ({ words, active, excludeIds, wordsPerBatch }) => {
        const questions = assembleBatch(active, words, [], wordsPerBatch, {
          excludeIds,
          shuffle: false,
        });
        // Re-derive the leak check by hand (not via validateBatch) so this
        // test can catch a bug in validateBatch itself, not just repeat it.
        return questions.every((q) =>
          q.kind === 'mcq'
            ? !excludeIds.has(q.wordId)
            : q.tiles.every((tile) => !excludeIds.has(tile.wordId)),
        );
      }),
    );
  });

  it('assembleBatch does not throw or over-fill when wordsPerBatch exceeds the pool size', () => {
    fc.assert(
      fc.property(scenarioArb, ({ words, active, excludeIds, wordsPerBatch }) => {
        const questions = assembleBatch(active, words, [], wordsPerBatch, {
          excludeIds,
          shuffle: false,
        });
        return questions.length <= wordsPerBatch;
      }),
    );
  });
});
