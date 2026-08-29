# CODEMAP.md — `src/learn/types/`

Shared TypeScript type definitions for the `learn` domain. No logic except
in `word-state.ts`.

---

## Files

| File | Purpose |
| --- | --- |
| `quiz.ts` | Quiz-domain types shared across `engine/` and `demo/` |
| `word-state.ts` | Word mastery/streak state types and pure update functions |
| `deck.ts` | Deck and line types |
| `foundational.ts` | Foundational item types (Thai/Japanese consonants, vowels, tones) |
| `sentence-state.ts` | Sentence scheduling state types and default initializer |
| `sentence.ts` | Sentence context type — the authored English sentence + native word order used to build sentence questions |
| `hooks.ts` | Observability hook contract (`EngineHooks`) threaded through `learn/engine/*` for non-throwing progress/decision callbacks — EP28 |

---

## Exports — `quiz.ts`

| Export | Kind | Shape |
| --- | --- | --- |
| `QuizDirection` | Union | `'native-to-english' \| 'english-to-native' \| 'native-to-romanization' \| 'romanization-to-native'` |
| `QuizChoice` | Interface | `{ label: 'a'\|'b'\|'c'\|'d', value: string, isCorrect: boolean }` |
| `MCQQuestion` | Interface | Single-word multiple-choice question |
| `SentenceTile` | Interface | One draggable/selectable tile in a sentence question |
| `SentenceQuestion` | Interface | Sentence-assembly question (tiles + expected order) |
| `QuizQuestion` | Union | `MCQQuestion \| SentenceQuestion` |
| `WordQuizResult` | Interface | Result of answering an `MCQQuestion` |
| `SentenceQuizResult` | Interface | Result of answering a `SentenceQuestion` |
| `QuizResult` | Union | `WordQuizResult \| SentenceQuizResult` |

---

## Exports — `word-state.ts`

| Export | Kind | Detail |
| --- | --- | --- |
| `WordState` | Interface | `{ wordId, seen, correct, mastery (0–5), correctStreak, wrongStreak, lapses }` — `lapses` counts mastery decrements via the wrong-streak threshold (FSRS seed input) |
| `RunState` | Type | `Map<string, WordState>` |
| `StreakThresholds` | Interface | `{ correctStreakThreshold, wrongStreakThreshold, maxMastery }` |
| `updateRunState` | Function | `(state, wordId, wasCorrect, thresholds) → RunState` — new `RunState` with streak/mastery/lapses updated for one answer, does not mutate input |
| `isMastered` | Function | `(ws, threshold) → boolean` |
| `GraduationHook` | Type | `(graduatedWordIds: string[], runState: RunState) => void \| Promise<void>` |

---

## Exports — `deck.ts`

| Export | Kind | Detail |
| --- | --- | --- |
| `MockLine` | Interface | One conversation line with speaker, text fields, and word list |
| `MockDeck` | Interface | `{ id, topic, lines, wordIds }` |

---

## Exports — `foundational.ts`

| Export | Kind | Detail |
| --- | --- | --- |
| `ThaiFoundationalType` | Union | `'consonant' \| 'vowel' \| 'tone'` |
| `JapaneseFoundationalType` | Union | `'hiragana' \| 'katakana' \| 'kanji'` |
| `FoundationalBase` | Type | Shared base shape for a foundational-character seed entry |
| `ThaiConsonant` / `ThaiVowel` / `ThaiTone` | Interfaces | Full Thai foundational-character shapes (used by `data/seed-data/thai-full-foundations.ts`) |
| `MockVowel` | Interface | Thai vowel mark with `position` and `length` |
| `MockTone` | Interface | Thai tone mark |
| `MockFoundational` | Union | `MockConsonant \| MockVowel \| MockTone` |
| `ThaiFoundational` | Union | `ThaiConsonant \| ThaiVowel \| ThaiTone` |

---

## Exports — `sentence-state.ts`

| Export | Kind | Detail |
| --- | --- | --- |
| `SentenceState` | Interface | `{ sentenceId, sentenceStreak, lastBatchSeen, dailyCount, sessionWrongStreak, active }` |
| `SentenceRunState` | Type | `Map<string, SentenceState>` |
| `defaultSentenceState` | Function | `(sentenceId) → SentenceState` — returns initial default state for a sentence |

---

## Exports — `sentence.ts`

| Export | Kind | Detail |
| --- | --- | --- |
| `SentenceContext` | Interface | `{ sentenceId, englishSentence, wordOrder: string[] }` — `wordOrder` is `wordId` refs giving tile order for all directions |

---

## Exports — `hooks.ts`

| Export | Kind | Detail |
| --- | --- | --- |
| `IdSetHook` | Type | `(ids: string[], reason: string) => void` — a decision that moved a set of entities, with why |
| `TransitionHook<T>` | Type | `(id: string, previous: T, next: T) => void` — a before/after state change on one entity |
| `CapDecisionHook` | Type | `(id: string, current: number, cap: number, decision: 'retry' \| 'drop') => void` — an allow/deny gated by a counter against a cap |
| `DistributionHook` | Type | `(total: number, parts: Record<string, number>) => void` — how a total was split across named parts |
| `EngineHooks` | Interface | `{ onBatchAssembled?, onWordBatchComposed?, onPoolAdvanced?: DistributionHook; onMastered?, onSentenceExcluded?: IdSetHook; onRetryDecision?: CapDecisionHook }` — all optional, all fire-and-forget observability callbacks, never affect control flow |
| `SentenceExclusionReason` | Union | `'word-not-seen-enough' \| 'sentence-inactive' \| 'batch-gap-cooldown' \| 'missing-pool-item'` — reasons a sentence context is filtered out of eligibility, in gate order |

`EngineHooks` is accepted as an optional trailing parameter by `compose-word-batch.ts`, `assemble-batch.ts`, `batch-queue.ts`, `sentence-scheduling.ts`, and `session.ts` (see `src/learn/engine/CODEMAP.md`).
