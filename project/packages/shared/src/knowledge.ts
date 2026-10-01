/** 지식이 쌓이는 범위. 개인 공간은 나만, 팀 공간은 팀 전체가 본다. */
export type SpaceKind = 'personal' | 'team';

export interface Space {
  id: string;
  name: string;
  kind: SpaceKind;
  description: string;
}

/**
 * 지식의 성격. AI가 후보를 만들 때와 검색 결과를 보여줄 때 쓴다.
 * - fact: 규정·수치·정의처럼 확인할 수 있는 내용
 * - procedure: 일하는 순서·방법
 * - decision: 회의·논의에서 정한 것과 그 이유
 * - reference: 외부 문서·웹 자료 요약
 * - note: 아직 정리되지 않은 메모
 */
export type KnowledgeType = 'fact' | 'procedure' | 'decision' | 'reference' | 'note';

export const KNOWLEDGE_TYPES: { value: KnowledgeType; label: string; hint: string }[] = [
  { value: 'fact', label: '사실', hint: '규정·수치·정의처럼 확인할 수 있는 내용' },
  { value: 'procedure', label: '절차', hint: '일하는 순서·방법' },
  { value: 'decision', label: '결정', hint: '회의·논의에서 정한 것과 그 이유' },
  { value: 'reference', label: '참고 자료', hint: '외부 문서·웹 자료 요약' },
  { value: 'note', label: '메모', hint: '아직 정리되지 않은 생각' },
];

export function knowledgeTypeLabel(type: KnowledgeType): string {
  return KNOWLEDGE_TYPES.find((item) => item.value === type)?.label ?? type;
}

/** draft: 아직 확인 전 / verified: 사람이 확인함 / stale: 오래되어 다시 확인해야 함 */
export type KnowledgeStatus = 'draft' | 'verified' | 'stale';

export const KNOWLEDGE_STATUSES: { value: KnowledgeStatus; label: string }[] = [
  { value: 'draft', label: '초안' },
  { value: 'verified', label: '확인됨' },
  { value: 'stale', label: '검토 필요' },
];

export function knowledgeStatusLabel(status: KnowledgeStatus): string {
  return KNOWLEDGE_STATUSES.find((item) => item.value === status)?.label ?? status;
}

/** 지식을 만들거나 고친 주체. */
export type Author = 'user' | 'agent' | 'mcp';

export const AUTHOR_LABEL: Record<Author, string> = { user: '사용자', agent: 'AI', mcp: 'MCP' };

/** 근거 자료의 종류. */
export type SourceKind = 'web' | 'file' | 'conversation' | 'manual';

export interface KnowledgeSource {
  id: string;
  kind: SourceKind;
  title: string;
  /** 웹 주소(web) */
  url?: string;
  /** 출처가 된 대화(conversation) */
  conversationId?: string;
  /** 근거가 된 원문 일부 */
  excerpt?: string;
  addedAt: string;
}

export interface KnowledgeVersion {
  id: number;
  createdAt: string;
  author: Author;
  /** 무엇을 바꿨는지 한 줄 */
  note: string;
  title: string;
  summary: string;
  body: string;
}

export interface KnowledgeSummary {
  id: string;
  spaceId: string;
  title: string;
  /** 검색 결과·목록에 보일 한두 문장 */
  summary: string;
  type: KnowledgeType;
  status: KnowledgeStatus;
  tags: string[];
  author: Author;
  createdAt: string;
  updatedAt: string;
  sourceCount: number;
  /** AI 답변의 근거로 쓰인 횟수 */
  citedCount: number;
}

export interface KnowledgeDetail extends KnowledgeSummary {
  /** 본문(마크다운) */
  body: string;
  sources: KnowledgeSource[];
  versions: KnowledgeVersion[];
  lastCitedAt?: string;
  /** 다시 확인할 날짜(YYYY-MM-DD). 지나면 검토 필요로 본다. */
  reviewAt?: string;
  /** AI 검색에 포함할지. 끄면 목록에는 남지만 답변 근거로 쓰이지 않는다. */
  searchable: boolean;
}

/** 직접 만들거나 후보를 저장할 때 넘기는 내용. */
export interface KnowledgeInput {
  title: string;
  summary: string;
  body: string;
  type: KnowledgeType;
  status?: KnowledgeStatus;
  tags?: string[];
  sources?: Omit<KnowledgeSource, 'id' | 'addedAt'>[];
}

export type KnowledgePatch = Partial<Pick<KnowledgeDetail, 'title' | 'summary' | 'body' | 'type' | 'status' | 'tags' | 'reviewAt' | 'searchable'>>;

/** 화면이 들고 다니는 지식 참조(인용·첨부). */
export interface KnowledgeRef {
  id: string;
  title: string;
}

/** 지식 후보가 나온 곳. */
export interface CandidateOrigin {
  kind: 'conversation' | 'ingest';
  /** 대화 제목 또는 자료 이름 */
  label: string;
  conversationId?: string;
  ingestJobId?: string;
}

export type CandidateStatus = 'pending' | 'accepted' | 'merged' | 'rejected';

/** AI가 대화·자료에서 뽑은 지식 후보. 사람이 확인해야 지식이 된다. */
export interface KnowledgeCandidate {
  id: string;
  spaceId: string;
  title: string;
  summary: string;
  body: string;
  type: KnowledgeType;
  tags: string[];
  sources: Omit<KnowledgeSource, 'id' | 'addedAt'>[];
  origin: CandidateOrigin;
  createdAt: string;
  status: CandidateStatus;
  /** 저장·합치기 후 연결된 지식 */
  knowledgeId?: string;
  /** 이미 있는 비슷한 지식(중복·충돌 확인용) */
  similar?: KnowledgeRef & { score: number };
}

/** 자료 수집 단계: 읽기 → 조각내기 → 임베딩 → 후보 추출 */
export type IngestStage = 'reading' | 'chunking' | 'embedding' | 'extracting' | 'done' | 'error';

export const INGEST_STAGES: { value: Exclude<IngestStage, 'done' | 'error'>; label: string }[] = [
  { value: 'reading', label: '읽기' },
  { value: 'chunking', label: '조각내기' },
  { value: 'embedding', label: '임베딩' },
  { value: 'extracting', label: '후보 추출' },
];

export type IngestKind = 'file' | 'url' | 'text';

export interface IngestJob {
  id: string;
  spaceId: string;
  kind: IngestKind;
  name: string;
  stage: IngestStage;
  createdAt: string;
  updatedAt: string;
  /** 조각 수(조각내기 후) */
  chunkCount?: number;
  /** 만들어진 지식 후보 수(완료 후) */
  candidateCount?: number;
  error?: string;
}

export interface IngestInput {
  kind: IngestKind;
  name: string;
  /** 텍스트 자료 또는 읽을 수 있는 파일의 내용 */
  text?: string;
  url?: string;
}

/** 검색 결과 한 건. score는 0~1. */
export interface SearchHit extends KnowledgeRef {
  summary: string;
  type: KnowledgeType;
  score: number;
  snippet: string;
}

/** 검색 방식: 혼합(키워드+의미) / 의미(벡터) / 키워드 */
export type SearchMode = 'hybrid' | 'semantic' | 'keyword';

export const SEARCH_MODES: { value: SearchMode; label: string }[] = [
  { value: 'hybrid', label: '혼합 (키워드 + 의미)' },
  { value: 'semantic', label: '의미 (벡터)' },
  { value: 'keyword', label: '키워드' },
];
