import { describe, it } from 'vitest';
import fc from 'fast-check';
import { shuffle } from '../../utils/shuffle.js';

describe('shuffle — permutation and immutability invariants', () => {
  it('output is a permutation of the input (same elements, same multiplicities)', () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), (input) => {
        const output = shuffle(input);
        if (output.length !== input.length) return false;

        const sortedInput = [...input].sort((a, b) => a - b);
        const sortedOutput = [...output].sort((a, b) => a - b);
        return sortedInput.every((v, i) => v === sortedOutput[i]);
      }),
    );
  });

  it('does not mutate the input array', () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), (input) => {
        const before = [...input];
        shuffle(input);
        return input.length === before.length && input.every((v, i) => v === before[i]);
      }),
    );
  });

  it('returns a new array instance, not the same reference', () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), (input) => {
        return shuffle(input) !== input;
      }),
    );
  });
});
