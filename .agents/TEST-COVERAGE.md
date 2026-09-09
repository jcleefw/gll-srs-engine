# Test Coverage Policy

Which test tier a change needs, and the mutation-testing gate. This is a
sub-step referenced by [`WORKFLOW.md`](./WORKFLOW.md) — see that file for
the overall task lifecycle. Read alongside
[`docs/06-testing-strategy.md`](../docs/06-testing-strategy.md), which
explains *why* each technique exists.

CI only gates on unit tests (`pnpm test`) and golden tests
(`pnpm test:golden`). Property tests run inside `pnpm test` but nothing
forces a *new* function to get one. Mutation testing never blocks CI
(`thresholds.break: null`, `continue-on-error: true`) — it's informational
only, which means it's easy to add code, pass a shallow test, and never find
out the test was too weak. This file exists to close that gap.

## 1. Pick the required test tier

| What changed | Required | Optional |
|---|---|---|
| New/changed pure function affecting mastery, streaks, lapses, or the batch queue's retry/completion logic | Unit **and** property test | Golden |
| New/changed structured multi-step output (session trajectory, batch composition, sentence composition) | Unit **and** golden fixture | Property |
| `evaluateShelving` or other boundary-sensitive math | Unit **and** property test | — |
| `FsrsScheduler` / anything touching `ReviewCard.schedulerData` | Unit, snapshot the opaque output | Do not assert on internal shape (see `RULES.md`) |
| Everything else (glue code, config, plain helpers) | Unit test | Property / golden |

If a function looks like it belongs in the "required" column but you're not
adding a property or golden test, say why in the commit/PR message. Valid
reasons already established in `docs/06-testing-strategy.md`:
- it encodes a product/tuning decision, not a universal rule
- it's a known, tracked exception (e.g. `updateSentenceRunState`'s in-place
  mutation)

Silence is not a valid reason. If none of the listed reasons apply, add the
test.

## 2. Mutation testing gate (local, not CI)

If the change touches a file inside Stryker's `mutate` scope
(`src/**/*.ts`, excluding `__tests__/**`, `index.ts`, and
`src/config/language.ts`):

1. Run `pnpm test:mutation`.
2. For any survivor introduced by this change, sort it into one of the four
   buckets already used in `MUTATION-LOG.md`: missing test, weak assertion,
   accepted-equivalent mutant, or pinned-snapshot config value.
3. Append a row to `MUTATION-LOG.md` recording the run — this file is the
   durable record since the HTML/JSON report is gitignored.

Do not skip this because CI won't fail without it. CI treats mutation score
as diagnostic on purpose (Node 22 requirement, run cost) — that decision
relies on this step happening locally.
