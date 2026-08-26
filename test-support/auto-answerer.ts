import {
  nextQuestion,
  submitBatchResult,
  type BatchState,
} from '../src/learn/index.js';
import type { AutoAnswerStrategy } from './auto-answer-strategy.js';

export function runAutoInteractive(
  initialState: BatchState,
  strategy: AutoAnswerStrategy,
): { correct: number; total: number; state: BatchState } {
  let score = 0;
  let count = 0;
  let state = initialState;

  for (;;) {
    const { question, state: nextState } = nextQuestion(state);
    state = nextState;
    if (!question) break;
    count++;

    if (question.kind === 'word-block') {
      state = submitBatchResult(state, {
        sentenceId: question.sentenceId,
        correct: true,
      });
      score++;
      continue;
    }

    if (question.choices.length === 0) {
      throw new Error(
        `runAutoInteractive: Question ${String(count)} has no choices`,
      );
    }
    if (!question.choices.find((c) => c.isCorrect)) {
      throw new Error(
        `runAutoInteractive: Question ${String(count)} has no correct answer marked`,
      );
    }

    const selectedIndex = strategy.selectAnswer(question);

    if (selectedIndex < 0 || selectedIndex >= question.choices.length) {
      throw new Error(
        `runAutoInteractive: Strategy returned invalid index ${String(selectedIndex)} for question ${String(count)}`,
      );
    }

    const selected = question.choices[selectedIndex];
    const wasCorrect = selected.isCorrect;

    if (wasCorrect) {
      score++;
    }

    state = submitBatchResult(state, {
      wordId: question.wordId,
      correct: wasCorrect,
    });
  }

  return { correct: score, total: count, state };
}
