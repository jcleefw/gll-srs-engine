# CODEMAP.md — `demo/`

Terminal demo. Shows how to build a host interface on top of the library —
all files import from the `learn`/`review`/`shelving` subpaths, same as a web
server would. This is the one place in the package allowed to do I/O
(`RULES.md`).

---

## Files

| File | Purpose |
| --- | --- |
| `README.md` | Terminology reference: active window, queue, batch, `wordsPerBatch` vs `questionLimit`, re-serve loop caps, composer registry, `SentenceState` fields, config reference table |
| `learning-runner.ts` | CLI entry point (`pnpm engine:mock-db`) — loads/saves `RunState` to a local `.demo-state.json` file, builds the mock foundational pool, loops over deck selection calling `runAdaptiveLoop` |
| `learning-io.ts` | Terminal I/O + orchestration. Exports `selectDeck(decks)`, `runInteractive(initialState)`, `runAdaptiveLoop(...)` (main orchestration wiring session/batch/sentence engine calls to stdin prompts); internal helpers `runInteractiveMCQ`, `runInteractiveWordBlock`, `printWordSummary`, `runBatch` |
| `config.ts` | Exports `AUTO_MODE`, `ENABLE_MOCK_DB` flags, `LEARNING_CONFIG` object (wordsPerBatch, mastery/streak thresholds, sentence config, retry caps), `STREAK_THRESHOLDS` derived subset |

The auto-answer strategy and driving harness (`auto-answer-strategy.ts`, `auto-answerer.ts`) live in `../test-support/` — they are test infrastructure, not demo-specific, and are imported by both this demo and the test suite.
