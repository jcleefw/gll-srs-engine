# Deferred Features — What's Not (Yet) Implemented

This document clarifies which features from the product specification are **not yet implemented** in the SRS engine v2. Use this as a reference when reading the PRD or when planning future work.

## Resolved Since Last Review

## Deferred in Current Implementation

### 1. Question Type Distribution & Percentages (PRD 5.1)

**PRD specifies**:

- Pre-foundational-depletion: 70% MC, 20% word block, 10% audio
- Post-foundational-depletion: 60% MC, 20% word block, 15% audio, 5% foundational revision
- If audio unavailable, redistribute slots to other types

**Current engine**: Only two question types exist: **word multiple choice** and **sentence word-block**. No audio recognition questions, no percentage-based distribution logic. Composers are registered and called; batch composition is driven by demand, not by percentage targets.

**Planned**: EP?? (Future roadmap — blocked on audio pipeline)

---

### 2. Explicit "Mark as Hard" Override (Review phase only)

**Concept**: An optional manual "this was hard" flag the user may choose to set on a Review answer. Purely additive — one more signal into the same app-layer rating inference; an explicit `Hard` overrides the response-time-based guess (`Again` / `Hard` / `Good` / `Easy`). Touches neither the scheduler interface, the store, nor the schema.

**Scope**: Review phase only. FSRS rating inference doesn't exist in the Learning phase (streak-based mastery has no rating concept), so this does not apply there.

**Current engine**: Not implemented — no manual override input exists; rating is always derived from response time.

**Planned**: Not yet scheduled.

---

### 3. Per-Word-Type Mastery Thresholds

**Concept**: A single mastery threshold currently applies to every word regardless of type (foundational consonant/vowel/tone vs. curated vocabulary). Splitting this by word type was deliberately deferred until the single-threshold model is validated in practice.

**Current engine**: One global threshold, no per-type variation.

**Planned**: Not yet scheduled.

---

## What IS Implemented

✅ **Sliding window** — new words enter active pool only when a slot opens  
✅ **Streak-driven mastery** — `correctStreak` and `wrongStreak` with configurable thresholds  
✅ **Within-batch retry** — wrong answers re-queue for the same batch  
✅ **Foundational items** — proportional slot allocation for consonants, vowels, tones  
✅ **Sentence questions** — word-block construction with independent shelving  
✅ **Global mastery model** — wordId-based, shared across decks  
✅ **Recheckpending / recheckReentered** — retry penalty suppression + retirement blocking  
✅ **Language config** — space-less script support (Thai, Japanese, etc.)  
✅ **Composer registry** — extensible batch assembly pattern  
✅ **Stuck word shelving** — `evaluateShelving` / `unshelveAll` (`gll-srs-engine/shelving`)  
✅ **Long-term FSRS review** — seed/schedule/isDue (`gll-srs-engine/review`), server-only

---

## How to Use This Document

- **Implementing a deferred feature?** Check here first to understand what the current engine does vs. what the PRD promises.
- **Reading the PRD and confused?** This clarifies the gap between specification and implementation.
- **Planning the next epic?** Each deferred feature points to a potential story or epic.

See `01-stakeholder.md`, `02-concepts.md`, and `03-walkthrough.md` for what the current engine actually does.

