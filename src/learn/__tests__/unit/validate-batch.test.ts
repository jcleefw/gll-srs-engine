import { describe, it, expect } from 'vitest';
import { validateBatch } from '../../engine/validate-batch.js';
import type { MCQQuestion, SentenceQuestion, SentenceTile } from '../../types/quiz.js';

function mcq(wordId: string, direction: MCQQuestion['direction'] = 'native-to-english'): MCQQuestion {
  return {
    kind: 'mcq',
    wordId,
    direction,
    prompt: wordId,
    choices: [{ label: 'a', value: wordId, isCorrect: true }],
  };
}

function tile(wordId: string): SentenceTile {
  return { wordId, native: wordId, romanization: wordId, english: wordId };
}

function sentence(
  sentenceId: string,
  wordIds: string[],
  direction: SentenceQuestion['direction'] = 'native-to-english',
): SentenceQuestion {
  return {
    kind: 'word-block',
    sentenceId,
    direction,
    prompt: sentenceId,
    tiles: wordIds.map(tile),
    answer: wordIds,
  };
}

describe('validateBatch — excluded words', () => {
  it('clean batch with no excluded words is valid', () => {
    const result = validateBatch([mcq('w1'), sentence('s1', ['w2', 'w3'])], {
      excludeIds: new Set(['shelved']),
    });
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('flags an excluded word as a standalone MCQ', () => {
    const result = validateBatch([mcq('w1'), mcq('shelved')], {
      excludeIds: new Set(['shelved']),
    });
    expect(result.valid).toBe(false);
    expect(result.violations).toEqual([
      { kind: 'excluded-word', questionIndex: 1, questionKind: 'mcq', wordId: 'shelved' },
    ]);
  });

  it('flags an excluded word leaking in as a sentence tile', () => {
    const result = validateBatch([sentence('s1', ['w1', 'shelved', 'w3'])], {
      excludeIds: new Set(['shelved']),
    });
    expect(result.valid).toBe(false);
    expect(result.violations).toEqual([
      {
        kind: 'excluded-word',
        questionIndex: 0,
        questionKind: 'word-block',
        wordId: 'shelved',
        sentenceId: 's1',
      },
    ]);
  });

  it('reports every excluded tile within a single sentence', () => {
    const result = validateBatch([sentence('s1', ['a', 'b', 'c'])], {
      excludeIds: new Set(['a', 'c']),
    });
    expect(result.violations).toHaveLength(2);
    expect(result.violations.map((v) => v.kind === 'excluded-word' && v.wordId)).toEqual(['a', 'c']);
  });

  it('reports the same excluded word once per tile occurrence', () => {
    const result = validateBatch([sentence('s1', ['a', 'a'])], {
      excludeIds: new Set(['a']),
    });
    expect(result.violations).toEqual([
      { kind: 'excluded-word', questionIndex: 0, questionKind: 'word-block', wordId: 'a', sentenceId: 's1' },
      { kind: 'excluded-word', questionIndex: 0, questionKind: 'word-block', wordId: 'a', sentenceId: 's1' },
    ]);
  });

  it('no excludeIds → excluded-word rule is skipped', () => {
    const result = validateBatch([mcq('anything'), sentence('s1', ['x', 'y'])]);
    expect(result.valid).toBe(true);
  });

  it('empty excludeIds set → excluded-word rule is skipped', () => {
    const result = validateBatch([mcq('anything')], { excludeIds: new Set() });
    expect(result.valid).toBe(true);
  });
});

describe('validateBatch — duplicate questions', () => {
  it('flags the same word+direction MCQ appearing twice', () => {
    const result = validateBatch([mcq('w1'), mcq('w1')]);
    expect(result.valid).toBe(false);
    expect(result.violations).toEqual([
      { kind: 'duplicate-question', questionIndex: 1, identity: 'mcq:w1:native-to-english' },
    ]);
  });

  it('same word in two directions is NOT a duplicate', () => {
    const result = validateBatch([mcq('w1', 'native-to-english'), mcq('w1', 'english-to-native')]);
    expect(result.valid).toBe(true);
  });

  it('flags every repeat, not just the second', () => {
    const result = validateBatch([mcq('w1'), mcq('w1'), mcq('w1')]);
    expect(result.violations).toEqual([
      { kind: 'duplicate-question', questionIndex: 1, identity: 'mcq:w1:native-to-english' },
      { kind: 'duplicate-question', questionIndex: 2, identity: 'mcq:w1:native-to-english' },
    ]);
  });

  it('flags a repeated sentence+direction', () => {
    const result = validateBatch([sentence('s1', ['a']), sentence('s1', ['a'])]);
    expect(result.valid).toBe(false);
    expect(result.violations).toEqual([
      { kind: 'duplicate-question', questionIndex: 1, identity: 'word-block:s1:native-to-english' },
    ]);
  });

  it('same sentence in two directions is NOT a duplicate', () => {
    const result = validateBatch([
      sentence('s1', ['a'], 'native-to-english'),
      sentence('s1', ['a'], 'english-to-native'),
    ]);
    expect(result.valid).toBe(true);
  });

  it('an id shared by an MCQ and a sentence is NOT a duplicate', () => {
    const result = validateBatch([mcq('x1'), sentence('x1', ['a'])]);
    expect(result.valid).toBe(true);
  });
});

describe('validateBatch — empty choices', () => {
  it('flags an MCQ with no choices', () => {
    const result = validateBatch([{ ...mcq('w1'), choices: [] }]);
    expect(result.valid).toBe(false);
    expect(result.violations).toEqual([
      { kind: 'empty-choices', questionIndex: 0, wordId: 'w1' },
    ]);
  });

  it('a single choice is enough', () => {
    expect(validateBatch([mcq('w1')]).valid).toBe(true);
  });

  it('flags empty choices in every direction', () => {
    const directions: MCQQuestion['direction'][] = [
      'native-to-english',
      'english-to-native',
      'native-to-romanization',
      'romanization-to-native',
    ];
    const result = validateBatch(
      directions.map((d) => ({ ...mcq('w1', d), choices: [] })),
    );
    expect(result.violations).toEqual(
      directions.map((_, questionIndex) => ({ kind: 'empty-choices', questionIndex, wordId: 'w1' })),
    );
  });

  it('a sentence question with no tiles is not an empty-choices violation', () => {
    const result = validateBatch([sentence('s1', [])]);
    expect(result.violations).toEqual([]);
  });
});

describe('validateBatch — combined', () => {
  it('reports both an excluded word and a duplicate together', () => {
    const result = validateBatch([mcq('shelved'), mcq('w1'), mcq('w1')], {
      excludeIds: new Set(['shelved']),
    });
    expect(result.violations).toHaveLength(2);
    expect(result.violations.map((v) => v.kind)).toEqual(['excluded-word', 'duplicate-question']);
  });

  it('reports both rules broken by a single question', () => {
    const result = validateBatch([{ ...mcq('shelved'), choices: [] }], {
      excludeIds: new Set(['shelved']),
    });
    expect(result.violations).toEqual([
      { kind: 'excluded-word', questionIndex: 0, questionKind: 'mcq', wordId: 'shelved' },
      { kind: 'empty-choices', questionIndex: 0, wordId: 'shelved' },
    ]);
  });

  it('reports three violations across two broken duplicate questions', () => {
    const broken = { ...mcq('w1'), choices: [] };
    const result = validateBatch([broken, broken]);
    expect(result.violations).toEqual([
      { kind: 'empty-choices', questionIndex: 0, wordId: 'w1' },
      { kind: 'empty-choices', questionIndex: 1, wordId: 'w1' },
      { kind: 'duplicate-question', questionIndex: 1, identity: 'mcq:w1:native-to-english' },
    ]);
  });

  it('empty batch is valid', () => {
    expect(validateBatch([]).valid).toBe(true);
  });
});
