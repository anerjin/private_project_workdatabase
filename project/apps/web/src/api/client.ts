import type {
  AgentEvent,
  AiStatus,
  ChatModel,
  ChatRequest,
  Conversation,
  ConversationSummary,
  IngestInput,
  IngestJob,
  KnowledgeCandidate,
  KnowledgeDetail,
  KnowledgeInput,
  KnowledgePatch,
  KnowledgeSource,
  KnowledgeSummary,
  SearchHit,
  SearchMode,
  Space,
  WorkspaceEvent,
} from '@doi-kb/shared';
import { createDemoApi } from './demo/demoApi';

export { ApiError, errorMessage } from './errors';

export interface SearchOptions {
  mode?: SearchMode;
  limit?: number;
  /** 이 점수(0~1)보다 낮은 결과는 뺀다 */
  minScore?: number;
  /** 이 지식은 결과에서 뺀다(관련 지식 찾기) */
  excludeId?: string;
}

/**
 * 화면이 쓰는 API. 서버(apps/server)가 붙으면 같은 모양의 REST·SSE 클라이언트로 바꾼다.
 * 지금은 브라우저 안의 데모 구현(localStorage 저장, 예시 AI 응답)이 이 계약을 채운다.
 */
export interface KnowledgeApi {
  /** 데모 모드인가(서버·AI 미연결) */
  readonly demo: boolean;

  spaces(): Promise<Space[]>;

  listKnowledge(spaceId: string): Promise<KnowledgeSummary[]>;
  getKnowledge(id: string): Promise<KnowledgeDetail>;
  createKnowledge(spaceId: string, input: KnowledgeInput): Promise<KnowledgeDetail>;
  /** 제목·요약·본문을 바꾸면 새 버전이 생긴다. note는 버전 메모. */
  updateKnowledge(id: string, patch: KnowledgePatch, note?: string): Promise<KnowledgeDetail>;
  deleteKnowledge(id: string): Promise<void>;
  restoreVersion(id: string, version: number): Promise<KnowledgeDetail>;
  addSource(id: string, source: Omit<KnowledgeSource, 'id' | 'addedAt'>): Promise<KnowledgeDetail>;
  removeSource(id: string, sourceId: string): Promise<KnowledgeDetail>;

  search(spaceId: string, query: string, options?: SearchOptions): Promise<SearchHit[]>;
  related(id: string, limit?: number): Promise<SearchHit[]>;

  listCandidates(spaceId: string): Promise<KnowledgeCandidate[]>;
  /** 후보를 지식으로 저장. edits로 내용을 고쳐 저장할 수 있다. */
  acceptCandidate(id: string, edits?: Partial<KnowledgeInput>): Promise<KnowledgeDetail>;
  /** 후보 내용을 기존 지식에 덧붙인다(새 버전). */
  mergeCandidate(id: string, targetId: string): Promise<KnowledgeDetail>;
  rejectCandidate(id: string): Promise<void>;

  listIngestJobs(spaceId: string): Promise<IngestJob[]>;
  startIngest(spaceId: string, input: IngestInput): Promise<IngestJob>;

  listConversations(spaceId: string): Promise<ConversationSummary[]>;
  getConversation(id: string): Promise<Conversation>;
  createConversation(spaceId: string, title: string): Promise<ConversationSummary>;
  deleteConversation(id: string): Promise<void>;
  /** 메시지를 보내고 응답 이벤트를 차례로 받는다. 끝나면 대화 기록에 저장되어 있다. */
  chat(conversationId: string, request: ChatRequest, onEvent: (event: AgentEvent) => void, signal?: AbortSignal): Promise<void>;

  aiStatus(): Promise<AiStatus>;
  aiModels(): Promise<ChatModel[]>;

  /** 워크스페이스 변경 알림(서버에서는 SSE). 해제 함수를 돌려준다. */
  subscribe(listener: (event: WorkspaceEvent) => void): () => void;

  /** 데모 데이터를 처음 상태로 되돌린다(데모 전용). */
  resetDemo(): Promise<void>;
}

export const api: KnowledgeApi = createDemoApi();
