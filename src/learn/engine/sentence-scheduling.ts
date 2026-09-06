import type { SentenceContext } from '../types/sentence.js';
import type { SentenceRunState } from '../types/sentence-state.js';
import type { SentenceQuizResult } from '../types/quiz.js';
import type { RunState } from '../types/word-state.js';
import type { QuizItem } from './compose-word-batch.js';
import type { SentenceTile } from '../types/quiz.js';
import type { EngineHooks, SentenceExclusionReason } from '../types/hooks.js';
import { defaultSentenceState } from '../types/sentence-state.js';

/**
 * Gates a single context against the seen/active/cooldown rules, in order.
 * Returns the reason it was excluded, or null when it passes all three.
 * @example
 * ctx not yet seen enough  -> 'word-not-seen-enough'
 * ctx active, no cooldown  -> null
 */
function getGateExclusionReason(
  ctx: SentenceContext,
  runState: RunState,
  sentenceRunState: SentenceRunState,
  batchNum: number,
  config: { minSeenForSentence: number; sentenceBatchGap: number },
): SentenceExclusionReason | null {
  const wordSeenPass = ctx.wordOrder.every(
    (id) => (runState.get(id)?.seen ?? 0) >= config.minSeenForSentence,
  );
  if (!wordSeenPass) return 'word-not-seen-enough';

  const sState =
    sentenceRunState.get(ctx.sentenceId) ?? defaultSentenceState(ctx.sentenceId);

  if (!sState.active) return 'sentence-inactive';

  if (sState.lastBatchSeen !== -1) {
    const gap = batchNum - sState.lastBatchSeen;
    if (gap <= config.sentenceBatchGap) return 'batch-gap-cooldown';
  }

  return null;
}

export function resolveEligibleContexts(
  corpus: SentenceContext[],
  runState: RunState,
  allPool: QuizItem[],
  sentenceRunState: SentenceRunState,
  batchNum: number,
  config: { minSeenForSentence: number; sentenceBatchGap: number },
  excludeIds?: Set<string>,
  hooks?: EngineHooks,
): { ctx: SentenceContext; tiles: SentenceTile[] }[] {
  const poolMap = new Map(
    allPool
      .filter((w) => !excludeIds?.has(w.id))
      .map((w) => [w.id, w]),
  );

  const excludedByReason = new Map<SentenceExclusionReason, string[]>();
  const recordExclusion = (sentenceId: string, reason: SentenceExclusionReason): void => {
    const ids = excludedByReason.get(reason) ?? [];
    ids.push(sentenceId);
    excludedByReason.set(reason, ids);
  };

  const gated = corpus.filter((ctx) => {
    const reason = getGateExclusionReason(ctx, runState, sentenceRunState, batchNum, config);
    if (reason) {
      recordExclusion(ctx.sentenceId, reason);
      return false;
    }
    return true;
  });

  const eligible = gated
    .map((ctx) => {
      const tiles: SentenceTile[] = ctx.wordOrder.flatMap((id) => {
        const item = poolMap.get(id);
        if (!item) return [];
        return [{ wordId: item.id, native: item.native, romanization: item.romanization, english: item.english }];
      });
      return { ctx, tiles };
    })
    .filter(({ ctx: c, tiles }) => {
      const passes = tiles.length === c.wordOrder.length;
      if (!passes) recordExclusion(c.sentenceId, 'missing-pool-item');
      return passes;
    });

  for (const [reason, ids] of excludedByReason) {
    hooks?.onSentenceExcluded?.(ids, reason);
  }

  return eligible;
}

export function updateSentenceRunState(
  sentenceRunState: SentenceRunState,
  results: SentenceQuizResult[],
  batchNum: number,
  config: {
    sentenceCorrectStreakThreshold: number;
    sentenceWrongStreakThreshold: number;
  },
): SentenceRunState {
  for (const r of results) {
    const existing =
      sentenceRunState.get(r.sentenceId) ?? defaultSentenceState(r.sentenceId);

    if (r.correct) {
      existing.sentenceStreak += 1;
      existing.sessionWrongStreak = 0;
      if (existing.sentenceStreak >= config.sentenceCorrectStreakThreshold) {
        existing.active = false;
      }
    } else {
      existing.sessionWrongStreak += 1;
      existing.sentenceStreak = 0;
      if (existing.sessionWrongStreak >= config.sentenceWrongStreakThreshold) {
        existing.active = false;
      }
    }
    existing.lastBatchSeen = batchNum;
    sentenceRunState.set(r.sentenceId, existing);
  }
  return sentenceRunState;
}
