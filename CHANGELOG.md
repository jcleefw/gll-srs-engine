# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-09-06

First release as a standalone package, extracted from the
`gamified-language-learning` monorepo where it lived as `@gll/srs-engine`.

The extraction is a lift, not a rewrite: engine behaviour is unchanged and the
full golden-master suite passes untouched. History was not carried across, so
this changelog starts here.

### Added

- `gll-srs-engine/learn` — quiz composition, adaptive session loop, batch queue,
  mastery and recheck handling, sentence scheduling.
- `gll-srs-engine/shelving` — stuck-word shelving policy.
- `gll-srs-engine/review` — FSRS-backed long-term review scheduling. Server-side only.
- `gll-srs-engine/data/mock/*` — mock decks, words, and foundational data.
- Terminal demo runner, mutation testing, and a CI pipeline.

### Changed

- Renamed from `@gll/srs-engine` to `gll-srs-engine`. The scoped name implied
  workspace membership that no longer applies.
- Tooling is self-contained: the former shared `tsconfig.base.json` options are
  inlined, and only the lint rules governing the engine's own code travel.
  Monorepo governance rules and consumer-scoped import restrictions stay behind.
- `demo/` and the test suites are excluded from the published build.
