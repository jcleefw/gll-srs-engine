import type { MockWord } from '../../../data/mock/mock-words.js';
import type { QuizChoice, QuizDirection, MCQQuestion } from '../types/quiz.js';
import type { MockFoundational } from '../types/foundational.js';
import type { EngineHooks } from '../types/hooks.js';
import { shuffle } from '../utils/shuffle.js';

export type QuizItem = MockFoundational | MockWord;

export const FOUNDATIONAL_DIRECTIONS: Record<
  MockFoundational['foundationalType'],
  QuizDirection[]
> = {
  consonant: [
    'native-to-english',
    'english-to-native',
    'native-to-romanization',
    'romanization-to-native',
  ],
  vowel: [
    'native-to-english',
    'english-to-native',
    'native-to-romanization',
    'romanization-to-native',
  ],
  tone: ['native-to-english', 'english-to-native'],
};

/** Consonants are formatted as "sound (class)", e.g. "k (middle)". */
function getEnglishLabel(item: QuizItem): string {
  if ('foundationalType' in item && item.foundationalType === 'consonant') {
    return `${item.english} (${item.class})`;
  }
  return item.english;
}

/**
 * Builds a 4-choice set from one correct value and up to 3 distractors,
 * shuffled and labelled a–d.
 */
function makeChoices(
  correct: string,
  distractors: string[],
  rng?: () => number,
): QuizChoice[] {
  const labels = ['a', 'b', 'c', 'd'] as const;
  const values = shuffle([correct, ...distractors.slice(0, 3)], rng);
  return values.map((value, i) => ({
    label: labels[i],
    value,
    isCorrect: value === correct,
  }));
}

/**
 * Generates up to `questionLimit` questions across multiple items,
 * guaranteeing at least one question per item.
 */
export function composeWordBatchMulti(
  words: QuizItem[],
  pool: QuizItem[],
  options: { questionLimit: number; shuffle?: boolean; rng?: () => number },
  hooks?: EngineHooks,
): MCQQuestion[] {
  const { questionLimit, shuffle: shouldShuffle = true, rng } = options;

  /**
   * Populates all combination of words direction for each word
   * @example
   * words = [ [A1,A2,A3,A4], [B1,B2,B3,B4], [C1,C2,C3,C4] ]
   * @output
   * unshuffle = [A1,A2,A3,A4,B1,B2,B3,B4,C1,C2,C3,C4]
   * shuffled = [ [A3,A1,A4,A2], [B2,B4,B1,B3], [C4,C1,C3,C2] ]
   *
   */
  const questionsByWord = words.map((word) => {
    const questions = composeWordBatch(word, pool, rng);
    return shouldShuffle ? shuffle(questions, rng) : questions;
  });

  /**
   * coverage picks the first one in the list
   * @output [A3, B2, C4]
   */
  const coverage = questionsByWord.map((qs) => qs[0]).slice(0, questionLimit);
  /**
   * @output [A1,A4,A2, B4,B1,B3, C1,C3,C2]
   */
  const leftover = questionsByWord.flatMap((qs) => qs.slice(1));
  const fillCount = Math.max(0, questionLimit - coverage.length);
  /**
   * Without shuffle, it'll always take what's in the front of queue first
   * @example
   * unshuffled = [A1,A4,A2, B4,B1,B3]
   * shuffled   = [B1,A2,B3,A1,B4,A4]
   */
  const filler = shouldShuffle
    ? shuffle(leftover, rng).slice(0, fillCount)
    : leftover.slice(0, fillCount);

  /**
   * Without shuffle, it'll always return coverage (first 3), then shuffle (last 3)
   * @example
   * unshuffled = [A3,B2,C4, B1,A2,B3]
   * shuffled   = [B1,A3,B3,C4,B2,A2]
   */
  const batch = [...coverage, ...filler];

  if (words.length > 0) {
    hooks?.onWordBatchComposed?.(questionLimit, {
      coverage: coverage.length,
      filler: filler.length,
    });
  }

  return shouldShuffle ? shuffle(batch, rng) : batch;
}

/** Builds one question for a given direction, drawing distractors from pool. */
function makeQuestion(
  item: QuizItem,
  direction: QuizDirection,
  pool: QuizItem[],
  rng?: () => number,
): MCQQuestion {
  const others = pool.filter((c) => c.id !== item.id);

  switch (direction) {
    case 'native-to-english':
      return {
        kind: 'mcq',
        wordId: item.id,
        direction: 'native-to-english',
        prompt: item.native,
        choices: makeChoices(
          getEnglishLabel(item),
          others.map(getEnglishLabel),
          rng,
        ),
      };
    case 'english-to-native':
      return {
        kind: 'mcq',
        wordId: item.id,
        direction: 'english-to-native',
        prompt: getEnglishLabel(item),
        choices: makeChoices(
          item.native,
          others.map((c) => c.native),
          rng,
        ),
      };
    case 'native-to-romanization':
      return {
        kind: 'mcq',
        wordId: item.id,
        direction: 'native-to-romanization',
        prompt: item.native,
        choices: makeChoices(
          item.romanization,
          others.map((c) => c.romanization),
          rng,
        ),
      };
    case 'romanization-to-native':
      return {
        kind: 'mcq',
        wordId: item.id,
        direction: 'romanization-to-native',
        prompt: item.romanization,
        choices: makeChoices(
          item.native,
          others.map((c) => c.native),
          rng,
        ),
      };
  }
}

/**
 * Generates one question per direction for a single item. Foundational
 * types use their type-specific direction set; words use all four.
 */
export function composeWordBatch(
  item: QuizItem,
  pool: QuizItem[],
  rng?: () => number,
): MCQQuestion[] {
  const directions: QuizDirection[] =
    'foundationalType' in item
      ? FOUNDATIONAL_DIRECTIONS[item.foundationalType]
      : [
          'native-to-english',
          'english-to-native',
          'native-to-romanization',
          'romanization-to-native',
        ];

  return directions.map((direction) => makeQuestion(item, direction, pool, rng));
}

export const composeWordBatchItems = composeWordBatchMulti;
