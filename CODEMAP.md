# CODEMAP.md — `@gll/srs-engine`

Package navigation index. Navigate to subfolder CODEMAPs for file-level detail.

---

## Package Purpose

Standalone SRS quiz engine for language learning. Exposes pure functions for
composing quiz questions, adaptive session state, sentence scheduling,
shelving, and FSRS-based review. Can be consumed by any interface layer —
terminal (via `demo/`) or web (server + frontend).

---

## Entry Points

There is no root package entry (`package.json` `exports` has no `.` — every
consumer imports a subpath):

| Subpath | File | Role |
| --- | --- | --- |
| `@gll/srs-engine/learn` | `src/learn/index.ts` | Quiz composition, adaptive session, batch queue, mastery/recheck, sentence scheduling |
| `@gll/srs-engine/review` | `src/review/index.ts` | FSRS-backed review scheduling |
| `@gll/srs-engine/shelving` | `src/shelving/index.ts` | Stuck-word shelving policy |
| `@gll/srs-engine/data/mock/*` | `data/mock/*.ts` | Mock decks/words/foundational data (dev + tests only) |
| `docs/` | — | **Start here** — humanized explanations at three levels (stakeholder, developer, walkthrough) |
| `demo/learning-runner.ts` | — | CLI demo — wires mock data → `initAdaptiveSession` → question loop → `advanceAdaptiveSession` |

---

## `docs/` — Start Here

| File | Audience | Content | CODEMAP |
| --- | --- | --- | --- |
| `docs/01-stakeholder.md` | Product owners, non-technical | What the engine does and why | [CODEMAP](docs/CODEMAP.md) |
| `docs/02-concepts.md` | Developers, architects | Architecture, core concepts, design decisions | ″ |
| `docs/03-walkthrough.md` | Builders, debuggers | Step-by-step algorithm trace with worked example | ″ |
| `docs/04-deferred-features.md` | Planners | Gap analysis vs PRD | ″ |
| `docs/05-data-pipeline.md` | Developers | Conversation JSON → ingestion → DB → engine inputs | ″ |

---

## `src/` — Library

| Folder | Purpose | CODEMAP |
| --- | --- | --- |
| `src/learn/` | Quiz composition, adaptive session, batch queue, mastery/recheck, sentence scheduling — the `learn` subpath export | [CODEMAP](src/learn/CODEMAP.md) |
| `src/learn/engine/` | Pure session/batch/composition logic behind `learn/` | [CODEMAP](src/learn/engine/CODEMAP.md) |
| `src/learn/types/` | TypeScript definitions for the `learn` domain | [CODEMAP](src/learn/types/CODEMAP.md) |
| `src/learn/utils/` | Small generic helpers (shuffle) used by `learn/engine/` | [CODEMAP](src/learn/utils/CODEMAP.md) |
| `src/review/` | FSRS-backed review scheduling — the `review` subpath export | [CODEMAP](src/review/CODEMAP.md) |
| `src/shelving/` | Stuck-word shelving policy — the `shelving` subpath export | [CODEMAP](src/shelving/CODEMAP.md) |
| `src/config/` | Language config — `LANGUAGE_CONFIG` for space-less scripts (Thai, Japanese, etc.) | [CODEMAP](src/config/CODEMAP.md) |

There is no `src/index.ts` — see Entry Points above.

---

## `demo/` — Terminal Demo

Shows how to build a terminal interface on top of the library. All files
import from the `learn`/`review`/`shelving` subpaths — same as a web server
would. See [CODEMAP](demo/CODEMAP.md) for file-level detail.

---

## `data/` — Sample & Mock Data

| Folder | Purpose | CODEMAP |
| --- | --- | --- |
| `data/mock/` | Thai mock decks/words/foundational data, consumed by `demo/` and tests | [CODEMAP](data/mock/CODEMAP.md) |
| `data/samples/` | Raw sample conversation JSON + hand-authored Thai consonant reference data | [CODEMAP](data/samples/CODEMAP.md) |
| `data/seed-data/` | Full Thai/Japanese foundational-character seed sets (consonants, vowels, tones, kana) | [CODEMAP](data/seed-data/CODEMAP.md) |
| `data/types.ts` | Shared `FoundationalCharacter` type — see [CODEMAP](data/CODEMAP.md) | — |

---

## `test-support/` — Shared Test Infrastructure

Driving harness and fixtures shared by `demo/` and the test suite (auto-answer
strategies, adaptive-loop runner, seeded RNG). Not a subpath export.

---

## Config & Meta Files

| File | Purpose |
| --- | --- |
| `package.json` | ESM package, no root export (subpath-only), declares `ts-fsrs` dep, build/test/lint/typecheck scripts + `engine:mock-db` demo runner + `test:mutation` |
| `tsconfig.json` | Base TS config (no emit), includes `src/`, `__tests__/`, `demo/`, `data/` |
| `tsconfig.build.json` | Build config — compiles `src/` + `data/` → `dist/` |
| `vitest.config.ts` | Discovers tests across `src/**/__tests__/`, `data/**/__tests__/`, `__tests__/integration/` |
| `stryker.config.json` | Mutation testing config (`test:mutation` script) — mutates `src/**/*.ts`, excludes `__tests__/`, barrel `index.ts` files, and `src/config/language.ts` |
| `README.md` | Package-level readme — quickstart and overview |
| `RULES.md` | Constraints for this package: pure engine only, no persistence/I/O, no `@gll/db` import, empty runtime `dependencies` |
| `KNOWLEDGE.md` | Approved-edits-only domain knowledge digest (session lifecycle, mastery tracking, batch composition/validation, foundational content) |
| `CHANGELOG.md` | Human-readable feature changelog, entries per epic/story |
| `MUTATION-LOG.md` | Durable trend log of `pnpm --filter @gll/srs-engine test:mutation` runs (score, killed/timeout/survived counts) — the `reports/mutation/` HTML/JSON output itself is gitignored |
| `reports/mutation/` | Gitignored Stryker mutation-testing output (`index.html`, `mutation.json`) — disposable, `MUTATION-LOG.md` is the durable record |

---

## Session Lifecycle

```
initAdaptiveSession(words, config)
        ↓
   AdaptiveSessionState {active, queue, runState, ...}
        ↓
per batch:
  assembleBatch(active, wordPool, foundationalPool, wordsPerBatch, options?) → QuizQuestion[]
  initBatchState(questions) → BatchState

  per question:
    nextQuestion(batchState) → question + state
    submitBatchResult(batchState, answer) → state (re-enqueue if wrong)

  finishBatch(batchState) → BatchOutput
        ↓
advanceAdaptiveSession(sessionState, batchOutput, config)
  → updateMasteryState (streak/mastery rules)
  → updateSentenceRunState (sentence streak & shelving)
  → nextActivePool (retire mastered, fill from queue)
  → next AdaptiveSessionState
        ↓
repeat until active.length === 0 && queue.length === 0
```

See `docs/02-concepts.md` for the architecture diagram and `docs/03-walkthrough.md`
for an annotated example.

---

## External Dependencies

| Dep | Version | Status |
| --- | --- | --- |
| `ts-fsrs` | ^5 | Used by `src/review/FsrsScheduler.ts` |
| `typescript` | ^5.7 | Dev |
| `vitest` | ^3 | Dev |
