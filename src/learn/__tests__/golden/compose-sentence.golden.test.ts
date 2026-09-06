import { describe, it, expect } from 'vitest';
import { composeSentenceBatch } from '../../engine/compose-sentence-batch.js';
import { LANGUAGE_CONFIG } from '../../../config/language.js';
import type { SentenceContext } from '../../types/sentence.js';
import type { SentenceTile, SentenceQuestion } from '../../types/quiz.js';
import { seededRng } from '../../../../test-support/seeded-rng.js';
import thJson from '../fixtures/compose-sentence.th.golden.json' with { type: 'json' };
import jaJson from '../fixtures/compose-sentence.ja.golden.json' with { type: 'json' };
import zhJson from '../fixtures/compose-sentence.zh.golden.json' with { type: 'json' };
import koJson from '../fixtures/compose-sentence.ko.golden.json' with { type: 'json' };
import enJson from '../fixtures/compose-sentence.en.golden.json' with { type: 'json' };

const th = thJson as SentenceQuestion[];
const ja = jaJson as SentenceQuestion[];
const zh = zhJson as SentenceQuestion[];
const ko = koJson as SentenceQuestion[];
const en = enJson as SentenceQuestion[];

// A failure here is a diff, not a verdict. Triage it by hand: confirm the
// change producing the diff is intended, then regenerate this fixture in the
// same commit as that change, reviewed alongside it. Never add an
// auto-regenerate escape hatch — a silently-refreshed fixture stops proving
// anything.

const SEED = 42;

interface LanguageCase {
  language: string;
  ctx: SentenceContext;
  tiles: SentenceTile[];
  fixture: SentenceQuestion[];
}

// One case per LANGUAGE_CONFIG entry — th/ja/zh/ko are 'no-space', en is
// 'space'. Native prompt/tile script is fabricated per language (this
// package has no per-language mock sentence corpus); romanization is always
// plain latin so its space-joining is directly comparable across languages.
const CASES: LanguageCase[] = [
  {
    language: 'th',
    ctx: { sentenceId: 'sent::th::001', englishSentence: "I'm hungry, let's go eat", wordOrder: ['th::hungry', 'th::go', 'th::eat'] },
    tiles: [
      { wordId: 'th::hungry', native: 'หิว', romanization: 'hǐw', english: 'hungry' },
      { wordId: 'th::go', native: 'ไป', romanization: 'bpai', english: 'go' },
      { wordId: 'th::eat', native: 'กิน', romanization: 'gin', english: 'eat' },
    ],
    fixture: th,
  },
  {
    language: 'ja',
    ctx: { sentenceId: 'sent::ja::001', englishSentence: 'I eat sushi', wordOrder: ['ja::i', 'ja::eat', 'ja::sushi'] },
    tiles: [
      { wordId: 'ja::i', native: '私は', romanization: 'watashi wa', english: 'I' },
      { wordId: 'ja::eat', native: '食べる', romanization: 'taberu', english: 'eat' },
      { wordId: 'ja::sushi', native: '寿司', romanization: 'sushi', english: 'sushi' },
    ],
    fixture: ja,
  },
  {
    language: 'zh',
    ctx: { sentenceId: 'sent::zh::001', englishSentence: 'I eat rice', wordOrder: ['zh::i', 'zh::eat', 'zh::rice'] },
    tiles: [
      { wordId: 'zh::i', native: '我', romanization: 'wǒ', english: 'I' },
      { wordId: 'zh::eat', native: '吃', romanization: 'chī', english: 'eat' },
      { wordId: 'zh::rice', native: '饭', romanization: 'fàn', english: 'rice' },
    ],
    fixture: zh,
  },
  {
    language: 'ko',
    ctx: { sentenceId: 'sent::ko::001', englishSentence: 'I eat rice', wordOrder: ['ko::i', 'ko::eat', 'ko::rice'] },
    tiles: [
      { wordId: 'ko::i', native: '저는', romanization: 'jeoneun', english: 'I' },
      { wordId: 'ko::eat', native: '먹어요', romanization: 'meogeoyo', english: 'eat' },
      { wordId: 'ko::rice', native: '밥을', romanization: 'babeul', english: 'rice' },
    ],
    fixture: ko,
  },
  {
    language: 'en',
    ctx: { sentenceId: 'sent::en::001', englishSentence: "Je mange du riz", wordOrder: ['en::i', 'en::eat', 'en::rice'] },
    tiles: [
      { wordId: 'en::i', native: 'I', romanization: 'ai', english: 'I' },
      { wordId: 'en::eat', native: 'eat', romanization: 'iːt', english: 'eat' },
      { wordId: 'en::rice', native: 'rice', romanization: 'rais', english: 'rice' },
    ],
    fixture: en,
  },
];

describe('sentence composition golden fixture', () => {
  it('every LANGUAGE_CONFIG entry has a case in this suite', () => {
    expect(CASES.map(c => c.language).sort()).toEqual(Object.keys(LANGUAGE_CONFIG).sort());
  });

  describe.each(CASES)('$language', ({ language, ctx, tiles, fixture }) => {
    function run(): SentenceQuestion[] {
      return composeSentenceBatch(ctx, tiles, language, { rng: seededRng(SEED) });
    }

    it('is deterministic across repeated runs with the same seed', () => {
      const first = run();
      const second = run();
      expect(second).toEqual(first);
    });

    it('matches recorded output', () => {
      expect(run()).toEqual(fixture);
    });

    it(`romanization-to-native prompt stays space-separated (wordJoin: ${LANGUAGE_CONFIG[language].wordJoin})`, () => {
      const [, romanizationQuestion] = run();
      expect(romanizationQuestion.prompt).toBe(tiles.map(t => t.romanization).join(' '));
    });
  });
});
