import { describe, it, expect, vi } from 'vitest';
import {
  resolveEligibleContexts,
  defaultSentenceState,
  type SentenceRunState,
  type RunState,
  type QuizItem,
  type SentenceContext,
  type EngineHooks,
} from '../../index.js';

const testConfig = { minSeenForSentence: 2, sentenceBatchGap: 1 };

const corpus: SentenceContext[] = [
  { sentenceId: 'sent::001', englishSentence: 'a', wordOrder: ['w1', 'w2'] },
  { sentenceId: 'sent::002', englishSentence: 'b', wordOrder: ['w3'] },
  { sentenceId: 'sent::003', englishSentence: 'c', wordOrder: ['w4'] },
  { sentenceId: 'sent::004', englishSentence: 'd', wordOrder: ['w5'] },
];

const seenState = (ids: string[]): RunState => {
  const m: RunState = new Map();
  for (const id of ids) {
    m.set(id, { wordId: id, seen: 2, correct: 0, mastery: 0, correctStreak: 0, wrongStreak: 0, lapses: 0 });
  }
  return m;
};

const pool = (ids: string[]): QuizItem[] =>
  ids.map((id) => ({ id, native: id, romanization: id, english: id, type: 'noun', language: 'th' }));

describe('EngineHooks — onSentenceExcluded', () => {
  it('emits one call per reason present, grouped, all four reasons reachable', () => {
    const onSentenceExcluded = vi.fn();
    const hooks: EngineHooks = { onSentenceExcluded };

    // sent::001 -> word-not-seen-enough (w1, w2 never seen)
    // sent::002 -> sentence-inactive
    // sent::003 -> batch-gap-cooldown
    // sent::004 -> missing-pool-item (w5 not in pool)
    const runState = seenState(['w3', 'w4', 'w5']);
    const sentenceRunState: SentenceRunState = new Map();
    sentenceRunState.set('sent::002', { ...defaultSentenceState('sent::002'), active: false });
    sentenceRunState.set('sent::003', { ...defaultSentenceState('sent::003'), lastBatchSeen: 1 });

    const eligible = resolveEligibleContexts(
      corpus,
      runState,
      pool(['w3', 'w4']),
      sentenceRunState,
      2,
      testConfig,
      undefined,
      hooks,
    );

    expect(eligible).toEqual([]);
    expect(onSentenceExcluded).toHaveBeenCalledTimes(4);
    expect(onSentenceExcluded).toHaveBeenCalledWith(['sent::001'], 'word-not-seen-enough');
    expect(onSentenceExcluded).toHaveBeenCalledWith(['sent::002'], 'sentence-inactive');
    expect(onSentenceExcluded).toHaveBeenCalledWith(['sent::003'], 'batch-gap-cooldown');
    expect(onSentenceExcluded).toHaveBeenCalledWith(['sent::004'], 'missing-pool-item');
  });

  it('does not emit when nothing was excluded', () => {
    const onSentenceExcluded = vi.fn();
    const runState = seenState(['w3']);
    const sentenceRunState: SentenceRunState = new Map();

    resolveEligibleContexts(
      [{ sentenceId: 'sent::002', englishSentence: 'b', wordOrder: ['w3'] }],
      runState,
      pool(['w3']),
      sentenceRunState,
      1,
      testConfig,
      undefined,
      { onSentenceExcluded },
    );

    expect(onSentenceExcluded).not.toHaveBeenCalled();
  });

  it('eligible output is unchanged whether or not hooks are supplied', () => {
    const runState = seenState(['w3']);
    const sentenceRunState: SentenceRunState = new Map();
    const withoutHooks = resolveEligibleContexts(
      [{ sentenceId: 'sent::002', englishSentence: 'b', wordOrder: ['w3'] }],
      runState,
      pool(['w3']),
      sentenceRunState,
      1,
      testConfig,
    );

    expect(withoutHooks.map((e) => e.ctx.sentenceId)).toEqual(['sent::002']);
  });
});
