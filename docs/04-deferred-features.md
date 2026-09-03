# Deferred Features — What's Not (Yet) Implemented

This document clarifies which features from the product specification are **not yet implemented** in the SRS engine v2. Use this as a reference when reading the PRD or when planning future work.

## Resolved Since Last Review

## Deferred in Current Implementation

### 1. Batch Composition Priority (PRD 5.3)

**PRD specifies**: When building a 15-question batch, select words in this order:

1. Carry-over words (unmastered from prior batches) — highest priority
2. Foundational revision words (mastered foundational words due for review)
3. New words to learn (up to 4-per-batch / 8-active caps)
4. Foundational learning words (from the active 3)

**Current engine**: No priority ranking or carry-over tracking. `assembleBatch` builds questions from the active pool without explicit prioritization. Foundational and vocabulary items split proportionally by count, but no per-batch ordering rules.

**Planned**: EP?? (Future roadmap)

---

### 2. Continuous Wrong Rule (PRD 5.6, line 23)

**PRD specifies**: 3 consecutive wrong answers on a foundational word resets mastery to 0 and schedules that word for top priority in the next batch.

**Current engine**: `wrongStreak` does decrement mastery when `wrongStreak >= wrongStreakThreshold` (standard rule), but:

- No special reset-to-0 behavior beyond standard mastery decrement
- No "top priority for next batch" scheduling or tracking
- Rule applies globally (all words), not foundational-specific

**Planned**: EP?? (Future roadmap)

---

### 3. Question Type Distribution & Percentages (PRD 5.1)

**PRD specifies**:

- Pre-foundational-depletion: 70% MC, 20% word block, 10% audio
- Post-foundational-depletion: 60% MC, 20% word block, 15% audio, 5% foundational revision
- If audio unavailable, redistribute slots to other types

**Current engine**: Only two question types exist: **word multiple choice** and **sentence word-block**. No audio recognition questions, no percentage-based distribution logic. Composers are registered and called; batch composition is driven by demand, not by percentage targets.

**Planned**: EP?? (Future roadmap — blocked on audio pipeline)

---

### 4. Peek Button Mechanics (PRD 5.8)

**PRD specifies**: A "Peek" button shows the conversation context during a quiz, but the answer doesn't count toward mastery (no +1 or −1; treated as a skip).

**Current engine**: No peek concept. The engine has no idea whether an answer was peeked. This is a UI-layer concern (the quiz application decides whether to show the button and how to filter results before calling engine functions).

**Planned**: Application layer (UI concern, not engine)

---

### 5. Lapse-Triggered Demotion Back to Learning (PRD 5.5, partial)

**PRD specifies**: If a word lapses 3 times in Review, it re-enters Learning with mastery reset to 0.

**Current engine**: FSRS-based Review scheduling itself is implemented (`FsrsScheduler` — seed/schedule/isDue), but there is no path back from Review into Learning. A word only ever moves Learn → Review; a lapse in Review advances the FSRS schedule (pulls the next due date closer) but never resets `WordState.mastery` or re-inserts the word into the active/queue pools.

**Planned**: EP21 (SRS Learning → Review Phase Integration)

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
✅ **Stuck word shelving** — `evaluateShelving` / `unshelveAll` (`@gll/srs-engine/shelving`)  
✅ **Long-term FSRS review** — seed/schedule/isDue (`@gll/srs-engine/review`), server-only

---

## How to Use This Document

- **Implementing a deferred feature?** Check here first to understand what the current engine does vs. what the PRD promises.
- **Reading the PRD and confused?** This clarifies the gap between specification and implementation.
- **Planning the next epic?** Each deferred feature points to a potential story or epic.

See `01-stakeholder.md`, `02-concepts.md`, and `03-walkthrough.md` for what the current engine actually does.
