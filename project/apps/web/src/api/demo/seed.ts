import type { Conversation, IngestJob, KnowledgeCandidate, KnowledgeDetail, KnowledgeVersion, Space } from '@doi-kb/shared';

/** 데모 저장소 한 벌. 서버가 붙으면 PostgreSQL 테이블이 이 자리를 맡는다. */
export interface DemoDb {
  version: 1;
  spaces: Space[];
  knowledge: KnowledgeDetail[];
  candidates: KnowledgeCandidate[];
  ingestJobs: IngestJob[];
  conversations: Conversation[];
}

type Seed = Omit<KnowledgeDetail, 'versions' | 'sourceCount' | 'createdAt' | 'updatedAt'> & {
  created: number;
  updated: number;
  history?: { daysAgo: number; author: KnowledgeVersion['author']; note: string }[];
};

/** 처음 실행했을 때 보이는 예시 데이터. 날짜는 지금을 기준으로 정한다. */
export function createSeed(now = Date.now()): DemoDb {
  const ago = (days: number, hours = 0) => new Date(now - (days * 24 + hours) * 3_600_000).toISOString();
  const day = (offsetDays: number) => new Date(now + offsetDays * 86_400_000).toISOString().slice(0, 10);

  const seeds: Seed[] = [
    {
      id: 'k-leave',
      spaceId: 'team',
      title: '연차휴가 부여 기준',
      summary: '입사 1년 미만은 한 달 개근마다 1일(최대 11일), 1년 이상 출근율 80% 이상이면 15일. 3년차부터 2년마다 1일씩 늘어 최대 25일까지 받는다.',
      body: `## 기준

| 근속 | 연차 |
|---|---|
| 1년 미만 | 한 달 개근마다 1일 (최대 11일) |
| 1년 이상 (출근율 80% 이상) | 15일 |
| 3년 이상 | 2년마다 1일 가산, 최대 25일 |

## 사용

- 연차는 그룹웨어 근태 메뉴에서 신청한다. 팀장 승인 후 확정된다.
- 반차(0.5일)도 같은 메뉴에서 신청한다.
- 쓰지 못한 연차는 회계연도 말에 사용 촉진 안내를 받는다.

> 근로기준법 제60조를 따른 회사 기준이다. 개별 계약이 다르면 계약을 따른다.`,
      type: 'fact',
      status: 'verified',
      tags: ['인사', '휴가', '규정'],
      author: 'user',
      sources: [
        { id: 's-leave-1', kind: 'manual', title: '취업규칙 제4장 휴가', excerpt: '연차휴가는 근로기준법이 정한 바에 따른다.', addedAt: ago(40) },
        { id: 's-leave-2', kind: 'web', title: '근로기준법 제60조 (연차 유급휴가)', url: 'https://www.law.go.kr/법령/근로기준법', addedAt: ago(40) },
      ],
      citedCount: 12,
      lastCitedAt: ago(0, 3),
      reviewAt: day(120),
      searchable: true,
      created: 40,
      updated: 6,
      history: [
        { daysAgo: 40, author: 'user', note: '취업규칙에서 옮겨 적음' },
        { daysAgo: 6, author: 'agent', note: '반차 신청 방법 추가 (대화에서 확인)' },
      ],
    },
    {
      id: 'k-refund',
      spaceId: 'team',
      title: '고객 환불 처리 절차',
      summary: '결제 후 7일 이내 요청은 전액 환불, 7일이 지나면 사용 기간만큼 뺀 금액을 환불한다. 원래 결제 수단으로 3영업일 안에 처리한다.',
      body: `## 처리 순서

1. 고객지원 도구에서 주문 번호와 결제일을 확인한다.
2. 결제 후 **7일 이내**면 전액 환불, 지났으면 사용 기간만큼 뺀다.
3. 원래 결제 수단으로 환불을 요청한다(카드 취소 또는 계좌 입금).
4. 고객에게 처리 결과와 예상 입금일(3영업일 이내)을 안내한다.

## 예외

- 무료 체험에서 전환된 결제는 첫 결제일 기준으로 계산한다.
- 분쟁·차지백이 걸린 건은 재무팀에 넘긴다.`,
      type: 'procedure',
      status: 'verified',
      tags: ['고객지원', '결제', '환불'],
      author: 'user',
      sources: [{ id: 's-refund-1', kind: 'manual', title: '고객지원 운영 가이드 v3', addedAt: ago(25) }],
      citedCount: 7,
      lastCitedAt: ago(2),
      reviewAt: day(60),
      searchable: true,
      created: 25,
      updated: 12,
      history: [
        { daysAgo: 25, author: 'user', note: '운영 가이드에서 정리' },
        { daysAgo: 12, author: 'user', note: '차지백 예외 추가' },
      ],
    },
    {
      id: 'k-vectordb',
      spaceId: 'team',
      title: '벡터 DB 선택: PostgreSQL + pgvector',
      summary: '지식베이스 저장소는 PostgreSQL + pgvector로 정했다. 로컬은 설치 없이 PGlite로 시작하고, 팀 서버로 옮길 때 같은 스키마를 PostgreSQL에 쓴다.',
      body: `## 결정

- 저장소: **PostgreSQL + pgvector**
- 로컬 개발·개인 사용: **PGlite**(WASM으로 도는 PostgreSQL, pgvector 지원) — \`npm install\`만으로 실행
- 팀 서버: 같은 스키마를 PostgreSQL에 그대로 옮긴다

## 이유

1. 지식·대화·출처 같은 일반 데이터와 벡터를 한 DB에서 다룬다(조인·트랜잭션).
2. 별도 벡터 DB 서비스를 운영하지 않아도 된다.
3. 한국어 검색은 키워드와 벡터를 섞어야 하므로, 두 검색을 한 쿼리에서 합칠 수 있는 쪽이 낫다.

## 다시 볼 조건

- 지식이 수백만 건을 넘거나 검색 지연이 문제가 되면 Qdrant·Milvus를 검토한다.`,
      type: 'decision',
      status: 'verified',
      tags: ['기술', '아키텍처', '지식베이스'],
      author: 'agent',
      sources: [
        { id: 's-vec-1', kind: 'file', title: '_doc/00.자료조사/벡터디비.md', addedAt: ago(1) },
        { id: 's-vec-2', kind: 'conversation', title: '지식 시스템 설계 논의', addedAt: ago(1) },
      ],
      citedCount: 3,
      lastCitedAt: ago(0, 1),
      searchable: true,
      created: 1,
      updated: 1,
      history: [{ daysAgo: 1, author: 'agent', note: '설계 논의에서 정한 내용을 후보로 만들고 확인 후 저장' }],
    },
    {
      id: 'k-embedding',
      spaceId: 'team',
      title: '임베딩 모델 후보 비교',
      summary: '한국어 품질과 비용을 기준으로 로컬 다국어 모델과 외부 API를 비교 중이다. 어느 쪽이든 바꿔 끼울 수 있는 인터페이스로 둔다.',
      body: `## 비교

| 방식 | 장점 | 단점 |
|---|---|---|
| 로컬 다국어 모델 (bge-m3 등) | 무료, 자료가 밖으로 나가지 않음 | 첫 실행 때 모델 내려받기, CPU 부담 |
| 외부 API (Voyage, OpenAI 등) | 설정이 간단, 품질 안정 | 키·비용 필요 |

## 메모

- Claude에는 임베딩 API가 없다. 대화는 Claude, 임베딩은 따로 고른다.
- 모델을 바꾸면 기존 벡터를 다시 계산해야 한다 → 지식마다 임베딩 모델 이름을 함께 저장한다.`,
      type: 'reference',
      status: 'draft',
      tags: ['기술', '임베딩', '지식베이스'],
      author: 'agent',
      sources: [{ id: 's-emb-1', kind: 'conversation', title: '지식 시스템 설계 논의', addedAt: ago(1) }],
      citedCount: 0,
      searchable: true,
      created: 1,
      updated: 1,
    },
    {
      id: 'k-meeting',
      spaceId: 'team',
      title: '주간 회의 운영 방식',
      summary: '매주 월요일 10시 30분에 한다. 안건은 금요일 18시까지 공유 문서에 올리고, 결정 사항은 회의 당일 지식베이스에 남긴다.',
      body: `## 일정

- 매주 **월요일 10:30**, 30분
- 안건은 **금요일 18:00**까지 공유 문서에 올린다.

## 진행

1. 지난주 결정 사항 확인 (지식베이스의 "결정" 지식)
2. 이번 주 안건 논의
3. 결정·담당자·기한 정리

## 기록

- 결정 사항은 회의 당일 지식베이스에 **결정** 유형으로 남긴다.
- 회의록 원문은 출처로 붙인다.`,
      type: 'procedure',
      status: 'verified',
      tags: ['회의', '팀운영'],
      author: 'user',
      sources: [],
      citedCount: 5,
      lastCitedAt: ago(4),
      searchable: true,
      created: 30,
      updated: 9,
      history: [
        { daysAgo: 30, author: 'user', note: '처음 작성' },
        { daysAgo: 9, author: 'user', note: '결정 사항 기록 규칙 추가' },
      ],
    },
    {
      id: 'k-design',
      spaceId: 'team',
      title: '화면 디자인 규칙: DOI 디자인 시스템',
      summary: '화면은 @bricks/core 컴포넌트와 테마 토큰을 쓰고, 작업 화면은 DOI-L-THREE-COLUMN 레이아웃을 따른다. 색상은 하드코딩하지 않는다.',
      body: `## 레이아웃 (DOI-L-THREE-COLUMN)

| 영역 | 너비 | 내용 |
|---|---|---|
| 메뉴 | 240px | 브랜드, 주요 동작, 목록 |
| 콘텐츠 | 나머지 | 헤더 · 본문 · 푸터 |
| 채팅 | 280~320px (조절) | 도킹·띄우기·최소화 |
| 옵션 | 300px | 선택한 항목의 설정 |

## 규칙

- 컴포넌트·색·글꼴·아이콘은 \`@bricks/core\`와 테마 토큰을 쓴다.
- 테마는 \`bricks-light\` / \`bricks-dark\`.
- 반응형: 960px 이상 3단, 미만이면 채팅·옵션이 아래로, 640px 미만은 1단.
- 사용자 문구는 한국어, 버튼에는 aria 레이블을 단다.`,
      type: 'reference',
      status: 'verified',
      tags: ['디자인', '프론트엔드'],
      author: 'user',
      sources: [
        { id: 's-design-1', kind: 'web', title: 'jake-doi/design_system', url: 'https://github.com/jake-doi/design_system', addedAt: ago(14) },
        { id: 's-design-2', kind: 'web', title: 'jake-doi/cad (같은 레이아웃을 쓴 예)', url: 'https://github.com/jake-doi/cad', addedAt: ago(14) },
      ],
      citedCount: 2,
      lastCitedAt: ago(1),
      searchable: true,
      created: 14,
      updated: 14,
    },
    {
      id: 'k-travel',
      spaceId: 'team',
      title: '출장비 정산 기준',
      summary: '국내 출장 일비 2만 원, 숙박비 실비(1박 최대 10만 원). 영수증은 출장 후 7일 안에 경비 시스템에 올린다.',
      body: `## 국내 출장

- 일비: **20,000원**
- 숙박비: 실비, 1박 최대 **100,000원**
- 교통비: 대중교통 실비, 자가용은 km당 기준 금액

## 정산

1. 출장 후 **7일 안에** 경비 시스템에 영수증을 올린다.
2. 팀장 승인 → 재무팀 확인 → 다음 급여일에 지급.

> 2025년 규정 기준. 2026년 개정 여부를 확인해야 한다.`,
      type: 'fact',
      status: 'stale',
      tags: ['재무', '출장', '규정'],
      author: 'user',
      sources: [{ id: 's-travel-1', kind: 'file', title: '경비 규정 2025.pdf', addedAt: ago(200) }],
      citedCount: 4,
      lastCitedAt: ago(15),
      reviewAt: day(-20),
      searchable: true,
      created: 200,
      updated: 200,
    },
    {
      id: 'k-onboarding',
      spaceId: 'team',
      title: '신규 입사자 온보딩 체크리스트',
      summary: '첫 주에 계정 발급, 장비 수령, 보안 교육, 팀 소개, 첫 과제 배정을 마친다.',
      body: `## 첫날

- [ ] 그룹웨어·메일 계정 발급
- [ ] 노트북·출입증 수령
- [ ] 보안 서약서 작성

## 첫 주

- [ ] 보안 교육 이수
- [ ] 팀 소개와 1:1 면담
- [ ] 지식베이스 둘러보기 (회의 방식, 디자인 규칙)
- [ ] 첫 과제 배정`,
      type: 'procedure',
      status: 'draft',
      tags: ['인사', '온보딩'],
      author: 'user',
      sources: [],
      citedCount: 1,
      lastCitedAt: ago(8),
      searchable: true,
      created: 8,
      updated: 3,
    },
    {
      id: 'k-rag',
      spaceId: 'personal',
      title: 'RAG와 벡터 DB 개념 정리',
      summary: 'LLM은 두뇌, 임베딩은 내용을 숫자로 바꾸는 방법, 벡터 DB는 의미가 비슷한 자료를 찾는 기억장치, RAG는 찾은 자료를 두뇌에 넘기는 구조다.',
      body: `## 한 줄 비유

| 구성 | 역할 |
|---|---|
| LLM | 생각하고 글을 만드는 두뇌 |
| 임베딩 | 내용을 숫자 배열로 표현하는 방법 |
| 벡터 DB | 의미가 비슷한 자료를 찾아 주는 기억장치 |
| RAG | 기억장치에서 찾은 자료를 두뇌에 넘기는 구조 |
| 에이전트 | 여러 도구를 써서 실제 일을 하는 시스템 |

## 벡터 DB에 저장하는 것

벡터만이 아니라 **벡터 + 원문 + 메타데이터(분류·부서·날짜)** 를 함께 저장한다. 그래서 "2026년에 만든 고객 관련 문서만"처럼 의미 검색과 조건 검색을 섞을 수 있다.

## 중요한 점

벡터 DB 자체보다 **현장에서 생기는 데이터를 어떻게 모으고 구조화해서 에이전트가 다시 쓰게 할지**가 더 중요하다.`,
      type: 'reference',
      status: 'verified',
      tags: ['AI', 'RAG', '공부'],
      author: 'agent',
      sources: [{ id: 's-rag-1', kind: 'file', title: '_doc/00.자료조사/벡터디비.md', addedAt: ago(2) }],
      citedCount: 2,
      lastCitedAt: ago(0, 5),
      searchable: true,
      created: 2,
      updated: 2,
      history: [{ daysAgo: 2, author: 'agent', note: '자료 "벡터디비.md"에서 뽑은 후보를 확인 후 저장' }],
    },
    {
      id: 'k-hybrid',
      spaceId: 'personal',
      title: '한국어 검색은 키워드 + 벡터 혼합',
      summary: '벡터 검색만으로는 고유명사·숫자·코드명을 놓친다. 키워드 점수와 벡터 점수를 섞어 순위를 매긴다.',
      body: `- 벡터 검색은 "휴가 며칠?"과 "연차 부여 기준"처럼 표현이 달라도 찾는다.
- 대신 \`pgvector\`, \`M3\`, 사번처럼 정확히 맞아야 하는 말은 놓치기 쉽다.
- 한국어는 조사가 붙어 키워드도 그대로 맞지 않는다 → 두 글자 조각(bigram)이나 형태소 분석을 쓴다.
- 두 점수를 합치는 방법: 가중 합 또는 순위 융합(RRF).`,
      type: 'note',
      status: 'draft',
      tags: ['검색', '한국어'],
      author: 'user',
      sources: [],
      citedCount: 0,
      searchable: true,
      created: 1,
      updated: 1,
    },
    {
      id: 'k-git',
      spaceId: 'personal',
      title: '자주 쓰는 Git 명령',
      summary: 'submodule 받기, 브랜치 만들기, 기록 보기처럼 자주 쓰는 명령 모음.',
      body: `\`\`\`sh
git submodule update --init --depth 1   # 디자인 시스템 받기
git switch -c feature/ui                # 브랜치 만들기
git log --oneline -20                   # 최근 기록
git stash push -m "작업 중"             # 잠깐 치워 두기
\`\`\``,
      type: 'reference',
      status: 'verified',
      tags: ['개발', 'git'],
      author: 'user',
      sources: [],
      citedCount: 1,
      lastCitedAt: ago(5),
      searchable: true,
      created: 20,
      updated: 20,
    },
  ];

  const knowledge: KnowledgeDetail[] = seeds.map(({ created, updated, history, ...item }) => {
    const steps = history ?? [{ daysAgo: created, author: item.author, note: '처음 작성' }];
    const versions = steps.map((step, index) => ({
      id: index + 1,
      createdAt: ago(step.daysAgo),
      author: step.author,
      note: step.note,
      title: item.title,
      summary: item.summary,
      // 이전 버전은 본문 일부가 없던 상태로 보여 기록 탭의 되돌리기를 시험할 수 있게 한다.
      body: index === steps.length - 1 ? item.body : item.body.split('\n\n').slice(0, -1).join('\n\n'),
    }));
    return { ...item, sourceCount: item.sources.length, createdAt: ago(created), updatedAt: ago(updated), versions };
  });

  const candidates: KnowledgeCandidate[] = [
    {
      id: 'cand-room',
      spaceId: 'team',
      title: '회의실 예약 규칙',
      summary: '회의실은 그룹웨어에서 하루 전까지 예약한다. 2시간을 넘기면 팀장 승인이 필요하다.',
      body: `- 회의실은 그룹웨어 **자원 예약** 메뉴에서 하루 전까지 예약한다.
- 2시간을 넘는 예약은 팀장 승인이 필요하다.

> 대화 "회의실 예약 문의"에서 사용자가 알려 준 내용`,
      type: 'fact',
      tags: ['총무', '회의'],
      sources: [{ kind: 'conversation', title: '회의실 예약 문의', conversationId: 'c-room' }],
      origin: { kind: 'conversation', label: '회의실 예약 문의', conversationId: 'c-room' },
      createdAt: ago(0, 2),
      status: 'pending',
      similar: { id: 'k-meeting', title: '주간 회의 운영 방식', score: 0.31 },
    },
    {
      id: 'cand-travel',
      spaceId: 'team',
      title: '출장비 정산 기준 (2026년 개정)',
      summary: '2026년부터 국내 출장 일비는 25,000원, 숙박비는 1박 최대 120,000원이다. 정산 기한(7일)은 같다.',
      body: `## 2026년 개정 내용

- 일비: 20,000원 → **25,000원**
- 숙박비 상한: 100,000원 → **120,000원**
- 정산 기한: 출장 후 7일 (변경 없음)`,
      type: 'fact',
      tags: ['재무', '출장', '규정'],
      sources: [{ kind: 'file', title: '2026 경비 규정 개정안.pdf', excerpt: '국내 출장 일비를 25,000원으로 조정한다.' }],
      origin: { kind: 'ingest', label: '2026 경비 규정 개정안.pdf', ingestJobId: 'job-travel' },
      createdAt: ago(0, 5),
      status: 'pending',
      similar: { id: 'k-travel', title: '출장비 정산 기준', score: 0.78 },
    },
    {
      id: 'cand-pglite',
      spaceId: 'personal',
      title: 'PGlite에서 pgvector 쓰기',
      summary: 'PGlite(WASM으로 도는 PostgreSQL)는 vector 확장을 불러 pgvector 쿼리를 쓸 수 있다. 서버 설치 없이 로컬에서 벡터 검색을 시험할 수 있다.',
      body: `- PGlite는 브라우저·Node에서 도는 PostgreSQL(WASM)이다.
- \`vector\` 확장을 불러 \`CREATE EXTENSION vector\` 후 pgvector 쿼리를 쓴다.
- 데이터는 파일(Node) 또는 IndexedDB(브라우저)에 저장된다.`,
      type: 'reference',
      tags: ['기술', 'PGlite', 'pgvector'],
      sources: [{ kind: 'web', title: 'PGlite — Extensions', url: 'https://pglite.dev/extensions/' }],
      origin: { kind: 'ingest', label: 'pglite.dev/extensions', ingestJobId: 'job-pglite' },
      createdAt: ago(0, 20),
      status: 'pending',
    },
    {
      id: 'cand-rag',
      spaceId: 'personal',
      title: 'RAG와 벡터 DB 개념 정리',
      summary: '벡터디비.md에서 뽑은 개념 정리.',
      body: '',
      type: 'reference',
      tags: ['AI'],
      sources: [{ kind: 'file', title: '_doc/00.자료조사/벡터디비.md' }],
      origin: { kind: 'ingest', label: '벡터디비.md', ingestJobId: 'job-rag' },
      createdAt: ago(2),
      status: 'accepted',
      knowledgeId: 'k-rag',
    },
  ];

  const ingestJobs: IngestJob[] = [
    { id: 'job-travel', spaceId: 'team', kind: 'file', name: '2026 경비 규정 개정안.pdf', stage: 'done', createdAt: ago(0, 5), updatedAt: ago(0, 5), chunkCount: 14, candidateCount: 1 },
    { id: 'job-pglite', spaceId: 'personal', kind: 'url', name: 'pglite.dev/extensions', stage: 'done', createdAt: ago(0, 20), updatedAt: ago(0, 20), chunkCount: 6, candidateCount: 1 },
    { id: 'job-rag', spaceId: 'personal', kind: 'file', name: '벡터디비.md', stage: 'done', createdAt: ago(2), updatedAt: ago(2), chunkCount: 9, candidateCount: 1 },
  ];

  const conversations: Conversation[] = [
    {
      id: 'c-leave',
      spaceId: 'team',
      title: '연차 규정 문의',
      createdAt: ago(0, 3),
      updatedAt: ago(0, 3),
      messageCount: 2,
      entries: [
        { role: 'user', createdAt: ago(0, 3), blocks: [{ type: 'text', text: '입사 1년 지나면 연차가 며칠 생겨?' }] },
        {
          role: 'assistant',
          createdAt: ago(0, 3),
          blocks: [
            {
              type: 'tool',
              toolUseId: 'tu-leave-1',
              name: 'knowledge_search',
              input: { query: '입사 1년 연차 며칠', limit: 5 },
              result: {
                isError: false,
                text: '관련 지식 1개를 찾았습니다.',
                hits: [
                  {
                    id: 'k-leave',
                    title: '연차휴가 부여 기준',
                    summary: '',
                    type: 'fact',
                    score: 0.86,
                    snippet: '1년 이상 (출근율 80% 이상) 15일',
                  },
                ],
              },
            },
            {
              type: 'text',
              text: '입사 1년이 지나고 그해 출근율이 80% 이상이면 **15일**이 생깁니다 [1]. 3년차부터는 2년마다 1일씩 늘어 최대 25일까지 받을 수 있어요.\n\n신청은 그룹웨어 근태 메뉴에서 하고, 팀장 승인 후 확정됩니다.',
              citations: [{ id: 'k-leave', title: '연차휴가 부여 기준' }],
            },
          ],
        },
      ],
    },
    {
      id: 'c-room',
      spaceId: 'team',
      title: '회의실 예약 문의',
      createdAt: ago(0, 2),
      updatedAt: ago(0, 2),
      messageCount: 2,
      entries: [
        {
          role: 'user',
          createdAt: ago(0, 2),
          blocks: [{ type: 'text', text: '회의실은 그룹웨어에서 하루 전까지 예약해야 하고, 2시간 넘으면 팀장 승인 받아야 한대. 기억해줘.' }],
        },
        {
          role: 'assistant',
          createdAt: ago(0, 2),
          blocks: [
            {
              type: 'text',
              text: '알겠습니다. 지식베이스에 회의실 예약 규칙이 아직 없어서 지식 후보로 만들어 두었습니다. **검토 대기**에서 확인하면 팀 지식으로 저장됩니다.',
            },
            { type: 'candidate', candidateId: 'cand-room', title: '회의실 예약 규칙', summary: '회의실은 그룹웨어에서 하루 전까지 예약한다. 2시간을 넘기면 팀장 승인이 필요하다.', knowledgeType: 'fact' },
          ],
        },
      ],
    },
    {
      id: 'c-rag',
      spaceId: 'personal',
      title: 'RAG 개념',
      createdAt: ago(0, 5),
      updatedAt: ago(0, 5),
      messageCount: 2,
      entries: [
        { role: 'user', createdAt: ago(0, 5), blocks: [{ type: 'text', text: 'RAG가 뭔지 한 줄로 설명해줘' }] },
        {
          role: 'assistant',
          createdAt: ago(0, 5),
          blocks: [
            {
              type: 'text',
              text: 'RAG는 질문과 의미가 비슷한 자료를 벡터 DB에서 찾아 LLM에게 함께 넘겨, 그 자료를 근거로 답하게 하는 구조입니다 [1].',
              citations: [{ id: 'k-rag', title: 'RAG와 벡터 DB 개념 정리' }],
            },
          ],
        },
      ],
    },
  ];

  return {
    version: 1,
    spaces: [
      { id: 'personal', name: '내 공간', kind: 'personal', description: '나만 보는 메모·공부 자료' },
      { id: 'team', name: 'DOI 팀', kind: 'team', description: '팀이 함께 쓰는 규정·절차·결정' },
    ],
    knowledge,
    candidates,
    ingestJobs,
    conversations,
  };
}
