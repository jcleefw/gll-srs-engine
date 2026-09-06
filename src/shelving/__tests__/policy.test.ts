import { describe, it, expect, vi } from 'vitest';
import type { ShelvingConfig } from '../types.js';
import { evaluateShelving, unshelveAll } from '../policy.js';

const config: ShelvingConfig = {
  stagnationBatchWindow: 3,
  maxShelved: 2,
};

// ---------------------------------------------------------------------------
// evaluateShelving
// ---------------------------------------------------------------------------

describe('evaluateShelving', () => {
  it('no stagnant + no shelved → { toShelve: [], toUnshelve: [] }', () => {
    const result = evaluateShelving([], new Set(), config);
    expect(result).toEqual({ toShelve: [], toUnshelve: [] });
  });

  it('1 stagnant, 0 shelved, maxShelved=2 → shelves it', () => {
    const result = evaluateShelving(['a'], new Set(), config);
    expect(result.toShelve).toEqual(['a']);
    expect(result.toUnshelve).toEqual([]);
  });

  it('2 stagnant exactly fills slots → shelves both', () => {
    const result = evaluateShelving(['a', 'b'], new Set(), config);
    expect(result.toShelve).toEqual(['a', 'b']);
    expect(result.toUnshelve).toEqual([]);
  });

  it('3 stagnant, maxShelved=2 → caps at first 2', () => {
    const result = evaluateShelving(['a', 'b', 'c'], new Set(), config);
    expect(result.toShelve).toEqual(['a', 'b']);
    expect(result.toUnshelve).toEqual([]);
  });

  it('2 stagnant, 1 already shelved, maxShelved=2 → shelves only 1 new', () => {
    const result = evaluateShelving(['a', 'b'], new Set(['x']), config);
    expect(result.toShelve).toEqual(['a']);
    expect(result.toUnshelve).toEqual([]);
  });

  it('cap already reached (2 shelved, maxShelved=2) → toShelve: []', () => {
    const result = evaluateShelving(['a', 'b'], new Set(['x', 'y']), config);
    expect(result.toShelve).toEqual([]);
    expect(result.toUnshelve).toEqual([]);
  });

  it('stagnant candidate already in currentlyShelved → filtered out (not re-shelved)', () => {
    const result = evaluateShelving(['a', 'b'], new Set(['a']), config);
    expect(result.toShelve).toEqual(['b']);
    expect(result.toUnshelve).toEqual([]);
  });

  it('input order preserved when capping — first N from input array', () => {
    const result = evaluateShelving(['c', 'a', 'b'], new Set(), config);
    expect(result.toShelve).toEqual(['c', 'a']);
  });

  it('toUnshelve is always empty from evaluateShelving', () => {
    const result = evaluateShelving(['a', 'b', 'c'], new Set(['x']), config);
    expect(result.toUnshelve).toEqual([]);
  });

  it('duplicate stagnant ID never steals a second slot', () => {
    // w1 appears twice — should still only occupy one slot, letting w2 in
    const result = evaluateShelving(['w1', 'w1', 'w2'], new Set(), config);
    expect(result.toShelve).toEqual(['w1', 'w2']);
    expect(result.toUnshelve).toEqual([]);
  });

  it('maxShelved=0 → toShelve: [] always', () => {
    const zeroConfig: ShelvingConfig = { ...config, maxShelved: 0 };
    const result = evaluateShelving(['a', 'b'], new Set(), zeroConfig);
    expect(result.toShelve).toEqual([]);
    expect(result.toUnshelve).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// evaluateShelving — ShelvingHooks.onShelved
// ---------------------------------------------------------------------------

describe('evaluateShelving — onShelved hook', () => {
  it('emits one call for shelved words with reason "stagnant"', () => {
    const onShelved = vi.fn();
    evaluateShelving(['a', 'b'], new Set(), config, { onShelved });
    expect(onShelved).toHaveBeenCalledWith(['a', 'b'], 'stagnant');
  });

  it('emits a second call for overflow candidates with reason "cap-reached"', () => {
    const onShelved = vi.fn();
    evaluateShelving(['a', 'b', 'c'], new Set(), config, { onShelved });
    expect(onShelved).toHaveBeenCalledTimes(2);
    expect(onShelved).toHaveBeenCalledWith(['a', 'b'], 'stagnant');
    expect(onShelved).toHaveBeenCalledWith(['c'], 'cap-reached');
  });

  it('cap already reached (0 available slots) → early-return path, hook never fires', () => {
    const onShelved = vi.fn();
    evaluateShelving(['a', 'b'], new Set(['x', 'y']), config, { onShelved });
    expect(onShelved).not.toHaveBeenCalled();
  });

  it('partial fill with leftover overflow → both "stagnant" and "cap-reached" fire', () => {
    const onShelved = vi.fn();
    evaluateShelving(['a', 'b'], new Set(['x']), config, { onShelved });
    expect(onShelved).toHaveBeenCalledTimes(2);
    expect(onShelved).toHaveBeenCalledWith(['a'], 'stagnant');
    expect(onShelved).toHaveBeenCalledWith(['b'], 'cap-reached');
  });

  it('nothing stagnant → hook never fires', () => {
    const onShelved = vi.fn();
    evaluateShelving([], new Set(), config, { onShelved });
    expect(onShelved).not.toHaveBeenCalled();
  });

  it('decision output is unchanged whether or not hooks are supplied', () => {
    const withHooks = evaluateShelving(['a', 'b', 'c'], new Set(), config, { onShelved: vi.fn() });
    const withoutHooks = evaluateShelving(['a', 'b', 'c'], new Set(), config);
    expect(withHooks).toEqual(withoutHooks);
  });
});

// ---------------------------------------------------------------------------
// unshelveAll
// ---------------------------------------------------------------------------

describe('unshelveAll', () => {
  it('returns an empty Set<string>', () => {
    const result = unshelveAll();
    expect(result).toBeInstanceOf(Set);
  });

  it('returned set has size 0', () => {
    const result = unshelveAll();
    expect(result.size).toBe(0);
  });
});
