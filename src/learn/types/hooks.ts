/** A decision that moved a set of entities, with why. */
export type IdSetHook = (ids: string[], reason: string) => void;

/** A before/after state change on one entity. */
export type TransitionHook<T> = (id: string, previous: T, next: T) => void;

/** An allow/deny gated by a counter against a cap. */
export type CapDecisionHook = (
  id: string,
  current: number,
  cap: number,
  decision: 'retry' | 'drop',
) => void;

/** How a total was split across named parts. */
export type DistributionHook = (
  total: number,
  parts: Record<string, number>,
) => void;

export interface EngineHooks {
  /** Batch assembled: foundational/vocabulary split. */
  onBatchAssembled?: DistributionHook;
  /** Word questions composed: coverage/filler split. */
  onWordBatchComposed?: DistributionHook;
  /** Active pool advanced: retired/refilled counts. */
  onPoolAdvanced?: DistributionHook;
  /** Words crossed the mastery threshold. */
  onMastered?: IdSetHook;
  /** Sentence contexts excluded from eligibility. */
  onSentenceExcluded?: IdSetHook;
  /** A retry was granted or denied against a cap. */
  onRetryDecision?: CapDecisionHook;
}

/** Reasons a sentence context is filtered out of eligibility, in gate order. */
export type SentenceExclusionReason =
  | 'word-not-seen-enough'
  | 'sentence-inactive'
  | 'batch-gap-cooldown'
  | 'missing-pool-item';
