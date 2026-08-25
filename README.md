# @gll/srs-engine

The word lifecycle engine for a language-learning app: learning, shelving, and review. Pure TypeScript, no I/O, no side effects.

## Quick start

**How it works?** See [docs/](docs/) for humanized explanations at three levels:
- **5 min** — [Product view](docs/01-stakeholder.md): what the engine does and why
- **10 min** — [Developer view](docs/02-concepts.md): architecture and key concepts
- **15 min** — [Trace view](docs/03-walkthrough.md): step-by-step algorithm walkthrough

## Library API

Per-phase subpath exports — there is no bare `@gll/srs-engine` barrel:

```ts
import {
  composeWordBatchMulti,
  composeSentenceBatch,
  updateMasteryState,
  initAdaptiveSession,
  advanceAdaptiveSession,
} from '@gll/srs-engine/learn';

import { evaluateShelving, unshelveAll } from '@gll/srs-engine/shelving';

import { FsrsScheduler } from '@gll/srs-engine/review'; // server-only, see ADR D3
```

All functions are pure: no I/O, no persistence, same inputs → same outputs.

## Terminal demo

```bash
pnpm learnv2          # interactive mode (prompts for answers)
AUTO_MODE=true pnpm learnv2   # auto mode (auto-answers all questions)
```

Edit `demo/config.ts` to adjust settings or `demo/learning-runner.ts` to change which words are drilled.

## Tests

```bash
pnpm test                                    # all tests
pnpm test:watch                              # watch mode
pnpm --filter @gll/srs-engine test        # from repo root
```

## Mutation testing

```bash
pnpm test:mutation                                          # full src/** scope
pnpm stryker run --mutate 'src/learn/engine/some-file.ts'    # scoped to one file
```

Local diagnostic only — no CI gate, score is informational (see ADR [`20260825T014059Z-engineering-mutation-testing-strategy.md`](../../product-documentation/architecture/20260825T014059Z-engineering-mutation-testing-strategy.md)). Trend is tracked in [MUTATION-LOG.md](MUTATION-LOG.md).

Stryker mutates one line at a time (e.g. `'space'` → `''`) and reruns the tests. A **survived** mutant means no test failed — usually a real gap, fixed by adding a test. An **equivalent mutant** is the exception: a survivor that *can't* be killed by any test, because the mutated code is behaviorally identical to the original. Example, from `compose-sentence-batch.ts`:

```ts
// equivalent mutant: only 'no-space' is checked below, so any other value here is unobservable — do not chase.
const DEFAULT_WORD_JOIN: WordJoin = 'space';
```

The mutant changes `'space'` to `''`, but the only place this value is read compares it against `'no-space'` — so `'space'`, `''`, and even `undefined` all take the same branch and produce the same output. No test can distinguish them, so don't try. When triage turns up one of these, record it inline as a comment at the mutated line (per ADR D6/D7) instead of chasing an unreachable test.

## Architecture

See [CODEMAP.md](CODEMAP.md) for full file navigation and [docs/02-concepts.md](docs/02-concepts.md) for architecture overview.
