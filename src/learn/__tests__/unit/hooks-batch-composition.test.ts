import { describe, it, expect, vi } from 'vitest';
import { assembleBatch } from '../../engine/assemble-batch.js';
import { composeWordBatchMulti, type QuizItem } from '../../engine/compose-word-batch.js';
import type { EngineHooks } from '../../types/hooks.js';

describe('EngineHooks — batch composition', () => {
  const mockWord: QuizItem = {
    id: 'w1',
    native: 'word',
    romanization: 'roman',
    english: 'english',
    type: 'verb',
    language: 'th',
  };

  const mockFoundational: QuizItem = {
    id: 'f1',
    native: 'f',
    romanization: 'f',
    english: 'f',
    foundationalType: 'consonant',
    class: 'middle',
    language: 'th',
  };

  it('assembleBatch emits onBatchAssembled with the foundational/vocabulary split', () => {
    const onBatchAssembled = vi.fn();
    const hooks: EngineHooks = { onBatchAssembled };

    assembleBatch(
      [mockWord, mockFoundational],
      [mockWord],
      [mockFoundational],
      4,
      { shuffle: false },
      hooks,
    );

    expect(onBatchAssembled).toHaveBeenCalledTimes(1);
    expect(onBatchAssembled).toHaveBeenCalledWith(2, { foundational: 2, vocabulary: 2 });
  });

  it('assembleBatch skips onBatchAssembled when active is empty', () => {
    const onBatchAssembled = vi.fn();
    assembleBatch([], [], [], 4, {}, { onBatchAssembled });
    expect(onBatchAssembled).not.toHaveBeenCalled();
  });

  it('composeWordBatchMulti emits onWordBatchComposed with the coverage/filler split', () => {
    const onWordBatchComposed = vi.fn();
    const hooks: EngineHooks = { onWordBatchComposed };

    composeWordBatchMulti(
      [mockWord],
      [mockWord, mockFoundational],
      { questionLimit: 2, shuffle: false },
      hooks,
    );

    expect(onWordBatchComposed).toHaveBeenCalledTimes(1);
    expect(onWordBatchComposed).toHaveBeenCalledWith(2, { coverage: 1, filler: 1 });
  });

  it('composeWordBatchMulti skips onWordBatchComposed when words is empty', () => {
    const onWordBatchComposed = vi.fn();
    composeWordBatchMulti([], [mockWord], { questionLimit: 2 }, { onWordBatchComposed });
    expect(onWordBatchComposed).not.toHaveBeenCalled();
  });

  it('behaves identically when hooks is omitted', () => {
    const withHooks = assembleBatch(
      [mockWord, mockFoundational],
      [mockWord],
      [mockFoundational],
      4,
      { shuffle: false },
    );
    expect(withHooks.length).toBe(4);
  });
});
