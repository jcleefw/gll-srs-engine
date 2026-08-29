import {
  composeSentenceBatch,
  assembleBatch,
  initAdaptiveSession,
  advanceAdaptiveSession,
  getNewlyMasteredIds,
  initBatchState,
  finishBatch,
  resolveEligibleContexts,
  updateSentenceRunState,
  isMastered,
  type AdaptiveSessionState,
  type SessionConfig,
  type BatchOutput,
  type QuizItem,
  type RunState,
  type StreakThresholds,
  type SentenceContext,
  type SentenceRunState,
  type SentenceQuizResult,
  type WordQuizResult,
  type GraduationHook,
} from '../src/learn/index.js';
import type { AutoAnswerStrategy } from './auto-answer-strategy.js';
import { runAutoInteractive } from './auto-answerer.js';

export interface SentenceEligibilityConfig {
  minSeenForSentence: number;
  sentenceBatchGap: number;
  sentenceCorrectStreakThreshold: number;
  sentenceWrongStreakThreshold: number;
}

interface RunBatchResult extends BatchOutput {
  correct: number;
  total: number;
}

function runBatch(
  state: AdaptiveSessionState,
  wordPool: QuizItem[],
  foundationalPool: QuizItem[],
  wordsPerBatch: number,
  corpus: SentenceContext[],
  sentenceRunState: SentenceRunState,
  batchNum: number,
  sentenceConfig: SentenceEligibilityConfig,
  maxRetryPerWord: number,
  maxRetryPerSession: number,
  strategy: AutoAnswerStrategy,
): RunBatchResult {
  const allPool = [...wordPool, ...foundationalPool];
  const extraThunks = resolveEligibleContexts(
    corpus,
    state.runState,
    allPool,
    sentenceRunState,
    batchNum,
    sentenceConfig,
  ).map(
    ({ ctx, tiles }) =>
      () =>
        composeSentenceBatch(ctx, tiles, 'th', { shuffle: false }),
  );

  const questions = assembleBatch(
    state.active,
    wordPool,
    foundationalPool,
    wordsPerBatch,
    { shuffle: false, extraThunks },
  );

  const batchState = initBatchState(
    questions,
    maxRetryPerWord,
    state.sessionRetryCounts,
    maxRetryPerSession,
  );

  const runStats = runAutoInteractive(batchState, strategy);
  const output = finishBatch(runStats.state);
  return {
    ...output,
    correct: runStats.correct,
    total: runStats.total,
  };
}

/**
 * Drives the adaptive session state machine to completion with no I/O — the
 * pure orchestration extracted from demo/learning-io.ts's runAdaptiveLoop,
 * for use by auto-answer-strategy-driven tests.
 */
export async function runAdaptiveLoop(
  words: QuizItem[],
  wordPool: QuizItem[],
  foundationalPool: QuizItem[],
  corpus: SentenceContext[],
  wordsPerBatch: number,
  masteryThreshold: number,
  streakThresholds: StreakThresholds,
  sentenceConfig: SentenceEligibilityConfig,
  maxRetryPerWord: number,
  maxRetryPerSession: number,
  strategy: AutoAnswerStrategy,
  initialRunState: RunState = new Map(),
  initialSentenceRunState: SentenceRunState = new Map(),
  recheckIds: Set<string> = new Set(),
  onGraduation?: GraduationHook,
): Promise<{ runState: RunState; sentenceRunState: SentenceRunState }> {
  const config: SessionConfig = {
    wordsPerBatch,
    masteryThreshold,
    streakThresholds,
    maxRetryPerSession,
    maxRecheckRatio: 0.4,
  };

  const snapshotRunState = new Map(initialRunState);
  let state = initAdaptiveSession(words, config, recheckIds, initialRunState);
  const sentenceRunState: SentenceRunState = new Map(initialSentenceRunState);

  for (;;) {
    if (state.active.length === 0 && state.queue.length === 0) break;

    const currentBatchNum = state.batchNum + 1;
    const { results, sessionRetryCounts } = runBatch(
      state,
      wordPool,
      foundationalPool,
      wordsPerBatch,
      corpus,
      sentenceRunState,
      currentBatchNum,
      sentenceConfig,
      maxRetryPerWord,
      maxRetryPerSession,
      strategy,
    );

    const sentenceResults = results.filter(
      (r): r is SentenceQuizResult => 'sentenceId' in r,
    );
    updateSentenceRunState(
      sentenceRunState,
      sentenceResults,
      currentBatchNum,
      sentenceConfig,
    );

    const batchOutput: BatchOutput = { results, sessionRetryCounts };

    const prevState = state.runState;
    state = advanceAdaptiveSession(state, batchOutput, config);

    const wordResults = results.filter(
      (r): r is WordQuizResult => 'wordId' in r,
    );
    const batchWordIds = [...new Set(wordResults.map((r) => r.wordId))];
    getNewlyMasteredIds(
      prevState,
      state.runState,
      batchWordIds,
      masteryThreshold,
    );
  }

  if (onGraduation) {
    const graduatedWordIds: string[] = [];
    for (const [wordId, ws] of state.runState) {
      if (isMastered(ws, masteryThreshold)) {
        const prev = snapshotRunState.get(wordId);
        if (!prev || !isMastered(prev, masteryThreshold)) {
          graduatedWordIds.push(wordId);
        }
      }
    }
    await onGraduation(graduatedWordIds, state.runState);
  }

  return { runState: state.runState, sentenceRunState };
}
