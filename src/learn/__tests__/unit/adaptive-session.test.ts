import { describe, it, expect } from 'vitest';
import {
  initAdaptiveSession,
  advanceAdaptiveSession,
} from '../../engine/adaptive-session.js';
import type { QuizItem } from '../../engine/compose-word-batch.js';

describe('initAdaptiveSession', () => {
  const mockWords: QuizItem[] = [
    {
      id: 'w1',
      native: 'n1',
      romanization: 'r1',
      english: 'e1',
      type: 'word',
      language: 'th',
    },
    {
      id: 'w2',
      native: 'n2',
      romanization: 'r2',
      english: 'e2',
      type: 'word',
      language: 'th',
    },
    {
      id: 'w3',
      native: 'n3',
      romanization: 'r3',
      english: 'e3',
      type: 'word',
      language: 'th',
    },
    {
      id: 'w4',
      native: 'n4',
      romanization: 'r4',
      english: 'e4',
      type: 'word',
      language: 'th',
    },
  ];

  const config = {
    wordsPerBatch: 2,
    masteryThreshold: 2,
    streakThresholds: {
      correctStreakThreshold: 2,
      wrongStreakThreshold: 2,
      maxMastery: 2,
    },
    maxRetryPerSession: 5,
    maxRecheckRatio: 1,
  };

  it('partitions recheck IDs into active and fills the rest from words', () => {
    const recheckIds = new Set(['w3']);
    const state = initAdaptiveSession(mockWords, config, recheckIds);

    expect(state.active.map((w) => w.id)).toEqual(['w3', 'w1']);
    expect(state.queue.map((w) => w.id)).toEqual(['w2', 'w4']);
    expect(state.recheckPending).toEqual(new Set(['w3']));
    expect(state.batchNum).toBe(0);
  });

  it('clones initialRunState to prevent cross-deck mutation', () => {
    const initialRunState = new Map([
      [
        'w1',
        {
          wordId: 'w1',
          seen: 1,
          correct: 1,
          mastery: 1,
          correctStreak: 1,
          wrongStreak: 0,
          lapses: 0,
        },
      ],
    ]);
    const state = initAdaptiveSession(
      mockWords,
      config,
      new Set(),
      initialRunState,
    );

    // Mutation of original should not affect state
    initialRunState.set('w1', { ...initialRunState.get('w1')!, seen: 99 });
    expect(state.runState.get('w1')?.seen).toBe(1);
  });

  it('excludes recheck words from the "other" bucket so they are not duplicated in active', () => {
    const recheckIds = new Set(['w3']);
    const state = initAdaptiveSession(
      mockWords,
      { ...config, wordsPerBatch: 4 },
      recheckIds,
    );

    expect(state.active.map((w) => w.id)).toEqual(['w3', 'w1', 'w2', 'w4']);
  });

  it('recheck items alone meeting wordsPerBatch pull in none of the "other" bucket', () => {
    const recheckIds = new Set(['w2', 'w3']);
    const state = initAdaptiveSession(
      mockWords,
      { ...config, wordsPerBatch: 2 },
      recheckIds,
    );

    expect(state.active.map((w) => w.id)).toEqual(['w2', 'w3']);
    expect(state.queue.map((w) => w.id)).toEqual(['w1', 'w4']);
  });

  it('recheck items alone exceeding wordsPerBatch are capped by maxRecheckRatio, overflow queues first', () => {
    const recheckIds = new Set(['w1', 'w2', 'w3']);
    const state = initAdaptiveSession(
      mockWords,
      { ...config, wordsPerBatch: 2, maxRecheckRatio: 0.4 },
      recheckIds,
    );

    // ceil(2 * 0.4) = 1 recheck slot; the other active slot fills from otherItems (w4).
    expect(state.active.map((w) => w.id)).toEqual(['w1', 'w4']);
    expect(state.active.length).toBeLessThanOrEqual(2);
    // Overflow rechecks (w2, w3) queue ahead of any remaining non-recheck words.
    expect(state.queue.map((w) => w.id)).toEqual(['w2', 'w3']);
  });
});

