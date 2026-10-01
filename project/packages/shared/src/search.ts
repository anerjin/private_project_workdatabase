/**
 * 키워드 검색(가벼운 대체 구현). 서버의 혼합 검색(pgvector + 키워드)이 붙기 전까지
 * 화면 데모와 중복 후보 찾기에 쓴다. 점수는 0~1.
 *
 * 한국어는 조사·어미가 붙어 단어가 그대로 맞지 않으므로 한글은 두 글자 조각(bigram)으로,
 * 영문·숫자는 단어 단위로 나눈다. 예: "연차휴가를" → 연차·차휴·휴가·가를
 */
const HANGUL_RUN = /[가-힣]+|[^가-힣]+/g;

/** 질문에 흔히 붙는 요청 표현 조각. 검색어에서만 뺀다. */
const QUERY_STOP = new Set([
  '알려', '려줘', '려주', '주세', '세요', '해줘', '해주', '찾아', '아줘', '어줘', '는지', '인가', '인지',
  '무엇', '뭐야', '어떻', '떻게', '합니', '니다', '습니', '있는', '하는', '에서', '으로', '대해', '해서',
  '정리', '리해', '기억', '억해', '저장', '장해', '우리', '회사', '관련', '내용',
]);

/** 낱말 끝의 조사·어미(긴 것부터). 검색어에서 "연차가"·"며칠이야"가 "연차"·"며칠"로 맞도록 뗀다. */
const PARTICLES = [
  '에서는', '으로는', '이에요', '인가요', '에서', '으로', '에게', '까지', '부터', '이야', '예요', '인가', '나요', '하고', '하면', '해서', '이나', '이랑',
  '은', '는', '이', '가', '을', '를', '에', '의', '로', '와', '과', '도', '만', '야', '면', '요', '랑',
];

/** 조사를 뗀 줄기. 두 글자 미만으로 줄어들면 그대로 둔다(예: "회의"는 "회"가 되지 않는다). */
export function stripParticle(word: string): string {
  for (const particle of PARTICLES) {
    if (word.endsWith(particle) && word.length - particle.length >= 2) return word.slice(0, -particle.length);
  }
  return word;
}

/**
 * 문서용(document)은 낱말 전체의 두 글자 조각을 모두 남긴다 — 조사를 뗀 줄기의 조각도 여기에 들어 있다.
 * 검색어용(query)은 조사를 뗀 줄기만 조각내, "연차가"의 "차가"처럼 조사가 만든 조각이 점수를 흐리지 않게 한다.
 */
export function tokenize(text: string, mode: 'document' | 'query' = 'document'): string[] {
  const tokens: string[] = [];
  for (const word of text.toLowerCase().normalize('NFC').split(/[^\p{L}\p{N}]+/u)) {
    if (!word) continue;
    for (const piece of word.match(HANGUL_RUN) ?? []) {
      if (/[가-힣]/.test(piece)) {
        const run = mode === 'query' ? stripParticle(piece) : piece;
        // 한 글자 조각은 대부분 조사(은·는·이·가)라 낱말 전체가 한 글자일 때만 남긴다.
        if (run.length === 1) {
          if (word.length === 1) tokens.push(run);
          continue;
        }
        for (let index = 0; index < run.length - 1; index++) tokens.push(run.slice(index, index + 2));
      } else if (keepPiece(piece, mode)) {
        tokens.push(piece);
      }
    }
  }
  return tokens;
}

/** 영문·숫자 조각: 한 글자 영문은 버린다. 검색어에서는 "1년"의 "1"처럼 한 자리 숫자도 버린다(거의 모든 문서에 있다). */
function keepPiece(piece: string, mode: 'document' | 'query'): boolean {
  if (piece.length > 1) return true;
  return /\d/.test(piece) && mode === 'document';
}

/** 검색어 토큰: 중복과 요청 표현을 뺀다. 다 빠지면 원래 토큰을 쓴다. */
export function queryTokens(query: string): string[] {
  const all = [...new Set(tokenize(query, 'query'))];
  const meaningful = all.filter((token) => !QUERY_STOP.has(token));
  return meaningful.length ? meaningful : all;
}

export interface RankDocument {
  id: string;
  title: string;
  summary?: string;
  body: string;
  tags?: string[];
}

export interface RankedHit {
  id: string;
  score: number;
  snippet: string;
}

export interface RankOptions {
  limit?: number;
  minScore?: number;
}

/** 제목 > 태그 > 본문 순으로 가중치를 두고, 검색어 토큰 중 몇 개가 맞았는지로 점수를 낸다. */
export function rank(query: string, docs: RankDocument[], { limit = 5, minScore = 0.2 }: RankOptions = {}): RankedHit[] {
  const terms = queryTokens(query);
  if (!terms.length) return [];
  return docs
    .map((doc) => {
      const title = new Set(tokenize(doc.title));
      const tags = new Set((doc.tags ?? []).flatMap((tag) => tokenize(tag)));
      const body = new Set(tokenize(`${doc.summary ?? ''} ${doc.body}`));
      let matched = 0;
      for (const term of terms) matched += title.has(term) ? 1 : tags.has(term) ? 0.9 : body.has(term) ? 0.7 : 0;
      return { id: doc.id, score: round(matched / terms.length), snippet: snippet(terms, doc.body || doc.summary || '') };
    })
    .filter((hit) => hit.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** 검색어가 가장 많이 들어간 문장(최대 140자). 마크다운 기호는 걷어낸다. */
export function snippet(terms: string[], text: string, max = 140): string {
  const lines = plainText(text)
    .split(/(?<=[.!?。])\s+|\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  // 제목·표 머리글처럼 짧은 줄은 문맥이 없어 고르지 않는다(그것밖에 없을 때만 쓴다).
  const sentences = lines.some((line) => line.length >= 12) ? lines.filter((line) => line.length >= 12) : lines;
  if (!sentences.length) return '';
  let best = sentences[0];
  let bestScore = -1;
  for (const sentence of sentences) {
    const tokens = new Set(tokenize(sentence));
    const score = terms.reduce((sum, term) => sum + (tokens.has(term) ? 1 : 0), 0);
    if (score > bestScore) {
      best = sentence;
      bestScore = score;
    }
  }
  return best.length > max ? `${best.slice(0, max - 1)}…` : best;
}

export function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/^\s*\|?[\s:-]+\|[\s|:-]*$/gm, '')
    .replace(/[*_~|]/g, ' ')
    .replace(/[ \t]+/g, ' ');
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
