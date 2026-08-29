import { describe, it, expect, vi } from 'vitest';
import { nextActivePool } from '../../engine/session.js';
import type { RunState, WordState } from '../../types/word-state.js';
import type { QuizItem } from '../../engine/compose-word-batch.js';

function makeWordState(mastery: number): WordState {
  return { wordId: 'w', seen: 0, correct: 0, mastery, correctStreak: 0, wrongStreak: 0, lapses: 0 };
}

function makeItem(id: string): QuizItem {
  return { id, native: id, romanization: id, english: id, type: 'noun', language: 'th' };
}

describe('EngineHooks — onPoolAdvanced', () => {
  it('emits retired/refilled counts and the active total', () => {
    const onPoolAdvanced = vi.fn();
    const active = [makeItem('w1'), makeItem('w2')];
    const queue = [makeItem('w3')];
    const runState: RunState = new Map([['w1', makeWordState(3)]]);

    nextActivePool(active, queue, 2, runState, 3, new Set(), { onPoolAdvanced });

    expect(onPoolAdvanced).toHaveBeenCalledTimes(1);
    expect(onPoolAdvanced).toHaveBeenCalledWith(2, { retired: 1, refilled: 1 });
  });

  it('does not emit when nothing retired or refilled', () => {
    const onPoolAdvanced = vi.fn();
    const active = [makeItem('w1')];
    const runState: RunState = new Map();

    nextActivePool(active, [], 2, runState, 3, new Set(), { onPoolAdvanced });

    expect(onPoolAdvanced).not.toHaveBeenCalled();
  });

  it('behaves identically when hooks is omitted', () => {
    const active = [makeItem('w1'), makeItem('w2')];
    const runState: RunState = new Map([['w1', makeWordState(3)]]);

    const result = nextActivePool(active, [], 2, runState, 3);

    expect(result.active).toEqual([makeItem('w2')]);
  });
});