describe('advanceAdaptiveSession', () => {
  const mockWords: QuizItem[] = [
    {
      id: 'w1',
      native: 'n1',
      romanization: 'r1',
      english: 'e1',
      type: 'word',
      language: 'th',
    },
    {
      id: 'w2',
      native: 'n2',
      romanization: 'r2',
      english: 'e2',
      type: 'word',
      language: 'th',
    },
    {
      id: 'w3',
      native: 'n3',
      romanization: 'r3',
      english: 'e3',
      type: 'word',
      language: 'th',
    },
  ];

  const config = {
    wordsPerBatch: 2,
    masteryThreshold: 1, // Master after 1 correct
    streakThresholds: {
      correctStreakThreshold: 1,
      wrongStreakThreshold: 1,
      maxMastery: 1,
    },
    maxRetryPerSession: 5,
    maxRecheckRatio: 1,
  };

  it('updates mastery, moves pool, and increments batchNum', () => {
    const initialState = initAdaptiveSession(mockWords, config);
    // Active: w1, w2. Queue: w3.

    const batchOutput = {
      results: [{ wordId: 'w1', correct: true }],
      sessionRetryCounts: new Map(),
    };

    const nextState = advanceAdaptiveSession(initialState, batchOutput, config);

    // w1 should be mastered and removed from active
    expect(nextState.runState.get('w1')?.mastery).toBe(1);
    expect(nextState.active.map((w) => w.id)).toEqual(['w2', 'w3']); // w3 pulled in
    expect(nextState.batchNum).toBe(1);
  });

  it('ignores sentence results in Phase 2', () => {
    const initialState = initAdaptiveSession(mockWords, config);
    const batchOutput = {
      results: [{ sentenceId: 's1', correct: true }],
      sessionRetryCounts: new Map(),
    };

    const nextState = advanceAdaptiveSession(initialState, batchOutput, config);

    // runState should be identical since sentence results are ignored
    expect(nextState.runState).toEqual(initialState.runState);
    expect(nextState.batchNum).toBe(1);
  });

  it('merges sessionRetryCounts from BatchOutput', () => {
    const initialState = initAdaptiveSession(mockWords, config);
    const batchOutput = {
      results: [],
      sessionRetryCounts: new Map([['w1', 3]]),
    };

    const nextState = advanceAdaptiveSession(initialState, batchOutput, config);

    expect(nextState.sessionRetryCounts.get('w1')).toBe(3);
  });

  it('ensures immutability of runState and sessionRetryCounts', () => {
    const initialState = initAdaptiveSession(mockWords, config);
    const batchOutput = {
      results: [{ wordId: 'w1', correct: true }],
      sessionRetryCounts: new Map([['w1', 1]]),
    };

    const nextState = advanceAdaptiveSession(initialState, batchOutput, config);

    // Modifying nextState should not affect initialState
    nextState.runState.set('w1', {
      ...nextState.runState.get('w1')!,
      seen: 99,
    });
    expect(initialState.runState.get('w1')?.seen).toBeUndefined();

    nextState.sessionRetryCounts.set('w1', 99);
    expect(initialState.sessionRetryCounts.get('w1')).toBeUndefined();
  });

  it('exempts an already-mastered, still-reentered word from retirement out of active', () => {
    const initialState = initAdaptiveSession(mockWords, config);
    initialState.runState.set('w1', {
      wordId: 'w1',
      seen: 2,
      correct: 2,
      mastery: config.masteryThreshold,
      correctStreak: 2,
      wrongStreak: 0,
      lapses: 0,
    });
    initialState.recheckReentered.add('w1');

    const batchOutput = {
      results: [{ wordId: 'w2', correct: false }],
      sessionRetryCounts: new Map(),
    };

    const nextState = advanceAdaptiveSession(initialState, batchOutput, config);

    expect(nextState.active.map((w) => w.id)).toContain('w1');
  });

  describe('correct-streak retry-wipe', () => {
    it('wipes a word’s session retry count once it crosses the correct-streak threshold', () => {
      const initialState = initAdaptiveSession(mockWords, config);
      initialState.sessionRetryCounts.set('w1', 3);

      const batchOutput = {
        results: [{ wordId: 'w1', correct: true }],
        sessionRetryCounts: new Map([['w1', 3]]),
      };

      const nextState = advanceAdaptiveSession(initialState, batchOutput, config);

      expect(nextState.runState.get('w1')?.correctStreak).toBeGreaterThanOrEqual(
        config.streakThresholds.correctStreakThreshold,
      );
      expect(nextState.sessionRetryCounts.has('w1')).toBe(false);
    });

    it('does not wipe a session retry count for a word below the correct-streak threshold', () => {
      const highThresholdConfig = {
        ...config,
        streakThresholds: { ...config.streakThresholds, correctStreakThreshold: 5 },
      };
      const initialState = initAdaptiveSession(mockWords, highThresholdConfig);
      initialState.sessionRetryCounts.set('w1', 2);

      const batchOutput = {
        results: [{ wordId: 'w1', correct: true }],
        sessionRetryCounts: new Map([['w1', 2]]),
      };

      const nextState = advanceAdaptiveSession(
        initialState,
        batchOutput,
        highThresholdConfig,
      );

      expect(nextState.runState.get('w1')?.correctStreak).toBeLessThan(
        highThresholdConfig.streakThresholds.correctStreakThreshold,
      );
      expect(nextState.sessionRetryCounts.get('w1')).toBe(2);
    });

    it('preserves retry counts for words untouched by runState (loop scoped to runState entries only)', () => {
      const initialState = initAdaptiveSession(mockWords, config);
      initialState.sessionRetryCounts.set('w3', 4);

      const batchOutput = {
        results: [{ wordId: 'w1', correct: true }],
        sessionRetryCounts: new Map(),
      };

      const nextState = advanceAdaptiveSession(initialState, batchOutput, config);

      expect(nextState.sessionRetryCounts.get('w3')).toBe(4);
    });
  });
});
