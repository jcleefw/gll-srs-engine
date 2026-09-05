import {
  createComposerRegistry,
  assembleBatchQuestions,
} from './compose-registry.js';
import { composeWordBatchItems, type QuizItem } from './compose-word-batch.js';
import { type QuizQuestion } from '../types/quiz.js';
import { type EngineHooks } from '../types/hooks.js';
import { shuffle as shuffleArray } from '../utils/shuffle.js';
import { validateBatch, type BatchViolation } from './validate-batch.js';

export interface AssembleBatchOptions {
  /** If true, the final batch of questions will be shuffled. Defaults to true. */
  shuffle?: boolean;
  /**
   * Optional array of additional thunks (e.g. for sentences) to include in the batch.
   * Receives the active excludeIds so a retry with a widened set can actually
   * filter out the leak, instead of reproducing the same output.
   */
  extraThunks?: ((excludeIds?: Set<string>) => QuizQuestion[])[];
  /** Optional set of item IDs to exclude from question generation. */
  excludeIds?: Set<string>;
}

/**
 * Orchestrates the assembly of a quiz batch.
 * Handles partitioning active items into foundational vs. vocabulary and calculating limits.
 */
export function assembleBatch(
  active: QuizItem[],
  wordPool: QuizItem[],
  foundationalPool: QuizItem[],
  wordsPerBatch: number,
  options: AssembleBatchOptions = {},
  hooks?: EngineHooks,
): QuizQuestion[] {
  const { shuffle = true, extraThunks = [], excludeIds } = options;

  let questions = composeQuestions(
    active,
    wordPool,
    foundationalPool,
    wordsPerBatch,
    excludeIds,
    extraThunks,
    hooks,
  );

  let validation = validateBatch(questions, { excludeIds });

  if (!validation.valid) {
    const leaked = validation.violations
      .filter((v): v is Extract<BatchViolation, { kind: 'excluded-word' }> => v.kind === 'excluded-word')
      .map((v) => v.wordId);

    if (leaked.length > 0) {
      const widenedExcludeIds = new Set([...(excludeIds ?? []), ...leaked]);
      questions = composeQuestions(
        active,
        wordPool,
        foundationalPool,
        wordsPerBatch,
        widenedExcludeIds,
        extraThunks,
        hooks,
      );
      validation = validateBatch(questions, { excludeIds: widenedExcludeIds });
    }

    if (!validation.valid) {
      const droppedIndices = new Set(
        validation.violations.map((v) => v.questionIndex),
      );
      questions = questions.filter((_, index) => !droppedIndices.has(index));
    }
  }

  return shuffle ? shuffleArray(questions) : questions;
}

function composeQuestions(
  active: QuizItem[],
  wordPool: QuizItem[],
  foundationalPool: QuizItem[],
  wordsPerBatch: number,
  excludeIds: Set<string> | undefined,
  extraThunks: ((excludeIds?: Set<string>) => QuizQuestion[])[],
  hooks?: EngineHooks,
): QuizQuestion[] {
  const eligible = excludeIds?.size
    ? active.filter((item) => !excludeIds.has(item.id))
    : active;

  const activeFoundational = eligible.filter(
    (item) => 'foundationalType' in item,
  );
  const activeWords = eligible.filter((item) => !('foundationalType' in item));

  // Partition the questionLimit proportionally between foundational and vocabulary
  // eligible.length > 0 guard: unread when eligible is empty (equivalent mutant)
  const foundationalLimit =
    eligible.length > 0
      ? Math.round((wordsPerBatch * activeFoundational.length) / eligible.length)
      : 0;
  const wordLimit = wordsPerBatch - foundationalLimit;

  if (eligible.length > 0) {
    hooks?.onBatchAssembled?.(eligible.length, {
      foundational: foundationalLimit,
      vocabulary: wordLimit,
    });
  }

  const registry = createComposerRegistry();

  // shuffle: false — stop shuffling in the inner thunk
  // delegating shuffle to code below. Avoid double shuffling
  if (activeFoundational.length > 0) {
    registry.add(() =>
      composeWordBatchItems(
        activeFoundational,
        foundationalPool,
        { questionLimit: foundationalLimit, shuffle: false },
        hooks,
      ),
    );
  }

  // shuffle: false — stop shuffling in the inner thunk
  // delegating shuffle to code below. Avoid double shuffling
  if (activeWords.length > 0) {
    registry.add(() =>
      composeWordBatchItems(
        activeWords,
        wordPool,
        { questionLimit: wordLimit, shuffle: false },
        hooks,
      ),
    );
  }

  for (const thunk of extraThunks) {
    registry.add(() => thunk(excludeIds));
  }

  return assembleBatchQuestions(registry);
}
