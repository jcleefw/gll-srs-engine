# CODEMAP.md — `src/review/`

FSRS-backed review scheduling — the `review` subpath export
(`gll-srs-engine/review`). Long-term retention scheduling for graduated
words, decoupled from the `learn` module behind the `ReviewScheduler`
contract.

---

## Files

| File | Purpose |
| --- | --- |
| `index.ts` | Public barrel — re-exports types `ReviewRating`, `GraduationPerformance`, `ReviewCard`, `ReviewScheduler`, `ReviewHooks` and value `FsrsScheduler` |
| `types.ts` | The scheduler contract + its primitive data shapes |
| `FsrsScheduler.ts` | `ts-fsrs`-backed implementation of `ReviewScheduler` |

---

## Exports — `types.ts`

| Export | Kind | Detail |
| --- | --- | --- |
| `ReviewRating` | Type | `'again' \| 'hard' \| 'good' \| 'easy'` — inferred by the runner, never asked of the user |
| `GraduationPerformance` | Interface | `{ correctStreak, lapses, correctRatio }` — primitive-only snapshot at graduation; this package never imports `WordState` directly |
| `ReviewCard` | Interface | `{ wordId, due: Date, schedulerData: unknown }` — `due` is the only field the runner/store reads; `schedulerData` is scheduler-owned and opaque |
| `ReviewHooks` | Interface | `{ onSeeded?: (wordId, rating: ReviewRating, dueAt: Date) => void }` — EP28 observability hook, fired when a fresh review card is seeded |
| `ReviewScheduler` | Interface | Contract: `seed(wordId, performance, now, hooks?: ReviewHooks) → ReviewCard`, `schedule(card, rating, now) → ReviewCard`, `isDue(card, now) → boolean` |

---

## Exports — `FsrsScheduler.ts`

| Export | Signature | Purpose |
| --- | --- | --- |
| `FsrsScheduler` | `class implements ReviewScheduler` | Wraps `ts-fsrs`. `seed`/`schedule`/`isDue` per the contract; constructor accepts `Partial<FSRSParameters>`. `seed` takes an optional `hooks?: ReviewHooks` and fires `hooks.onSeeded(wordId, rating, card.due)`. Private helpers: `seedRating`, `toReviewCard`, `fromSchedulerData` |

Seed heuristic (deriving an initial FSRS rating from `GraduationPerformance`)
uses internal `EASY_STREAK`/`GOOD_RATIO` constants and a `RATING_TO_GRADE` map.
