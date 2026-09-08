# Observability Hooks — Seeing What the Engine Decides

The engine makes a lot of decisions internally — when a word masters, when a retry is allowed, when a word gets shelved — but by default, none of that is visible from outside. A consuming app only sees the final result of a batch, not the reasoning behind it.

This document describes the hook system that opens a window into those decisions, and confirms what's actually built in `src/` versus what was only planned. It's based on a design decision recorded in the vault (`projects/gamified-language-learning/references/srs-engine-observability-hooks.md`, accepted 2026-08-27), checked line by line against the current code.

## The problem

A review of the engine turned up 18 places where it silently makes a decision without telling anyone:

- **10 of them** are already cheap to observe — they return something that's naturally empty or false when nothing happened, so an app can just check the return value.
- **8 of them** always build a fresh value whether or not anything actually changed, so there's no way to tell "this happened" from "this always happens" without new before/after comparison logic.

This document only covers those second 8 — the ones that needed real hook support.

## Who this is for

Three different needs shaped the design:

- **Tracing a single decision** — "why was I shown this word?"
- **Watching overall health during a session** — "are retries or shelving climbing too fast?"
- **Following one word's whole history** — "where did this word go, and why?" This third need needs a harder kind of tracking (comparing before/after state) that isn't built here. It's covered instead by the `answer_events` table already logged on the server.

## How it's built

- **Plain functions, nothing fancy.** No event system, no logging library — just typed callback functions that get called directly at the point a decision is made.
- **Four reusable shapes, not eighteen custom ones.** Rather than inventing a new type for every decision, the design reuses four shapes: a state-change hook, an "these ids moved" hook, an "allowed or denied against a limit" hook, and a "how a total got split" hook.
- **Only fires on a real change.** A hook only runs when something actually happened — "nothing happened this time" doesn't fire anything.
- **One optional bag of hooks**, passed as the last argument to a function, rather than a long list of optional parameters.

## What's actually implemented (confirmed against the code)

The original write-up in the vault wasn't sure whether this had actually been built yet. It has — every one of the eight decision points now has a working hook.

| What decides | Hook name | Where it lives |
|---|---|---|
| Building a batch | `onBatchAssembled` | `src/learn/engine/assemble-batch.ts` |
| Composing word questions | `onWordBatchComposed` | `src/learn/engine/compose-word-batch.ts` |
| Advancing the active pool | `onPoolAdvanced` | `src/learn/engine/session.ts` |
| A word crossing mastery | `onMastered` | `src/learn/engine/session.ts` |
| Excluding a sentence | `onSentenceExcluded` | `src/learn/engine/sentence-scheduling.ts` |
| Granting or denying a retry | `onRetryDecision` | `src/learn/engine/batch-queue.ts` |
| Shelving a word | `onShelved` | `src/shelving/policy.ts` |

Six of these seven live together in one hooks object, passed as an extra argument to the learning functions. Every one of them also has its own dedicated test confirming it fires — or doesn't fire — correctly.

## One thing the original write-up got slightly wrong

Shelving lives in its own separate part of the package (`gll-srs-engine/shelving`, apart from `gll-srs-engine/learn`), so its hook — `onShelved` — is not part of the same hooks bag as the other six. It has its own, smaller hooks object. In practice, an app wiring this up needs to pass in two separate hook bags, not one.

## The eighth item: `GraduationHook`

There's an eighth hook-shaped type mentioned in the design, called `GraduationHook`. It's a bit different from the rest: the engine itself never calls it. It exists purely as a type an app can use to build its own callback, based on data the engine already returns. So it's not really "the engine tells you something happened" — it's more like a documented shape for something the app builds on its own.

## What was deliberately not built

A few alternative approaches were considered and rejected:

- A shared event system that anything could publish or subscribe to
- Wrapping `console.log` as a built-in logger
- A separate custom type for each of the 18 decision points
- Firing every time a function runs, whether or not anything actually changed
- Hooks for per-learner tuning data — that data already exists elsewhere (`answer_events`)

## Bottom line

- The design was accepted on paper, and it did land in code — all seven hooks work as described, and each has its own test.
- The one correction worth remembering: shelving's hook isn't bundled with the rest — it's a second, separate hooks object.
- `GraduationHook` isn't something the engine fires — it's a type for the app to use on its own.
