# SRS Engine — Humanized Explanations

This folder contains three perspectives on how the SRS engine works, written for different audiences and levels of depth.

---

## 📊 [01-stakeholder.md](01-stakeholder.md) — The Product View

**Audience:** Product owners, stakeholders, non-technical readers  
**Time to read:** 5 min  
**Depth:** What it does and why; no code

The engine introduces words in small groups and quizzes you until you prove mastery through consistent correct answers. Streaks go up, mastery goes up; streaks go down, mastery goes down. Only graduate words enter the active pool when a slot opens.

Start here if you want to understand the *why* and the user experience.

---

## 🧠 [02-concepts.md](02-concepts.md) — The Developer View

**Audience:** New developers, architects  
**Time to read:** 10 min  
**Depth:** How the pieces fit together; enough to reason about the design

The engine has two core containers: an **active pool** (words being quizzed right now) and a **queue** (words waiting). A `RunState` Map tracks score and streak for each word. Streak rules drive mastery transitions. Wrong answers re-queue for retry within the batch. The session orchestrator (`AdaptiveSession`) threads state between batches.

Read this when you want to understand the architecture and why decisions were made.

---

## 🔍 [03-walkthrough.md](03-walkthrough.md) — The Trace View

**Audience:** You, when reasoning through a specific scenario  
**Time to read:** 15 min  
**Depth:** Step-by-step with a full 3-word example, tracing each batch

A concrete example: three words, mastery threshold 5, streak thresholds 3/2. Follow w1 from "New" → "Mastery 1" → "Mastery 5" → "Retired", while w2 climbs slowly, and w3 waits in the queue. Watch how retries work, how slots fill, how the session terminates.

Read this when you're debugging a state transition, writing a test, or just need to convince yourself the algorithm actually works.

---

## 📋 [04-deferred-features.md](04-deferred-features.md) — What's NOT (Yet) Implemented

**Audience:** Implementers, product managers  
**When to read**: You're looking at the PRD and wondering why a feature isn't in the engine

This document clarifies the gap between the product specification and current implementation: stuck-word shelving, batch composition priority, ANKI/FSRS scheduling, audio questions, and more. Useful for planning future work or understanding what to expect when consuming the engine.

---

## 🔌 [05-data-pipeline.md](05-data-pipeline.md) — The Data Pipeline View

**Audience:** Developers  
**When to read**: You're tracing where word/sentence data comes from before it reaches the engine

Conversation JSON → ingestion → database → query layer → engine inputs. Covers what the engine actually receives (`words`, `pool`, `sentenceContexts`, `config`) versus what the caller/host is responsible for.

---

## 🧪 [06-testing-strategy.md](06-testing-strategy.md) — The Testing View

**Audience:** Developers  
**When to read**: You're adding a test and unsure which tier it belongs in, or want to know why the suite is structured the way it is

How the test suite is organized: unit tests, property-based tests (`fast-check`), and mutation testing — and why each tier exists.

---

## 👁️ [07-observability-hooks.md](07-observability-hooks.md) — The Observability View

**Audience:** Developers  
**When to read**: You need to observe an internal engine decision (mastery, retries, shelving) that isn't visible from a batch's return value alone

Documents the hook system that exposes the engine's internal decisions to a consuming app, and confirms which of 18 identified silent decision points actually needed a hook versus were already cheap to observe.

---

## 🚧 [08-boundaries.md](08-boundaries.md) — The Boundaries View

**Audience:** Developers, agents  
**When to read**: Before adding a dependency, a new export, or an import that crosses a module boundary

What this library is and isn't (pure engine, no persistence/I/O), the `demo/` I/O exception, the callback typing decision rule, internal module boundaries (`shelving`/`review` vs `learn`), and the external server-only `review` consumer boundary. `RULES.md` at repo root points here.

---

## 🔗 Related files

- `src/learn/index.ts` — Public API exports (`learn` subpath)
- `src/learn/types/word-state.ts` — `RunState`, `WordState`, streak logic
- `src/learn/engine/session.ts` — `updateMasteryState`, `nextActivePool`
- `src/learn/engine/adaptive-session.ts` — `AdaptiveSessionState` orchestration
- `src/learn/engine/batch-queue.ts` — `BatchState`, retry mechanics
- `src/learn/engine/compose-word-batch.ts` — Question generation
- `src/shelving/index.ts` — Public API exports (`shelving` subpath)
- `src/shelving/policy.ts` — `evaluateShelving`, `unshelveAll`
- `src/review/index.ts` — Public API exports (`review` subpath, server-only)
- `src/review/FsrsScheduler.ts` — `ReviewScheduler` implementation wrapping `ts-fsrs`
