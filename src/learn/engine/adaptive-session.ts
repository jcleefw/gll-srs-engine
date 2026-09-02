import type { QuizItem } from './compose-word-batch.js';
import { type RunState, type StreakThresholds } from '../types/word-state.js';
import { type BatchOutput } from './batch-queue.js';

export interface AdaptiveSessionState {
  active: QuizItem[];
  queue: QuizItem[];
  runState: RunState;
  recheckPending: Set<string>;
  recheckReentered: Set<string>;
  batchNum: number;
  sessionRetryCounts: Map<string, number>;
}

export interface SessionConfig {
  wordsPerBatch: number;
  masteryThreshold: number;
  streakThresholds: StreakThresholds;
  maxRetryPerSession: number;
  // Fraction of a batch's slots recheck items may occupy on init; the rest queue up front for later batches.
  maxRecheckRatio: number;
}

export function initAdaptiveSession(
  words: QuizItem[],
  config: SessionConfig,
  recheckIds: Set<string> = new Set(),
  initialRunState?: RunState,
): AdaptiveSessionState {
  const allRecheckItems = words.filter((w) => recheckIds.has(w.id));
  const otherItems = words.filter((w) => !recheckIds.has(w.id));

  const recheckCap = Math.ceil(config.wordsPerBatch * config.maxRecheckRatio);
  const recheckItems = allRecheckItems.slice(0, recheckCap);
  const overflowRecheckItems = allRecheckItems.slice(recheckCap);

  const active = [
    ...recheckItems,
    ...otherItems.slice(
      0,
      Math.max(0, config.wordsPerBatch - recheckItems.length),
    ),
  ];

  const activeIds = new Set(active.map((w) => w.id));
  const queue = [
    ...overflowRecheckItems,
    ...words.filter((w) => !activeIds.has(w.id) && !recheckIds.has(w.id)),
  ];

  return {
    active,
    queue,
    runState: new Map(initialRunState),
    recheckPending: new Set(recheckIds),
    recheckReentered: new Set(),
    batchNum: 0,
    sessionRetryCounts: new Map(),
  };
}

import { updateMasteryState, nextActivePool } from './session.js';
import type { WordQuizResult } from '../types/quiz.js';

/**
 * Applies a scored batch's results to the session: updates mastery and
 * recheck tracking, recomputes the active/queue pools, and merges retry counts.
 *
 * Runs after each batch of quiz answers is scored
 * Based on current session state, plus batch results, produces next session state.
 *
 * @param state Session state prior to this batch.
 * @param batchOutput Scored results from the batch just completed.
 * @param config Session tuning (batch size, mastery threshold, retry caps).
 * @returns The updated session state.
 */
export function advanceAdaptiveSession(
  state: AdaptiveSessionState,
  batchOutput: BatchOutput,
  config: SessionConfig,
): AdaptiveSessionState {
  // Filter down to word results only, remove sentence results
  const wordResults = batchOutput.results.filter(
    (r): r is WordQuizResult => 'wordId' in r,
  );

  const { runState, recheckPending, recheckReentered } = updateMasteryState(
    wordResults,
    state.runState,
    state.recheckPending,
    state.recheckReentered,
    config.masteryThreshold,
    config.streakThresholds,
  );

  // recomputes active/queue pools
  const { active, queue } = nextActivePool(
    state.active,
    state.queue,
    config.wordsPerBatch,
    runState,
    config.masteryThreshold,
    // both recheck stages exempt from retirement
    new Set([...recheckPending, ...recheckReentered]),
  );

  // Copy the old totals map
  const nextSessionRetryCounts = new Map(state.sessionRetryCounts);

  /**
   * for each id in the new batch's totals, overwrite that id's entry in the copy.
   *
   * @example
   * old state: { word-a: 2, word-b: 5}
   * new state this batch: { word-b: 6, word-c: 1 }
   *
   * next batch starting state (after merging):
   * {
   *   word-a: 2,   ← untouched, only in old
   *   word-b: 6,   ← new value wins, old 5 discarded
   *   word-c: 1,   ← added, only in new
   * }
   */
  for (const [id, count] of batchOutput.sessionRetryCounts) {
    nextSessionRetryCounts.set(id, count);
  }

  // A word that's strung together enough correct answers to hit the
  // correct-streak threshold gets its retry budget wiped, so a later cold
  // streak doesn't inherit debt from an earlier hot streak.
  for (const [id, wordState] of runState) {
    if (
      wordState.correctStreak >= config.streakThresholds.correctStreakThreshold
    ) {
      nextSessionRetryCounts.delete(id);
    }
  }

  return {
    active,
    queue,
    runState,
    recheckPending,
    recheckReentered,
    batchNum: state.batchNum + 1,
    sessionRetryCounts: nextSessionRetryCounts,
  };
}
