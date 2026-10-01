import { describe, expect, it } from 'vitest';
import { plainText, queryTokens, rank, snippet, stripParticle, tokenize } from '../src/search';

const docs = [
  {
    id: 'leave',
    title: '연차휴가 부여 기준',
    summary: '입사 1년 이상이면 15일이 생긴다.',
    body: '1년 미만 근로자는 한 달 개근마다 1일이 생긴다.\n\n입사 1년이 지나면 15일이 부여된다.',
    tags: ['인사', '휴가'],
  },
  {
    id: 'refund',
    title: '고객 환불 처리 절차',
    summary: '결제 후 7일 이내 요청은 전액 환불한다.',
    body: '1. 주문 번호를 확인한다.\n2. 결제 수단으로 환불한다.',
    tags: ['고객', '결제'],
  },
  {
    id: 'vector',
    title: '벡터 DB 선택: PostgreSQL + pgvector',
    summary: '로컬은 PGlite, 팀 서버는 PostgreSQL을 쓴다.',
    body: 'pgvector는 PostgreSQL 확장이다. 같은 스키마로 옮길 수 있다.',
    tags: ['기술'],
  },
];

describe('tokenize', () => {
  it('splits Hangul into bigrams and drops one-letter particles', () => {
    expect(tokenize('연차휴가를')).toEqual(['연차', '차휴', '휴가', '가를']);
    expect(tokenize('pgvector와 Qdrant')).toEqual(['pgvector', 'qdrant']);
  });

  it('keeps numbers and single-letter words', () => {
    expect(tokenize('15일 집')).toEqual(['15', '집']);
  });
});

describe('queryTokens', () => {
  it('removes request phrasing and particles but keeps the subject', () => {
    expect(queryTokens('연차 규정을 알려줘')).toEqual(['연차', '규정']);
  });

  it('strips particles and endings so only the stems are searched', () => {
    expect(queryTokens('입사 1년 지나면 연차가 며칠이야?')).toEqual(['입사', '지나', '연차', '며칠']);
  });

  it('does not shorten a two-letter word into one letter', () => {
    expect(stripParticle('회의')).toBe('회의');
    expect(stripParticle('휴가')).toBe('휴가');
    expect(stripParticle('휴가는')).toBe('휴가');
  });

  it('falls back to all tokens when only request phrasing remains', () => {
    expect(queryTokens('알려줘')).toEqual(['알려', '려줘']);
  });
});

describe('rank', () => {
  it('finds the matching document even with particles and different wording', () => {
    const hits = rank('입사하고 1년 지나면 휴가가 며칠이야?', docs);
    expect(hits[0]?.id).toBe('leave');
  });

  it('separates the right document clearly from one that only shares endings', () => {
    const hits = rank('입사 1년 지나면 연차가 며칠이야?', docs, { minScore: 0 });
    const leave = hits.find((hit) => hit.id === 'leave')!.score;
    const refund = hits.find((hit) => hit.id === 'refund')?.score ?? 0;
    expect(leave).toBeGreaterThanOrEqual(0.4);
    expect(leave - refund).toBeGreaterThanOrEqual(0.25);
  });

  it('weights title matches above body matches', () => {
    const hits = rank('pgvector', docs);
    expect(hits.map((hit) => hit.id)).toEqual(['vector']);
    expect(hits[0].score).toBe(1);
  });

  it('returns nothing for an empty or unrelated query', () => {
    expect(rank('', docs)).toEqual([]);
    expect(rank('우주선 연료', docs)).toEqual([]);
  });

  it('respects the limit', () => {
    expect(rank('기준 절차 선택', docs, { limit: 1, minScore: 0 })).toHaveLength(1);
  });
});

describe('snippet', () => {
  it('picks the sentence with the most query terms', () => {
    expect(snippet(['15', '부여'], docs[0].body)).toBe('입사 1년이 지나면 15일이 부여된다.');
  });

  it('skips headings and table headers that have no context', () => {
    expect(snippet(['연차'], '## 연차\n\n| 근속 | 연차 |\n|---|---|\n| 1년 이상 | 15일 |\n\n연차는 근태 메뉴에서 신청한다.')).toBe('연차는 근태 메뉴에서 신청한다.');
  });

  it('strips markdown before choosing', () => {
    expect(plainText('## 제목\n- **굵게** [링크](https://example.com)')).toBe('제목\n 굵게 링크');
  });
});
