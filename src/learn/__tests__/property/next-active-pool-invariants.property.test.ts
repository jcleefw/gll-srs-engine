import { describe, it } from 'vitest';
import fc from 'fast-check';
import { nextActivePool } from '../../engine/session.js';
import type { QuizItem } from '../../engine/compose-word-batch.js';
import type { RunState, WordState } from '../../types/word-state.js';

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

function makeWordState(id: string, mastery: number): WordState {
  return { wordId: id, seen: 1, correct: 1, mastery, correctStreak: 0, wrongStreak: 0, lapses: 0 };
}

const MASTERY_THRESHOLD = 2;

/**
 * Builds a scenario: a pool of unique word IDs split into disjoint active/queue
 * groups, a mastery value per word (some at/above threshold, some below), a
 * recheck-exempt subset, and a wordsPerBatch target.
 */
// wordsPerBatch is generated >= activeCount: nextActivePool's "active never
// exceeds wordsPerBatch" contract assumes the caller respects that bound on
// entry — the function only ever holds or removes active items, it never
// trims an already-oversized active list down to size.
const scenarioArb = fc.uniqueArray(idArb, { minLength: 0, maxLength: 14 }).chain((ids) =>
  fc.integer({ min: 0, max: ids.length }).chain((activeCount) =>
    fc.record({
      ids: fc.constant(ids),
      activeCount: fc.constant(activeCount),
      masteryByIndex: fc.array(fc.integer({ min: 0, max: 4 }), { minLength: ids.length, maxLength: ids.length }),
      // A subset with no runState entry at all — nextActivePool treats a
      // missing entry as unmastered (session.ts: `!wordState || ...`), so
      // this branch needs its own generated coverage, not just tolerance
      // in the assertions.
      missingRunStateSubset: fc.subarray(ids),
      recheckExemptSubset: fc.subarray(ids),
      wordsPerBatch: fc.integer({ min: activeCount, max: 14 }),
    }),
  ),
);

interface Scenario {
  ids: string[];
  activeCount: number;
  masteryByIndex: number[];
  missingRunStateSubset: string[];
  recheckExemptSubset: string[];
  wordsPerBatch: number;
}

interface BuiltScenario {
  active: QuizItem[];
  queue: QuizItem[];
  wordsPerBatch: number;
  runState: RunState;
  recheckExempt: Set<string>;
}

function buildScenario(s: Scenario): BuiltScenario {
  const { ids, activeCount, masteryByIndex, missingRunStateSubset, recheckExemptSubset, wordsPerBatch } = s;
  const activeIds = ids.slice(0, activeCount);
  const queueIds = ids.slice(activeCount);
  const active = activeIds.map(makeWord);
  const queue = queueIds.map(makeWord);

  const missingRunState = new Set(missingRunStateSubset);
  const runState: RunState = new Map();
  ids.forEach((id: string, i: number) => {
    if (missingRunState.has(id)) return;
    runState.set(id, makeWordState(id, masteryByIndex[i]));
  });

  const recheckExempt = new Set(recheckExemptSubset);

  return { active, queue, wordsPerBatch, runState, recheckExempt };
}

describe('nextActivePool — retirement and conservation invariants', () => {
  it('active never exceeds wordsPerBatch', () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const { active, queue, wordsPerBatch, runState, recheckExempt } = buildScenario(s);
        const result = nextActivePool(active, queue, wordsPerBatch, runState, MASTERY_THRESHOLD, recheckExempt);
        return result.active.length <= wordsPerBatch;
      }),
    );
  });

  it('no mastered word survives in active unless it is recheck-exempt', () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const { active, queue, wordsPerBatch, runState, recheckExempt } = buildScenario(s);
        const result = nextActivePool(active, queue, wordsPerBatch, runState, MASTERY_THRESHOLD, recheckExempt);
        return result.active.every((item) => {
          if (recheckExempt.has(item.id)) return true;
          const ws = runState.get(item.id);
          return !ws || ws.mastery < MASTERY_THRESHOLD;
        });
      }),
    );
  });

  it('no mastered word from the queue is ever promoted into active', () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const { active, queue, wordsPerBatch, runState, recheckExempt } = buildScenario(s);
        const beforeActiveIds = new Set(active.map((item) => item.id));
        const result = nextActivePool(active, queue, wordsPerBatch, runState, MASTERY_THRESHOLD, recheckExempt);
        const promoted = result.active.filter((item) => !beforeActiveIds.has(item.id));
        return promoted.every((item) => {
          const ws = runState.get(item.id);
          return !ws || ws.mastery < MASTERY_THRESHOLD;
        });
      }),
    );
  });

  it('no item is lost or duplicated across active + queue, beyond mastered items being dropped', () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const { active, queue, wordsPerBatch, runState, recheckExempt } = buildScenario(s);
        const before = [...active, ...queue];
        const result = nextActivePool(active, queue, wordsPerBatch, runState, MASTERY_THRESHOLD, recheckExempt);
        const after = [...result.active, ...result.queue];

        // No duplicates in the output.
        const afterIds = after.map((item) => item.id);
        if (new Set(afterIds).size !== afterIds.length) return false;

        // Every surviving item was present before.
        const beforeIds = new Set(before.map((item) => item.id));
        if (!afterIds.every((id) => beforeIds.has(id))) return false;

        // Every item dropped from before→after is accounted for: the only
        // reason nextActivePool removes an item entirely (rather than moving
        // it between the two lists) is that it is mastered.
        const droppedIds = [...beforeIds].filter((id) => !new Set(afterIds).has(id));
        return droppedIds.every((id) => {
          const ws = runState.get(id);
          return !!ws && ws.mastery >= MASTERY_THRESHOLD;
        });
      }),
    );
  });
});
