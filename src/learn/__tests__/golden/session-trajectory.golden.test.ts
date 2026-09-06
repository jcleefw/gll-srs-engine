import { describe, it, expect } from 'vitest';
import { wordPool } from '../../../../data/mock/mock-word-pool.js';
import {
  initAdaptiveSession,
  advanceAdaptiveSession,
  type AdaptiveSessionState,
  type SessionConfig,
} from '../../engine/adaptive-session.js';
import { assembleBatch } from '../../engine/assemble-batch.js';
import { initBatchState, finishBatch } from '../../engine/batch-queue.js';
import { runAutoInteractive } from '../../../../test-support/auto-answerer.js';
import type { AutoAnswerStrategy } from '../../../../test-support/auto-answer-strategy.js';
import type { MCQQuestion } from '../../types/quiz.js';
import golden from '../fixtures/session-trajectory.golden.json' with { type: 'json' };

// A failure here is a diff, not a verdict. Triage it by hand: confirm the
// change producing the diff is intended, then regenerate this fixture in the
// same commit as that change, reviewed alongside it. Never add an
// auto-regenerate escape hatch — a silently-refreshed fixture stops proving
// anything.

const WORDS = wordPool.slice(0, 6);
const WORDS_PER_BATCH = 3;
const RETRY_PER_WORD_CAP = 2;
const RETRY_PER_SESSION_CAP = 5;
const BATCH_COUNT = 6;

const CONFIG: SessionConfig = {
  wordsPerBatch: WORDS_PER_BATCH,
  masteryThreshold: 2,
  streakThresholds: { correctStreakThreshold: 2, wrongStreakThreshold: 2, maxMastery: 2 },
  maxRetryPerSession: RETRY_PER_SESSION_CAP,
  maxRecheckRatio: 0.4,
};

// wordPool[0] — already mastered before the session starts, and placed into
// the initial recheck set. Its one pending-recheck answer is wrong, which
// adds it to recheckReentered without touching its mastery/streak (D8: the
// pending-answer branch never calls updateRunState). Its session retry
// count is pre-filled to the session cap so it can't be retried again
// within the same batch — otherwise the very next (non-pending) encounter
// of the same word in the same batch would immediately clear
// recheckReentered again (mastery re-checked on every non-pending answer).
// This keeps it visibly mastered-yet-exempt for exactly one batch (#1),
// where nextActivePool would otherwise retire it.
const RECHECK_WORD = WORDS[0].id;

// wordPool[1] — answered wrong for the first 3 batches to accumulate a
// session retry count, then correct for 2 in a row (batches 4-5) to cross
// correctStreakThreshold and trigger the retry-count wipe in
// advanceAdaptiveSession.
const RETRY_WORD = WORDS[1].id;

class ScriptedTrajectoryStrategy implements AutoAnswerStrategy {
  batchNum = 0;

  selectAnswer(question: MCQQuestion): number {
    const wrong = this.shouldAnswerWrong(question.wordId);
    return wrong
      ? question.choices.findIndex((c) => !c.isCorrect)
      : question.choices.findIndex((c) => c.isCorrect);
  }

  private shouldAnswerWrong(wordId: string): boolean {
    if (wordId === RECHECK_WORD) return this.batchNum === 1;
    if (wordId === RETRY_WORD) return this.batchNum <= 3;
    return false;
  }
}

interface BatchTrajectoryStep {
  batchNum: number;
  activeIds: string[];
  queueIds: string[];
  masteredIds: string[];
  recheckPendingIds: string[];
  recheckReenteredIds: string[];
  sessionRetryCounts: Record<string, number>;
}

function toStep(batchNum: number, state: AdaptiveSessionState): BatchTrajectoryStep {
  const masteredIds = [...state.runState.entries()]
    .filter(([, ws]) => ws.mastery >= CONFIG.masteryThreshold)
    .map(([id]) => id);

  return {
    batchNum,
    activeIds: state.active.map((w) => w.id),
    queueIds: state.queue.map((w) => w.id),
    masteredIds,
    recheckPendingIds: [...state.recheckPending],
    recheckReenteredIds: [...state.recheckReentered],
    sessionRetryCounts: Object.fromEntries(state.sessionRetryCounts),
  };
}

function runTrajectory(): BatchTrajectoryStep[] {
  const initialRunState = new Map([
    [
      RECHECK_WORD,
      { wordId: RECHECK_WORD, seen: 2, correct: 2, mastery: 2, correctStreak: 2, wrongStreak: 0, lapses: 0 },
    ],
  ]);

  let sessionState: AdaptiveSessionState = {
    ...initAdaptiveSession(WORDS, CONFIG, new Set([RECHECK_WORD]), initialRunState),
    sessionRetryCounts: new Map([[RECHECK_WORD, RETRY_PER_SESSION_CAP]]),
  };

  const strategy = new ScriptedTrajectoryStrategy();
  const steps: BatchTrajectoryStep[] = [];

  for (let batchNum = 1; batchNum <= BATCH_COUNT; batchNum++) {
    strategy.batchNum = batchNum;

    // shuffle: false — the state machine has no rng seam; queue order needs
    // to stay deterministic without one
    const questions = assembleBatch(sessionState.active, wordPool, [], WORDS_PER_BATCH, { shuffle: false });
    const batchState = initBatchState(questions, RETRY_PER_WORD_CAP, sessionState.sessionRetryCounts, RETRY_PER_SESSION_CAP);
    const { state: finalBatchState } = runAutoInteractive(batchState, strategy);
    const batchOutput = finishBatch(finalBatchState);

    sessionState = advanceAdaptiveSession(sessionState, batchOutput, CONFIG);
    steps.push(toStep(batchNum, sessionState));
  }

  return steps;
}

describe('multi-batch session trajectory golden fixture', () => {
  it('is deterministic across repeated runs', () => {
    const first = runTrajectory();
    const second = runTrajectory();
    expect(second).toEqual(first);
  });

  it('matches recorded output for advanceAdaptiveSession across 6 batches', () => {
    expect(runTrajectory()).toEqual(golden);
  });

  it('exercises a recheck-exemption: the recheck word is mastered but stays active in batch 1', () => {
    const [batch1] = runTrajectory();
    expect(batch1.masteredIds).toContain(RECHECK_WORD);
    expect(batch1.recheckReenteredIds).toContain(RECHECK_WORD);
    expect(batch1.activeIds).toContain(RECHECK_WORD);
  });

  it('exercises a correct-streak retry-wipe: the retry word’s session retry count is cleared once mastered', () => {
    const steps = runTrajectory();
    const beforeWipe = steps.find((s) => s.sessionRetryCounts[RETRY_WORD] > 0);
    const afterWipe = steps.find(
      (s) => s.batchNum > (beforeWipe?.batchNum ?? 0) && !(RETRY_WORD in s.sessionRetryCounts),
    );
    expect(beforeWipe).toBeDefined();
    expect(afterWipe).toBeDefined();
  });
});
