import { describe, it, expect } from 'vitest';
import {
  resolveEligibleContexts,
  updateSentenceRunState,
  defaultSentenceState,
  type SentenceRunState,
  type RunState,
  type QuizItem,
  type SentenceContext,
} from '../../index.js';

const testConfig = {
  minSeenForSentence: 2,
  sentenceBatchGap: 1,
  sentenceCorrectStreakThreshold: 3,
  sentenceWrongStreakThreshold: 3,
};

const testCorpus: SentenceContext[] = [
  {
    sentenceId: 'sent::001',
    englishSentence: "I'm hungry, let's go eat something",
    wordOrder: ['th::หิว', 'th::แล้ว', 'th::ไป', 'th::กิน', 'th::อะไร', 'th::กัน'],
  },
  {
    sentenceId: 'sent::002',
    englishSentence: "It's really hot today",
    wordOrder: ['th::วันนี้', 'th::ร้อน', 'th::มาก', 'th::เลย'],
  },
];

describe('Sentence Spacing and Eligibility Gates', () => {
  const wordIds = [
    'th::หิว',
    'th::แล้ว',
    'th::ไป',
    'th::กิน',
    'th::อะไร',
    'th::กัน',
    'th::วันนี้',
    'th::ร้อน',
    'th::มาก',
    'th::เลย',
  ];

  const runState: RunState = new Map();
  for (const id of wordIds) {
    runState.set(id, {
      wordId: id,
      seen: 2, // passes the minSeenForSentence check which is 2
      correct: 2,
      mastery: 0,
      correctStreak: 0,
      wrongStreak: 0,
      lapses: 0,
    });
  }

  const allPool: QuizItem[] = wordIds.map((id) => ({
    id,
    native: id.replace('th::', ''),
    romanization: '',
    english: '',
    type: 'word',
    language: 'th',
  }));

  it('allows sentence to pass spacing check if never seen before (lastBatchSeen = -1)', () => {
    const sentenceRunState: SentenceRunState = new Map();
    // Default/fresh sentence state starts with lastBatchSeen = -1
    const s1 = defaultSentenceState('sent::001');
    const s2 = defaultSentenceState('sent::002');
    sentenceRunState.set('sent::001', s1);
    sentenceRunState.set('sent::002', s2);

    const eligible = resolveEligibleContexts(testCorpus, runState, allPool, sentenceRunState, 1, testConfig);
    const eligibleIds = eligible.map((e) => e.ctx.sentenceId);

    expect(eligibleIds).toContain('sent::001');
    expect(eligibleIds).toContain('sent::002');
  });

  it('a never-seen sentence passes even at batch 0, where a seen-sentence gap check would fail', () => {
    const sentenceRunState: SentenceRunState = new Map();
    sentenceRunState.set('sent::001', defaultSentenceState('sent::001'));

    const eligible = resolveEligibleContexts(testCorpus, runState, allPool, sentenceRunState, 0, testConfig);

    expect(eligible.map((e) => e.ctx.sentenceId)).toContain('sent::001');
  });

  it('excludes sentence from consecutive batch (back-to-back spacing failure)', () => {
    const sentenceRunState: SentenceRunState = new Map();
    const s1 = defaultSentenceState('sent::001');
    s1.lastBatchSeen = 1; // seen in batch 1
    const s2 = defaultSentenceState('sent::002'); // never seen

    sentenceRunState.set('sent::001', s1);
    sentenceRunState.set('sent::002', s2);

    // Evaluating for batch 2 (gap = 2 - 1 = 1 <= sentenceBatchGap 1)
    const eligible = resolveEligibleContexts(testCorpus, runState, allPool, sentenceRunState, 2, testConfig);
    const eligibleIds = eligible.map((e) => e.ctx.sentenceId);

    expect(eligibleIds).not.toContain('sent::001');
    expect(eligibleIds).toContain('sent::002');
  });

  it('allows sentence to reappear after gap threshold is satisfied (spacing success)', () => {
    const sentenceRunState: SentenceRunState = new Map();
    const s1 = defaultSentenceState('sent::001');
    s1.lastBatchSeen = 1; // seen in batch 1
    const s2 = defaultSentenceState('sent::002');

    sentenceRunState.set('sent::001', s1);
    sentenceRunState.set('sent::002', s2);

    // Evaluating for batch 3 (gap = 3 - 1 = 2 > sentenceBatchGap 1)
    const eligible = resolveEligibleContexts(testCorpus, runState, allPool, sentenceRunState, 3, testConfig);
    const eligibleIds = eligible.map((e) => e.ctx.sentenceId);

    expect(eligibleIds).toContain('sent::001');
    expect(eligibleIds).toContain('sent::002');
  });

  it('excludes inactive sentences regardless of gap spacing', () => {
    const sentenceRunState: SentenceRunState = new Map();
    const s1 = defaultSentenceState('sent::001');
    s1.active = false; // graduated/shelved
    s1.lastBatchSeen = 1;
    const s2 = defaultSentenceState('sent::002');

    sentenceRunState.set('sent::001', s1);
    sentenceRunState.set('sent::002', s2);

    // Evaluating for batch 4
    const eligible = resolveEligibleContexts(testCorpus, runState, allPool, sentenceRunState, 4, testConfig);
    const eligibleIds = eligible.map((e) => e.ctx.sentenceId);

    expect(eligibleIds).not.toContain('sent::001');
    expect(eligibleIds).toContain('sent::002');
  });

  describe('Streak tracking, graduation, and shelving', () => {

    it('increments correct streak and resets wrong streak on correct answer', () => {
      const sentenceRunState: SentenceRunState = new Map();
      const s = defaultSentenceState('sent::001');
      s.sessionWrongStreak = 2;
      sentenceRunState.set('sent::001', s);

      const results = [{ sentenceId: 'sent::001', correct: true }];
      updateSentenceRunState(sentenceRunState, results, 1, testConfig);

      const updated = sentenceRunState.get('sent::001')!;
      expect(updated.sentenceStreak).toBe(1);
      expect(updated.sessionWrongStreak).toBe(0);
      expect(updated.active).toBe(true);
      expect(updated.lastBatchSeen).toBe(1);
    });

    it('increments wrong streak and resets correct streak on wrong answer', () => {
      const sentenceRunState: SentenceRunState = new Map();
      const s = defaultSentenceState('sent::001');
      s.sentenceStreak = 2;
      sentenceRunState.set('sent::001', s);

      const results = [{ sentenceId: 'sent::001', correct: false }];
      updateSentenceRunState(sentenceRunState, results, 1, testConfig);

      const updated = sentenceRunState.get('sent::001')!;
      expect(updated.sessionWrongStreak).toBe(1);
      expect(updated.sentenceStreak).toBe(0);
      expect(updated.active).toBe(true);
      expect(updated.lastBatchSeen).toBe(1);
    });

    it('graduates sentence (active = false) when correct streak threshold is reached', () => {
      const sentenceRunState: SentenceRunState = new Map();
      const s = defaultSentenceState('sent::001');
      s.sentenceStreak = 2;
      sentenceRunState.set('sent::001', s);

      // 3rd correct answer hits threshold (3)
      const results = [{ sentenceId: 'sent::001', correct: true }];
      updateSentenceRunState(sentenceRunState, results, 1, testConfig);

      const updated = sentenceRunState.get('sent::001')!;
      expect(updated.sentenceStreak).toBe(3);
      expect(updated.active).toBe(false);
    });

    it('shelves sentence (active = false) when wrong streak threshold is reached', () => {
      const sentenceRunState: SentenceRunState = new Map();
      const s = defaultSentenceState('sent::001');
      s.sessionWrongStreak = 2;
      sentenceRunState.set('sent::001', s);

      // 3rd wrong answer hits threshold (3)
      const results = [{ sentenceId: 'sent::001', correct: false }];
      updateSentenceRunState(sentenceRunState, results, 1, testConfig);

      const updated = sentenceRunState.get('sent::001')!;
      expect(updated.sessionWrongStreak).toBe(3);
      expect(updated.active).toBe(false);
    });

    it('excludes graduated/shelved sentences from resolveEligibleContexts in subsequent batches', () => {
      const sentenceRunState: SentenceRunState = new Map();
      const s1 = defaultSentenceState('sent::001');
      s1.sentenceStreak = 2;
      const s2 = defaultSentenceState('sent::002');
      s2.sessionWrongStreak = 2;

      sentenceRunState.set('sent::001', s1);
      sentenceRunState.set('sent::002', s2);

      // s1 gets correct (threshold met), s2 gets wrong (threshold met)
      const results = [
        { sentenceId: 'sent::001', correct: true },
        { sentenceId: 'sent::002', correct: false },
      ];
      updateSentenceRunState(sentenceRunState, results, 1, testConfig);

      // Both should now be active = false
      expect(sentenceRunState.get('sent::001')!.active).toBe(false);
      expect(sentenceRunState.get('sent::002')!.active).toBe(false);

      // Subsequent resolveEligibleContexts call on batch 2 should exclude both
      const eligible = resolveEligibleContexts(testCorpus, runState, allPool, sentenceRunState, 2, testConfig);
      const eligibleIds = eligible.map((e) => e.ctx.sentenceId);

      expect(eligibleIds).not.toContain('sent::001');
      expect(eligibleIds).not.toContain('sent::002');
    });
  });

  describe('Word-level shelving (excludeIds)', () => {
    it('drops a sentence context when one of its words is excluded', () => {
      const sentenceRunState: SentenceRunState = new Map();
      sentenceRunState.set('sent::001', defaultSentenceState('sent::001'));
      sentenceRunState.set('sent::002', defaultSentenceState('sent::002'));

      const excludeIds = new Set(['th::กิน']); // a word only used in sent::001

      const eligible = resolveEligibleContexts(
        testCorpus,
        runState,
        allPool,
        sentenceRunState,
        1,
        testConfig,
        excludeIds,
      );
      const eligibleIds = eligible.map((e) => e.ctx.sentenceId);

      expect(eligibleIds).not.toContain('sent::001');
      expect(eligibleIds).toContain('sent::002');
    });

    it('keeps all sentences when excludeIds is empty or omitted', () => {
      const sentenceRunState: SentenceRunState = new Map();
      sentenceRunState.set('sent::001', defaultSentenceState('sent::001'));
      sentenceRunState.set('sent::002', defaultSentenceState('sent::002'));

      const eligible = resolveEligibleContexts(
        testCorpus,
        runState,
        allPool,
        sentenceRunState,
        1,
        testConfig,
        new Set(),
      );
      const eligibleIds = eligible.map((e) => e.ctx.sentenceId);

      expect(eligibleIds).toContain('sent::001');
      expect(eligibleIds).toContain('sent::002');
    });
  });

  describe('word-seen gate', () => {
    it('excludes a sentence when any one of its words has not met minSeenForSentence', () => {
      const partialRunState: RunState = new Map();
      partialRunState.set('th::หิว', { wordId: 'th::หิว', seen: 2, correct: 2, mastery: 0, correctStreak: 0, wrongStreak: 0, lapses: 0 });
      partialRunState.set('th::แล้ว', { wordId: 'th::แล้ว', seen: 0, correct: 0, mastery: 0, correctStreak: 0, wrongStreak: 0, lapses: 0 });

      const sentenceRunState: SentenceRunState = new Map();
      sentenceRunState.set('sent::001', defaultSentenceState('sent::001'));

      const eligible = resolveEligibleContexts(testCorpus, partialRunState, allPool, sentenceRunState, 1, testConfig);

      expect(eligible.map((e) => e.ctx.sentenceId)).not.toContain('sent::001');
    });

    it('includes a sentence once every one of its words has met minSeenForSentence', () => {
      const sentenceRunState: SentenceRunState = new Map();
      sentenceRunState.set('sent::001', defaultSentenceState('sent::001'));

      const eligible = resolveEligibleContexts(testCorpus, runState, allPool, sentenceRunState, 1, testConfig);

      expect(eligible.map((e) => e.ctx.sentenceId)).toContain('sent::001');
    });

    it('excludes a sentence when one word is exactly one short of minSeenForSentence', () => {
      const boundaryRunState: RunState = new Map();
      for (const id of testCorpus[0].wordOrder) {
        boundaryRunState.set(id, { wordId: id, seen: 2, correct: 2, mastery: 0, correctStreak: 0, wrongStreak: 0, lapses: 0 });
      }
      // one word sits at minSeenForSentence - 1, the boundary itself rather than 0
      boundaryRunState.set(testCorpus[0].wordOrder[0], {
        wordId: testCorpus[0].wordOrder[0],
        seen: testConfig.minSeenForSentence - 1,
        correct: 0,
        mastery: 0,
        correctStreak: 0,
        wrongStreak: 0,
        lapses: 0,
      });

      const sentenceRunState: SentenceRunState = new Map();
      sentenceRunState.set('sent::001', defaultSentenceState('sent::001'));

      const eligible = resolveEligibleContexts(testCorpus, boundaryRunState, allPool, sentenceRunState, 1, testConfig);

      expect(eligible.map((e) => e.ctx.sentenceId)).not.toContain('sent::001');
    });
  });

  describe('tile content', () => {
    it('builds tiles carrying the actual word content, not empty placeholders', () => {
      const sentenceRunState: SentenceRunState = new Map();
      sentenceRunState.set('sent::001', defaultSentenceState('sent::001'));

      const eligible = resolveEligibleContexts(testCorpus, runState, allPool, sentenceRunState, 1, testConfig);
      const sent1 = eligible.find((e) => e.ctx.sentenceId === 'sent::001')!;

      expect(sent1.tiles[0]).toMatchObject({ wordId: 'th::หิว', native: 'หิว' });
    });
  });
});

describe('updateSentenceRunState — persistence', () => {
  it('persists the updated state back into the map for a brand-new sentenceId', () => {
    const sentenceRunState: SentenceRunState = new Map();
    const results = [{ sentenceId: 'sent::new', correct: true }];

    updateSentenceRunState(sentenceRunState, results, 1, testConfig);

    expect(sentenceRunState.has('sent::new')).toBe(true);
    expect(sentenceRunState.get('sent::new')?.sentenceStreak).toBe(1);
  });
});
