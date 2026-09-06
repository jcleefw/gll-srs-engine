import { describe, it, expect, vi } from 'vitest';
import { getNewlyMasteredIds } from '../../engine/session.js';
import type { RunState, WordState } from '../../types/word-state.js';

function makeWordState(mastery: number): WordState {
  return { wordId: 'w', seen: 0, correct: 0, mastery, correctStreak: 0, wrongStreak: 0, lapses: 0 };
}

describe('EngineHooks — onMastered', () => {
  it('emits with the newly mastered IDs and reason when threshold crossed', () => {
    const onMastered = vi.fn();
    const prevState: RunState = new Map([['w1', makeWordState(1)]]);
    const nextState: RunState = new Map([['w1', makeWordState(3)]]);

    const result = getNewlyMasteredIds(prevState, nextState, ['w1'], 3, { onMastered });

    expect(result).toEqual(['w1']);
    expect(onMastered).toHaveBeenCalledTimes(1);
    expect(onMastered).toHaveBeenCalledWith(['w1'], 'mastery-threshold');
  });

  it('does not emit when nothing crossed the threshold', () => {
    const onMastered = vi.fn();
    const prevState: RunState = new Map([['w1', makeWordState(1)]]);
    const nextState: RunState = new Map([['w1', makeWordState(1)]]);

    getNewlyMasteredIds(prevState, nextState, ['w1'], 3, { onMastered });

    expect(onMastered).not.toHaveBeenCalled();
  });

  it('behaves identically when hooks is omitted', () => {
    const prevState: RunState = new Map([['w1', makeWordState(1)]]);
    const nextState: RunState = new Map([['w1', makeWordState(3)]]);

    expect(getNewlyMasteredIds(prevState, nextState, ['w1'], 3)).toEqual(['w1']);
  });
});
