# gll-srs-engine

A language-agnostic engine for the word lifecycle in a language-learning app:
**learning**, **shelving**, and **review**. Pure TypeScript — no I/O, no
persistence, no side effects. Same inputs, same outputs.

Long-term retention scheduling is backed by [FSRS](https://github.com/open-spaced-repetition/ts-fsrs).

## Install

Consumed as a git dependency pinned to a tag:

```json
{
  "dependencies": {
    "gll-srs-engine": "github:jcleefw/gll-srs-engine#v0.1.0"
  }
}
```

The package builds itself on install, so no checked-in `dist/` is required.
Upgrading means pushing a new tag and bumping the pinned ref — there is no
registry and no semver-range resolution.

## Usage

There is **no barrel export**. Every consumer imports a subpath:

```ts
import {
  composeWordBatchMulti,
  composeSentenceBatch,
  updateMasteryState,
  initAdaptiveSession,
  advanceAdaptiveSession,
} from 'gll-srs-engine/learn';

import { evaluateShelving, unshelveAll } from 'gll-srs-engine/shelving';

import { FsrsScheduler } from 'gll-srs-engine/review';
```

`gll-srs-engine/review` is **server-side only** — see [RULES.md](RULES.md).

Mock decks and word data are available under `gll-srs-engine/data/mock/*` for
development and tests.

### What the engine does not do

It holds no state between calls and never touches a database, the filesystem, or
the network. Persistence, serialization, and deciding *when* to call the engine
are the consumer's job. Extension points are plain functions typed against
engine types, so nothing needs to be imported back into the engine to implement
them.

## Documentation

Start with [docs/](docs/), which explains the engine at three depths:

| | Document | For |
| --- | --- | --- |
| 5 min | [Product view](docs/01-stakeholder.md) | What the engine does and why |
| 10 min | [Developer view](docs/02-concepts.md) | Architecture and key concepts |
| 15 min | [Trace view](docs/03-walkthrough.md) | Step-by-step algorithm walkthrough |

[CODEMAP.md](CODEMAP.md) is the file-level navigation index. [RULES.md](RULES.md)
records the constraints that keep the engine pure — read it before adding a
dependency or a new export.

## Development

```bash
pnpm install
pnpm test          # unit, integration and property tests
pnpm test:golden   # golden-master suite
pnpm test:watch
pnpm typecheck
pnpm lint
pnpm build
```

### Terminal demo

```bash
pnpm demo
```

Drives the engine by hand against the mock decks. It prompts for a deck and then
for each answer, so it needs a real terminal. To run it unattended, set
`AUTO_MODE = true` in [demo/config.ts](demo/config.ts) — a source constant, not
an environment variable. See [demo/README.md](demo/README.md).

### Mutation testing

Requires Node >=22 — StrykerJS 10's own floor, ahead of the >=20 the rest of
this package targets.

```bash
pnpm test:mutation                                        # full src/** scope
pnpm exec stryker run --mutate 'src/learn/engine/some-file.ts'   # one file
```

Informational only — the score is a diagnostic, never a gate. The trend is
tracked in [MUTATION-LOG.md](MUTATION-LOG.md).

Stryker mutates one line at a time and reruns the tests. A **survived** mutant
means no test failed, which usually signals a real gap. The exception is an
**equivalent mutant** — a survivor no test can kill, because the mutated code
behaves identically. For example:

```ts
// equivalent mutant: only 'no-space' is checked below, so any other value here is unobservable — do not chase.
const DEFAULT_WORD_JOIN: WordJoin = 'space';
```

Changing `'space'` to `''` is unobservable, because the only read of this value
compares it against `'no-space'` — every alternative takes the same branch. When
triage turns up one of these, record it inline at the mutated line instead of
chasing an unreachable test.

## Versioning

[SemVer](https://semver.org/). The public surface is the three subpath exports
and the mock-data paths; changes to any of them are breaking. See
[CHANGELOG.md](CHANGELOG.md).
