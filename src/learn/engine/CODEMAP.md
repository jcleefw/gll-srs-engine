# CODEMAP.md — `src/learn/engine/`

Quiz generation and session state logic. Pure functions only — no I/O,
no side effects.

---

## Files

| File | Purpose |
| --- | --- |
| `adaptive-session.ts` | Top-level session orchestration across batches |
| `assemble-batch.ts` | Partitions active items into foundational vs. vocabulary, proportionally splits question-limit, wires the composer registry |
| `batch-queue.ts` | Per-batch question serving/retry state machine |
| `compose-registry.ts` | Thunk-based registry pattern for merging question sources |
| `compose-sentence-batch.ts` | Builds sentence questions from a resolved context |
| `compose-word-batch.ts` | MCQ question generation for a single foundational/vocabulary item |
| `sentence-scheduling.ts` | Sentence context eligibility gating and streak/shelving state updates |
| `session.ts` | Recheck, pool rotation, mastery update logic |
| `validate-batch.ts` | Pure post-composition integrity checker for a finished batch — safety net, not a repair mechanism |

---

## Exports — `compose-word-batch.ts`

| Export | Signature | Purpose |
| --- | --- | --- |
| `composeWordBatch` | `(item: QuizItem, pool: QuizItem[], rng?: () => number) → QuizQuestion[]` | One question per direction for a single item; uses `pool` for distractors |
| `composeWordBatchMulti` | `(words: QuizItem[], pool: QuizItem[], options: { questionLimit: number; shuffle?: boolean; rng?: () => number }, hooks?: EngineHooks) → QuizQuestion[N]` | Covers all input words, fills to `questionLimit`; `shuffle: false` for deterministic order; fires `hooks.onWordBatchComposed(questionLimit, { coverage, filler })` when `words.length > 0` |
| `composeWordBatchItems` | alias for `composeWordBatchMulti` | Registry-wiring name per batch-execution-mechanics ADR D5 |
| `FOUNDATIONAL_DIRECTIONS` | `Record<FoundationalType, QuizDirection[]>` | Direction sets per foundational type (consonant/vowel = 4, tone = 2) |
| `QuizItem` | `type` | `MockFoundational \| MockWord` |

### `composeWordBatchMulti` Algorithm

1. Generate all directions per word via `composeWordBatch`
2. Take first question from each word → coverage guaranteed
3. Collect remaining questions as leftover
4. Fill gap to `questionLimit` with (optionally shuffled) leftover
5. Optionally shuffle final array

---

## Exports — `assemble-batch.ts`

| Export | Signature | Purpose |
| --- | --- | --- |
| `assembleBatch` | `(active: QuizItem[], wordPool: QuizItem[], foundationalPool: QuizItem[], wordsPerBatch: number, options?: AssembleBatchOptions, hooks?: EngineHooks) → QuizQuestion[]` | Orchestrates batch assembly: filters `excludeIds`, splits `active` into foundational vs. vocabulary, proportionally divides `wordsPerBatch` between them, composes each via the registry, optionally shuffles the merged result; fires `hooks.onBatchAssembled(eligible.length, { foundational, vocabulary })` and forwards `hooks` into each `composeWordBatchItems` thunk |
| `AssembleBatchOptions` | `interface` | `{ shuffle?: boolean (default true); extraThunks?: (() => QuizQuestion[])[]; excludeIds?: Set<string> }` |

---

## Exports — `compose-registry.ts`

| Export | Signature | Purpose |
| --- | --- | --- |
| `createComposerRegistry` | `() → ComposerRegistry` | Thunk-based registry; `.add(thunk)` queues a `() => QuizQuestion[]` source |
| `assembleBatchQuestions` | `(registry: ComposerRegistry) → QuizQuestion[]` | Runs every registered thunk and flattens the results |
| `ComposerRegistry` | `interface` | `{ add(thunk): void, ... }` |

---

## Exports — `compose-sentence-batch.ts`

| Export | Signature | Purpose |
| --- | --- | --- |
| `composeSentenceBatch` | `(ctx: SentenceContext, resolvedTiles: SentenceTile[], language: string, options?) → SentenceQuestion[]` | Builds 3 directions per sentence context (english-to-native, romanization-to-native, native-to-romanization) using `LANGUAGE_CONFIG` word-join rules |

---

## Exports — `adaptive-session.ts`

| Export | Signature | Purpose |
| --- | --- | --- |
| `initAdaptiveSession` | `(words, config: SessionConfig, recheckIds?, initialRunState?) → AdaptiveSessionState` | Builds the initial session state (active pool, queue, run state) |
| `advanceAdaptiveSession` | `(state: AdaptiveSessionState, batchOutput: BatchOutput, config: SessionConfig) → AdaptiveSessionState` | Applies a finished batch's results — mastery update, sentence run-state update, pool rotation — and returns the next session state |
| `AdaptiveSessionState` | `interface` | `{ active, queue, runState, ... }` |
| `SessionConfig` | `interface` | Session-wide tunables (batch size, thresholds, sentence config) |

---

## Exports — `batch-queue.ts`

