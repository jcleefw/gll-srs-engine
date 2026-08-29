# CODEMAP.md — `src/shelving/`

Stuck-word shelving policy — the `shelving` subpath export
(`@gll/srs-engine/shelving`). Decides which stagnant words to pull out of
active rotation, given a per-batch stagnation window and a cap on how many
words can be shelved at once.

---

## Files

| File | Purpose |
| --- | --- |
| `index.ts` | Public barrel — re-exports types `ShelvingConfig`, `ShelvedWord`, `ShelvingDecision`, `ShelvingHooks`, value `DEFAULT_SHELVING_CONFIG`, functions `evaluateShelving`, `unshelveAll` |
| `types.ts` | Config, state, and decision shapes |
| `policy.ts` | The shelving/unshelving decision logic |

---

## Exports — `types.ts`

| Export | Kind | Detail |
| --- | --- | --- |
| `ShelvingConfig` | Interface | `{ stagnationBatchWindow, maxShelved }` — consecutive no-progress batches before shelving; max simultaneously shelved |
| `DEFAULT_SHELVING_CONFIG` | Const | `{ stagnationBatchWindow: 3, maxShelved: 2 }` |
| `ShelvedWord` | Interface | `{ wordId, shelvedAtBatch }` |
| `ShelvingDecision` | Interface | `{ toShelve: string[], toUnshelve: string[] }` |
| `ShelvingHooks` | Interface | `{ onShelved?: (ids: string[], reason: string) => void }` — EP28 observability hook, fired for both shelved words and cap-blocked candidates |

---

## Exports — `policy.ts`

| Export | Signature | Purpose |
| --- | --- | --- |
| `evaluateShelving` | `(stagnantWordIds: string[], currentlyShelved: Set<string>, config: ShelvingConfig, hooks?: ShelvingHooks) → ShelvingDecision` | Fills only `config.maxShelved` available slots, filters out words already shelved, preserves input order when capping. `toUnshelve` is always empty — unshelving is handled separately. Fires `hooks.onShelved(toShelve, 'stagnant')` for words actually shelved and `hooks.onShelved(overflow, 'cap-reached')` for candidates that missed the cap |
| `unshelveAll` | `() → Set<string>` | Returns an empty set representing "all unshelved"; caller applies it to their own shelved-state store |
