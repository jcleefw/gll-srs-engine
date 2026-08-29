import { describe, it, expect, vi } from 'vitest';
import { initBatchState, nextQuestion, submitBatchResult } from '../../engine/batch-queue.js';
import { type QuizQuestion } from '../../types/quiz.js';

describe('EngineHooks — onRetryDecision', () => {
  const q1: QuizQuestion = {
    kind: 'mcq',
    wordId: 'w1',
    direction: 'native-to-english',
    prompt: 'w1-native',
    choices: [],
  };

  it('emits retry when both caps allow and the question is cached', () => {
    const onRetryDecision = vi.fn();
    const state = initBatchState([q1], 1, new Map(), 5);
    const { state: served } = nextQuestion(state);

    submitBatchResult(served, { wordId: 'w1', correct: false }, { onRetryDecision });

    expect(onRetryDecision).toHaveBeenCalledTimes(1);
    expect(onRetryDecision).toHaveBeenCalledWith('w1', 0, 5, 'retry');
  });

  it('emits drop when the per-word batch cap is exhausted', () => {
    const onRetryDecision = vi.fn();
    let state = initBatchState([q1], 1, new Map(), 5);
    let res = nextQuestion(state);
    state = submitBatchResult(res.state, { wordId: 'w1', correct: false });
    res = nextQuestion(state);
    state = res.state;

    submitBatchResult(state, { wordId: 'w1', correct: false }, { onRetryDecision });

    expect(onRetryDecision).toHaveBeenCalledTimes(1);
    expect(onRetryDecision).toHaveBeenCalledWith('w1', 1, 5, 'drop');
  });

  it('emits drop on the silent cache-miss path — caps allow but nothing is cached', () => {
    const onRetryDecision = vi.fn();
    // Never served via nextQuestion, so questionCache has no entry for 'w1'.
    const state = initBatchState([], 1, new Map(), 5);

    submitBatchResult(state, { wordId: 'w1', correct: false }, { onRetryDecision });

    expect(onRetryDecision).toHaveBeenCalledTimes(1);
    expect(onRetryDecision).toHaveBeenCalledWith('w1', 0, 5, 'drop');
  });

  it('does not emit on a correct result', () => {
    const onRetryDecision = vi.fn();
    const state = initBatchState([q1], 1, new Map(), 5);

    submitBatchResult(state, { wordId: 'w1', correct: true }, { onRetryDecision });

    expect(onRetryDecision).not.toHaveBeenCalled();
  });

  it('behaves identically when hooks is omitted', () => {
    const state = initBatchState([q1], 1, new Map(), 5);
    const { state: served } = nextQuestion(state);

    const result = submitBatchResult(served, { wordId: 'w1', correct: false });

    expect(result.queue).toHaveLength(1);
  });
});
