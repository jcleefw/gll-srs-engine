import { describe, it } from 'vitest';
import fc from 'fast-check';
import type { ShelvingConfig } from '../../types.js';
import { evaluateShelving } from '../../policy.js';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const wordId = fc.stringMatching(/^[a-z0-9]{1,4}$/); // small alphabet → forces duplicate collisions

const stagnantWordIdsArb = fc.array(wordId, { maxLength: 12 });
const currentlyShelvedArb = fc
  .array(wordId, { maxLength: 6 })
  .map((ids) => new Set(ids));
const configArb = fc.record({
  stagnationBatchWindow: fc.integer({ min: 1, max: 10 }),
  maxShelved: fc.integer({ min: -2, max: 6 }), // negative slots are one of the boundaries D3 calls out
}) satisfies fc.Arbitrary<ShelvingConfig>;

describe('evaluateShelving — property invariants', () => {
  it('never returns more toShelve entries than available slots', () => {
    fc.assert(
      fc.property(
        stagnantWordIdsArb,
        currentlyShelvedArb,
        configArb,
        (stagnant, shelved, config) => {
          const availableSlots = Math.max(0, config.maxShelved - shelved.size);
          const result = evaluateShelving(stagnant, shelved, config);
          return result.toShelve.length <= availableSlots;
        },
      ),
    );
  });

  it('never returns a word that is already in currentlyShelved', () => {
    fc.assert(
      fc.property(
        stagnantWordIdsArb,
        currentlyShelvedArb,
        configArb,
        (stagnant, shelved, config) => {
          const result = evaluateShelving(stagnant, shelved, config);
          return result.toShelve.every((id) => !shelved.has(id));
        },
      ),
    );
  });

  it('total shelf size (currentlyShelved + toShelve) never exceeds maxShelved', () => {
    fc.assert(
      fc.property(
        stagnantWordIdsArb,
        currentlyShelvedArb,
        configArb,
        (stagnant, shelved, config) => {
          const result = evaluateShelving(stagnant, shelved, config);
          return (
            shelved.size + result.toShelve.length <=
            Math.max(config.maxShelved, shelved.size)
          );
        },
      ),
    );
  });

  it('duplicate stagnant IDs never occupy more than one slot each', () => {
    fc.assert(
      fc.property(
        stagnantWordIdsArb,
        currentlyShelvedArb,
        configArb,
        (stagnant, shelved, config) => {
          const result = evaluateShelving(stagnant, shelved, config);
          const uniqueCount = new Set(result.toShelve).size;
          return uniqueCount === result.toShelve.length;
        },
      ),
    );
  });

  it('preserves relative input order when capping candidates', () => {
    fc.assert(
      fc.property(
        stagnantWordIdsArb,
        currentlyShelvedArb,
        configArb,
        (stagnant, shelved, config) => {
          const result = evaluateShelving(stagnant, shelved, config);
          // Every returned id must appear in stagnant, and the returned order must be
          // a subsequence of the first-occurrence order of stagnant (post-dedupe).
          const firstOccurrenceOrder = [...new Set(stagnant)];
          let cursor = -1;
          for (const id of result.toShelve) {
            const idx = firstOccurrenceOrder.indexOf(id);
            if (idx === -1 || idx <= cursor) return false;
            cursor = idx;
          }
          return true;
        },
      ),
    );
  });

  it('toUnshelve is always empty', () => {
    fc.assert(
      fc.property(
        stagnantWordIdsArb,
        currentlyShelvedArb,
        configArb,
        (stagnant, shelved, config) => {
          const result = evaluateShelving(stagnant, shelved, config);
          return result.toUnshelve.length === 0;
        },
      ),
    );
  });
});
