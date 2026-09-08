# Test Strategy — How We Catch Failures

This document describes how the engine's test suite is organized and why. The engine is a pure library — no database, no network, no timers — so testing it thoroughly is cheap.

## 1. Unit tests (the baseline)

Most of the test suite is standard example-based tests: give a function some input, check the output. These live under `__tests__/unit/` and `__tests__/integration/`, plus dedicated folders for shelving and review scheduling. They cover the everyday scenarios — batch queue behavior, mastery updates, retry logic, sentence spacing — anything with a clear expected answer.

## 2. Property-based tests

Unit tests only check the examples someone thought to write by hand. Property-based tests go further: instead of picking specific inputs, a tool called `fast-check` generates hundreds of random inputs and checks that a rule still holds for all of them. This catches edge cases a person would likely never think to write manually.

This is only applied where it matters most — functions where a bug would silently corrupt a learner's progress:

- `updateRunState` — mastery always stays within its allowed range, a word's streaks can't be climbing and falling at the same time, and lapses only ever go up.
- The batch queue (question, submit, finish) — retries never exceed their cap, and the queue always empties out eventually.
- `evaluateShelving` — the shelving math holds at every boundary (this actually caught a duplicate-ID bug once).

A second tier gets lighter coverage where it's cheap to add: `validateBatch` (checking that whatever it's supposed to catch stays caught, across random batches), and the pool-advancing logic (words in should equal words out). A third tier — like `shuffle` — just checks the output is still a valid shuffle of the input, nothing more.

A few things are deliberately left out. `resolveEligibleContexts` encodes product decisions, not a universal rule, so there's nothing to generate random inputs against. `assembleBatch`'s split between foundational and vocabulary items is a tuning choice, not a correctness rule. `FsrsScheduler` is skipped because its internal scheduling data isn't ours to reason about. `updateSentenceRunState` is a known exception (it changes its input in place instead of returning a new value) and is out of scope for now.

This layer has already paid for itself — it caught two real bugs before they shipped: a stale retry-count bug, and a bug where an unclamped number could go negative and break batch composition. Both now have permanent regression tests.

## 3. Mutation testing

Property tests answer "does the rule hold across many inputs?" Mutation testing answers a different question: "if a line of code were subtly wrong, would any of our tests actually notice?"

It works by deliberately breaking small pieces of the code — flipping a `>` to `>=`, deleting a line — and re-running the test suite against each broken version. If the tests still pass, that's a gap: either a missing test, or an existing test too weak to notice a real bug.

A few ground rules for how it's used:

- It's a **local check only, not a CI gate.** Run on demand with `pnpm test:mutation`.
- The scope is deliberately narrowed (see `stryker.config.json`) to skip re-export files, test fixtures, and one config file — including those would drag the score down for reasons that have nothing to do with test quality.
- When a broken version survives testing, it gets sorted into one of four buckets: write the missing test, strengthen a weak check, or — if the broken version behaves identically to the original — record it as accepted and move on, rather than chasing an unreachable perfect score. A fourth bucket, config values with no real assertion, gets pinned with a saved snapshot instead of a live test.
- The connection to `ts-fsrs` (the spaced-repetition scheduling library this engine builds on) is locked down two ways: its exact version is pinned so it can't silently change underneath us, and its output is snapshotted, since we can't meaningfully write rules against data we don't control.

## 4. Golden master tests (snapshot tests)

Some outputs are large, structured objects where checking every field by hand would be tedious and fragile. For those, the whole output is saved once and compared against on every future run — any unexpected change shows up as a diff.

This is used for:

- The batch/session state machine, running a simulated session start to finish
- A seeded random number generator threaded through word and question composition, so results are reproducible
- Word batch composition, checked for both determinism (same seed twice gives the same result) and stability (matches a saved fixture)
- Sentence composition, with one fixture per language (some scripts, like Thai, don't use spaces between words — the fixture catches that difference)
- A full multi-batch session trajectory, to catch a bug that would only show up across several batches, not within one

When a snapshot test fails, someone always looks at the diff by hand. A failing snapshot is never just re-saved automatically — a diff only shows that something changed, not whether the change is correct.

## How these three techniques divide the work

| Technique | Question it answers |
|---|---|
| Property-based | Does this rule hold for every input we could throw at it? |
| Mutation | Would our tests actually catch this line being wrong? |
| Golden master | Did this specific output change? |

None of these tell us whether the resulting mastery curve or review schedule actually produces *good learning* — that's a bigger open question this test suite doesn't try to answer yet.

---

This matches what's actually in the codebase (`src/learn/__tests__/{unit,property,golden,integration}`, `src/shelving/__tests__/property`, `src/review/__tests__/FsrsScheduler.golden.test.ts`).
