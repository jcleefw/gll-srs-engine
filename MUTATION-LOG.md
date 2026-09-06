# Mutation Testing Log

Trend of `pnpm test:mutation` runs against `src/**` (per `stryker.config.json` scope). The HTML/JSON
report itself is gitignored and disposable; this file is the durable record.

Rows dated before 2026-09-06 were recorded while the engine lived in the
gamified-language-learning monorepo, under its `pnpm --filter @gll/srs-engine test:mutation`
invocation. The scope and thresholds are unchanged by the extraction, so the trend is continuous.

| Date       | Scope                 | Score  | Killed | Timeout | Survived | No coverage | Notes                                                                                                                                                                                                                                                                                                                                            |
| ---------- | --------------------- | ------ | ------ | ------- | -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-08-25 | `src/**` (ST07 scope) | 88.28% | 473    | 24      | 57       | 9           | Baseline, this branch. ST08 triage not yet started.                                                                                                                                                                                                                                                                                              |
| 2026-08-25 | `src/**` (ST07 scope) | 97.69% | 536    | 14      | 11       | 2           | ST08 complete: full-scope rerun after all per-file triage. Up from 88.28% baseline. 11 survivors remaining are the accepted equivalent mutants recorded inline across `assemble-batch.ts`, `batch-queue.ts`, `compose-sentence-batch.ts`, `session.ts`, `policy.ts`, plus `FsrsScheduler.ts`'s 2 deliberate-config residuals (deferred to ST09). |
