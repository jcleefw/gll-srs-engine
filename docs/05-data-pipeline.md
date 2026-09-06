# How the SRS Engine Works — Data Pipeline View

> For: Developers tracing where word/sentence data comes from before it reaches the engine
> Depth: Ingestion → DB → query layer → engine inputs

---

## Pipeline overview

```
Conversation JSON
  └──▶ Ingestion Layer → Database
         ├── words             (wordId, native, romanization, english, type, language)
         ├── sentences         (sentenceId, nativeSentence, englishSentence,
         │                      nativeWordOrder: wordId[], englishWordOrder: string[],
         │                      blankPosition: number)
         └── sentence_words    (sentenceId, wordId, position) ← join table

Database → Query Layer
  └──▶ resolves words, pool, eligible SentenceContexts

Query Layer → Caller (demo app / host application)
  └──▶ passes [words], [pool], [sentenceContexts] into engine as inputs

Engine
  └──▶ stateless — operates only on what it receives, no DB access
```

---

## Source of truth

The **conversation JSON** (see `data/mock/mock-decks.ts` for the current mock shape) is the canonical source for both:

- **Words** — each line in a conversation carries the words it contains, with `id`, `native`, `romanization`, `english`, `type`, `language`
- **Sentences** — each line is a sentence; the words it contains and their positions are implicit in the JSON structure

The ingestion layer derives `SentenceContext` records from the conversation JSON at import time. `nativeWordOrder` (ordered `wordId[]`) and `blankPosition` are computed during ingestion — they are not hand-authored.

---

## What the engine receives

The engine has no knowledge of the database schema, the conversation JSON format, or how sentences are associated with words — see [02-concepts.md § The boundary: engine vs. host](02-concepts.md#the-boundary-engine-vs-host) for why. It receives only:

- `words: QuizItem[]` — the words to learn in this session
- `pool: QuizItem[]` — the distractor pool
- `sentenceContexts: SentenceContext[]` — pre-resolved eligible sentences (caller's responsibility)
- `config: LearningConfig` — session configuration constants

The **caller** (demo app, or future host application) is responsible for:
- Loading words from the DB for the selected deck
- Querying eligible `SentenceContext` records (e.g. sentences where all `wordId`s have `seen >= minSeenForSentence`)
- Passing these as inputs into `runAdaptiveLoop`

---

## Related

- ADR: `product-documentation/architecture/20260513T000000Z-engineering-batch-execution-mechanics.md` — session inputs and composer registry
- ADR: `product-documentation/architecture/20260512T235900Z-engineering-compose-sentence-batch-boundary.md` — `SentenceContext` fields and `composeSentenceBatch` interface
- PRD: `product-documentation/prds/20260513T000000Z-sentence-question-ep.md` — `SentenceContext` data model
- Mock data: `data/mock/mock-decks.ts` — current conversation JSON shape
