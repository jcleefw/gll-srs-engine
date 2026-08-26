import { describe, it } from 'vitest';
import fc from 'fast-check';
import { updateRunState } from '../../types/word-state.js';
import type { RunState, StreakThresholds, WordState } from '../../types/word-state.js';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const thresholdsArb: fc.Arbitrary<StreakThresholds> = fc.record({
  correctStreakThreshold: fc.integer({ min: 1, max: 5 }),
  wrongStreakThreshold: fc.integer({ min: 1, max: 5 }),
  maxMastery: fc.integer({ min: 1, max: 8 }),
});

const answerSequenceArb = fc.array(fc.boolean(), { minLength: 1, maxLength: 60 });

const WORD_ID = 'w1';

/** Runs a sequence of answers through updateRunState, returning the WordState after each step. */
function runSequence(answers: boolean[], thresholds: StreakThresholds): WordState[] {
  let state: RunState = new Map();
  const history: WordState[] = [];
  for (const wasCorrect of answers) {
    state = updateRunState(state, WORD_ID, wasCorrect, thresholds);
    history.push(state.get(WORD_ID)!);
  }
  return history;
}

describe('updateRunState — mastery state machine invariants', () => {
  it('mastery always stays within 0..maxMastery', () => {
    fc.assert(
      fc.property(answerSequenceArb, thresholdsArb, (answers, thresholds) => {
        const history = runSequence(answers, thresholds);
        return history.every((ws) => ws.mastery >= 0 && ws.mastery <= thresholds.maxMastery);
      }),
    );
  });

  it('correctStreak and wrongStreak are never both non-zero at the same time', () => {
    fc.assert(
      fc.property(answerSequenceArb, thresholdsArb, (answers, thresholds) => {
        const history = runSequence(answers, thresholds);
        return history.every((ws) => ws.correctStreak === 0 || ws.wrongStreak === 0);
      }),
    );
  });

  it('seen equals the number of answers applied so far, and correct never exceeds seen', () => {
    fc.assert(
      fc.property(answerSequenceArb, thresholdsArb, (answers, thresholds) => {
        const history = runSequence(answers, thresholds);
        return history.every((ws, i) => ws.seen === i + 1 && ws.correct <= ws.seen);
      }),
    );
  });

  it('correct equals the count of true answers applied so far', () => {
    fc.assert(
      fc.property(answerSequenceArb, thresholdsArb, (answers, thresholds) => {
        const history = runSequence(answers, thresholds);
        return history.every((ws, i) => {
          const expectedCorrect = answers.slice(0, i + 1).filter(Boolean).length;
          return ws.correct === expectedCorrect;
        });
      }),
    );
  });

  it('lapses only ever increases, one step at a time', () => {
    fc.assert(
      fc.property(answerSequenceArb, thresholdsArb, (answers, thresholds) => {
        const history = runSequence(answers, thresholds);
        let prevLapses = 0;
        for (const ws of history) {
          if (ws.lapses < prevLapses || ws.lapses > prevLapses + 1) return false;
          prevLapses = ws.lapses;
        }
        return true;
      }),
    );
  });

  it('lapses increases only on a wrong answer that hits the wrong-streak threshold exactly, with prior mastery above zero', () => {
    fc.assert(
      fc.property(answerSequenceArb, thresholdsArb, (answers, thresholds) => {
        let state: RunState = new Map();
        let prevLapses = 0;
        let prevMastery = 0;
        for (const wasCorrect of answers) {
          const next = updateRunState(state, WORD_ID, wasCorrect, thresholds);
          const ws = next.get(WORD_ID)!;
          if (ws.lapses > prevLapses) {
            const lapseIsValid =
              !wasCorrect && ws.wrongStreak === thresholds.wrongStreakThreshold && prevMastery > 0;
            if (!lapseIsValid) return false;
          }
          prevLapses = ws.lapses;
          prevMastery = ws.mastery;
          state = next;
        }
        return true;
      }),
    );
  });

  it('does not mutate the input state map', () => {
    fc.assert(
      fc.property(fc.boolean(), thresholdsArb, (wasCorrect, thresholds) => {
        const state: RunState = new Map();
        const snapshotSize = state.size;
        updateRunState(state, WORD_ID, wasCorrect, thresholds);
        return state.size === snapshotSize && !state.has(WORD_ID);
      }),
    );
  });
});
