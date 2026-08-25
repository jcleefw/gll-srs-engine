import { describe, it, expect, vi, afterEach } from 'vitest';
import { shuffle } from '../../utils/shuffle.js';

describe('shuffle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scales the swap index by (i + 1), not (i - 1)', () => {
    // i = 1 (only iteration for a 2-element array): (i + 1) = 2 lets j land on 0 or 1;
    // (i - 1) = 0 forces j = floor(random * 0) = 0 every time, always swapping a[1] with a[0].
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    expect(shuffle([1, 2])).toEqual([1, 2]);
  });

  it('loop bound excludes i = 0 — Math.random is called exactly (length - 1) times', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    shuffle([1, 2, 3, 4, 5]);
    expect(randomSpy).toHaveBeenCalledTimes(4);
  });

  it('returns an array of the same length', () => {
    expect(shuffle([1, 2, 3, 4, 5])).toHaveLength(5);
  });

  it('returns a new array reference — does not mutate input', () => {
    const input = [1, 2, 3];
    const result = shuffle(input);
    expect(result).not.toBe(input);
    expect(input).toEqual([1, 2, 3]);
  });

  it('works with an empty array', () => {
    expect(shuffle([])).toEqual([]);
  });

  it('works with a single-element array', () => {
    expect(shuffle(['a'])).toEqual(['a']);
  });

  it('contains all original elements — no loss or duplication', () => {
    const input = [1, 2, 3, 4, 5];
    const result = shuffle(input);
    expect(result.sort()).toEqual([...input].sort());
  });

  it('works with non-primitive types', () => {
    const input = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const result = shuffle(input);
    expect(result).toHaveLength(3);
    expect(result.map(x => x.id).sort()).toEqual([1, 2, 3]);
  });

  it('produces variation over many runs — is not a no-op', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const orderings = new Set<string>();
    for (let i = 0; i < 20; i++) {
      orderings.add(shuffle(input).join(','));
    }
    expect(orderings.size).toBeGreaterThan(1);
  });
});
