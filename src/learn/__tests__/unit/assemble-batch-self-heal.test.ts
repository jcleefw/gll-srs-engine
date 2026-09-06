import { describe, it, expect } from 'vitest';
import { assembleBatch } from '../../engine/assemble-batch.js';
import { type QuizItem } from '../../engine/compose-word-batch.js';
import { type QuizQuestion, type SentenceQuestion, type MCQQuestion } from '../../types/quiz.js';

describe('assembleBatch — validateBatch self-healing', () => {
  const w1: QuizItem = {
    id: 'w1',
    native: 'word1',
    romanization: 'roman1',
    english: 'english1',
    type: 'verb',
    language: 'th',
  };

  function sentenceTile(wordId: string): SentenceQuestion['tiles'][number] {
    return { wordId, native: wordId, romanization: wordId, english: wordId };
  }

  function sentence(
    sentenceId: string,
    wordIds: string[],
    direction: SentenceQuestion['direction'] = 'native-to-english',
  ): SentenceQuestion {
    return {
      kind: 'word-block',
      sentenceId,
      direction,
      prompt: sentenceId,
      tiles: wordIds.map(sentenceTile),
      answer: wordIds,
    };
  }

  function mcq(wordId: string, choices: MCQQuestion['choices'] = [{ label: 'a', value: wordId, isCorrect: true }]): MCQQuestion {
    return {
      kind: 'mcq',
      wordId,
      direction: 'native-to-english',
      prompt: wordId,
      choices,
    };
  }

  it('thunk respects excludeIds on the initial pass: no leak, no retry needed', () => {
    const leaked = 'shelved-leak';
    let calls = 0;
    // A cooperating thunk filters its own output against excludeIds
    // @example
    // excludeIds = {leaked}, tiles = [leaked, w2]
    // returned   = [w2]
    const extraThunk = (excludeIds?: Set<string>): QuizQuestion[] => {
      calls += 1;
      const wordIds = [leaked, 'w2'].filter((id) => !excludeIds?.has(id));
      return wordIds.length > 0 ? [sentence('s1', wordIds)] : [];
    };

    const questions = assembleBatch([w1], [w1], [], 10, {
      excludeIds: new Set([leaked]),
      extraThunks: [extraThunk],
      shuffle: false,
    });

    expect(calls).toBe(1);
    expect(
      questions.some(
        (q) => q.kind === 'word-block' && q.tiles.some((t) => t.wordId === leaked),
      ),
    ).toBe(false);
  });

  it('no violation: batch is unchanged and extra thunk runs exactly once', () => {
    let calls = 0;
    const extraThunk = (): QuizQuestion[] => {
      calls += 1;
      return [sentence('s1', ['w2'])];
    };

    const questions = assembleBatch([w1], [w1], [], 10, {
      extraThunks: [extraThunk],
      shuffle: false,
    });

    expect(calls).toBe(1);
    expect(questions.some((q) => q.kind === 'word-block' && q.sentenceId === 's1')).toBe(true);
  });

  it('duplicate-question violation with no excludeIds leak: no retry fires, second occurrence is dropped', () => {
    let calls = 0;
    const extraThunk = (): QuizQuestion[] => {
      calls += 1;
      return [sentence('s1', ['w2']), sentence('s1', ['w2'])];
    };

    const questions = assembleBatch([w1], [w1], [], 10, {
      extraThunks: [extraThunk],
      shuffle: false,
    });

    // No excluded-word violation means widening excludeIds has nothing to add,
    // so the retry step is skipped entirely — the thunk runs once.
    expect(calls).toBe(1);
    const s1Count = questions.filter((q) => q.kind === 'word-block' && q.sentenceId === 's1').length;
    expect(s1Count).toBe(1);
  });

  it('empty-choices violation with no excludeIds leak: no retry fires, offending question is dropped', () => {
    let calls = 0;
    const extraThunk = (): QuizQuestion[] => {
      calls += 1;
      return [mcq('empty-word', [])];
    };

    const questions = assembleBatch([w1], [w1], [], 10, {
      extraThunks: [extraThunk],
      shuffle: false,
    });

    expect(calls).toBe(1);
    expect(questions.some((q) => q.kind === 'mcq' && q.wordId === 'empty-word')).toBe(false);
  });

  it('excludeIds leak plus a surviving duplicate: retries once, then drops the duplicate', () => {
    const leaked = 'shelved-leak';
    const extraThunk = (excludeIds?: Set<string>): QuizQuestion[] => {
      // Filters the leak but can't dedupe the sentence identity it also produces
      // @example
      // sentences = [leaked, w2, w2]
      // filtered  = [w2, w2]  (dedupe happens downstream)
      const wordIds = [leaked].filter((id) => !excludeIds?.has(id));
      return [
        ...(wordIds.length > 0 ? [sentence('s1', wordIds)] : []),
        sentence('s1', ['w2']),
        sentence('s1', ['w2']),
      ];
    };

    const questions = assembleBatch([w1], [w1], [], 10, {
      excludeIds: new Set([leaked]),
      extraThunks: [extraThunk],
      shuffle: false,
    });

    expect(questions.some((q) => q.kind === 'word-block' && q.tiles.some((t) => t.wordId === leaked))).toBe(
      false,
    );
    const s1Count = questions.filter((q) => q.kind === 'word-block' && q.sentenceId === 's1').length;
    expect(s1Count).toBe(1);
  });

  it('excludeIds leak that the thunk cannot filter (stale/deterministic producer): retry is a no-op, safety net drops it', () => {
    const leaked = 'shelved-leak';
    let calls = 0;
    // A non-cooperating thunk ignores excludeIds, so the safety net drops it instead
    // @example
    // excludeIds = {leaked}, thunk output = [leaked, w2] (unfiltered)
    // final batch = w2 only, leaked question dropped
    const extraThunk = (): QuizQuestion[] => {
      calls += 1;
      return [sentence('s1', [leaked, 'w2'])];
    };

    const questions = assembleBatch([w1], [w1], [], 10, {
      excludeIds: new Set([leaked]),
      extraThunks: [extraThunk],
      shuffle: false,
    });

    expect(calls).toBe(2);
    expect(
      questions.some(
        (q) => q.kind === 'word-block' && q.tiles.some((t) => t.wordId === leaked),
      ),
    ).toBe(false);
  });

  it('never throws when a violation survives the retry', () => {
    const extraThunk = (): QuizQuestion[] => [mcq('empty-word', [])];

    expect(() =>
      assembleBatch([w1], [w1], [], 10, {
        extraThunks: [extraThunk],
        shuffle: false,
      }),
    ).not.toThrow();
  });
});