| Export | Signature | Purpose |
| --- | --- | --- |
| `initBatchState` | `(initialQuestions: QuizQuestion[], retryPerWordCap: number, sessionRetryCounts: Map<string, number>, retryPerSessionCap: number) → BatchState` | Seeds the per-batch serving/retry queue |
| `isBatchDone` | `(state: BatchState) → boolean` | True once every question has been answered correctly |
| `nextQuestion` | `(state: BatchState) → { question, state }` | Pops the next question to serve; caches first-served instance per question id |
| `submitBatchResult` | `(state: BatchState, result: QuizResult, hooks?: EngineHooks) → BatchState` | Records an answer; re-enqueues the question on a wrong answer if under both the per-batch and per-session retry caps; fires `hooks.onRetryDecision(id, runningSessionRetries, retryPerSessionCap, 'retry' \| 'drop')` for every wrong answer |
| `finishBatch` | `(state: BatchState) → BatchOutput` | Collapses the batch state into a result summary |
| `BatchOutput` | `interface` | Batch-level result summary |
| `BatchState` | `interface` | Per-batch queue/retry state |

---

## Exports — `session.ts`

| Export | Signature | Purpose |
| --- | --- | --- |
| `processRecheckResult` | `(wordId, wasCorrect, runState, recheckPending, recheckReentered, masteryThreshold, streakThresholds?) → RecheckResultOutput` | Applies one answer; suppresses streak/mastery on first recheck attempt |
| `classifyRechecks` | `(results: WordQuizResult[], recheckPending: Set<string>) → boolean[]` | Per-result recheck flags: true where the word was in `recheckPending` (consumed once) |
| `nextActivePool` | `(active, queue, wordsPerBatch, runState, masteryThreshold, recheckExempt?, hooks?: EngineHooks) → { active, queue }` | Retires mastered words and fills freed slots from queue; fires `hooks.onPoolAdvanced(active.length, { retired, refilled })` when either count is nonzero |
| `updateMasteryState` | `(results, runState, recheckPending, recheckReentered, masteryThreshold, streakThresholds) → MasteryUpdateResult` | Applies a full batch of results via repeated `processRecheckResult` calls |
| `getNewlyMasteredIds` | `(prevState, nextState, wordIds, masteryThreshold, hooks?: EngineHooks) → string[]` | Compares two states to find words that crossed the mastery threshold in the most recent batch; fires `hooks.onMastered(newlyMasteredIds, 'mastery-threshold')` when non-empty |
| `RecheckResultOutput` | `interface` | `{ runState, recheckPending, recheckReentered }` |
| `MasteryUpdateResult` | `interface` | `{ runState, recheckPending, recheckReentered }` — no `masteredCount`/`newlyMasteredIds` fields; newly-mastered ids come from the separate `getNewlyMasteredIds` call |

---

## Exports — `sentence-scheduling.ts`

| Export | Signature | Purpose |
| --- | --- | --- |
| `resolveEligibleContexts` | `(corpus, runState, allPool, sentenceRunState, batchNum, config, excludeIds?: Set<string>, hooks?: EngineHooks) → { ctx: SentenceContext; tiles: SentenceTile[] }[]` | Filters sentence contexts by word-seen threshold, active/graduation state, and batch-gap spacing; drops any context referencing an `excludeIds` member (shelved word) since its tile set can no longer satisfy `wordOrder`; groups exclusions by `SentenceExclusionReason` and fires one `hooks.onSentenceExcluded(ids, reason)` per reason bucket |
| `updateSentenceRunState` | `(sentenceRunState, results, batchNum, config) → SentenceRunState` | Applies a batch of sentence results — streak tracking, graduation/shelving via `active` flag |

---

## Exports — `validate-batch.ts`

| Export | Signature | Purpose |
| --- | --- | --- |
| `validateBatch` | `(questions: QuizQuestion[], constraints?: BatchConstraints) → BatchValidation` | Pure, non-throwing predicate over a finished batch. Rule 1: no `excludeIds` member appears as a word question or sentence tile. Rule 2: no duplicate question identity (`kind:subject:direction`). Rule 3: no MCQ has an empty `choices` array |
| `BatchConstraints` | `interface` | `{ excludeIds?: Set<string> }` |
| `BatchValidation` | `interface` | `{ valid: boolean; violations: BatchViolation[] }` |
| `BatchViolation` | `type` | `{ kind: 'excluded-word', ... } \| { kind: 'duplicate-question', ... } \| { kind: 'empty-choices', questionIndex, wordId }` |

---

## Dependencies

| Import | Source |
| --- | --- |
| `QuizQuestion`, `QuizDirection`, `QuizChoice`, `QuizResult`, `SentenceQuestion`, `SentenceTile` | `../types/quiz.js` |
| `MockFoundational` | `../types/foundational.js` |
| `SentenceContext` | `../types/sentence.js` |
| `RunState`, `StreakThresholds`, `updateRunState`, `isMastered` | `../types/word-state.js` |
| `SentenceRunState`, `SentenceState` | `../types/sentence-state.js` |
| `shuffle` | `../utils/shuffle.js` |
| `LANGUAGE_CONFIG` | `../../config/language.js` |
| `EngineHooks`, `SentenceExclusionReason` | `../types/hooks.js` — accepted as an optional trailing param by `compose-word-batch.ts`, `assemble-batch.ts`, `batch-queue.ts`, `sentence-scheduling.ts`, and `session.ts` (EP28 observability) |

---

## Unit Tests

Tests live under `src/learn/__tests__/unit/` and `src/learn/__tests__/integration/`.
