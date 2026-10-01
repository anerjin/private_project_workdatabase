import type { KnowledgeCandidate, KnowledgeRef, KnowledgeType, SearchHit, SearchMode } from './knowledge';

/** 모델 선택기 계약(디자인 시스템 ChatModelPicker와 같은 모양). 가격은 토큰당 USD. */
export interface ChatModel {
  id: string;
  name: string;
  developer: string;
  contextLength: number | null;
  inputPrice: number | null;
  outputPrice: number | null;
}

export type AgentEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface AiStatus {
  /** 실제 LLM이 연결되었는가. false면 예시 응답(데모)으로 돈다. */
  configured: boolean;
  /** 모델 선택기에 보일 출처 이름 */
  modelSource: string;
  defaultModel: string;
  defaultEffort: AgentEffort;
  webSearch: boolean;
}

export interface ChatRequest {
  message: string;
  model?: string;
  effort?: AgentEffort;
  /** 지식베이스를 검색해 답변 근거로 쓸지(기본 true) */
  useKnowledge?: boolean;
  /** 웹 검색을 쓸지(기본 true) */
  webSearch?: boolean;
  /** 함께 보낼 지식(지금 보고 있는 문서) */
  attached?: KnowledgeRef[];
  /** 대화에서 저장할 만한 내용을 지식 후보로 제안할지(기본 true) */
  proposeCandidates?: boolean;
  /** 지식 검색 방식과 가져올 수(기본 혼합·5개) */
  searchMode?: SearchMode;
  searchLimit?: number;
}

/** 웹 검색 결과·인용 출처. */
export interface WebSource {
  url: string;
  title: string;
}

export type RunEndReason = 'completed' | 'stopped' | 'tool_limit' | 'refusal' | 'max_tokens' | 'error';

/** 채팅 화면에 표시하는 도구 결과 요약. */
export interface ToolResultView {
  isError: boolean;
  /** 사람이 읽을 요약(모델이 받은 텍스트와 같다). */
  text: string;
  /** 지식 검색 결과 */
  hits?: SearchHit[];
}

export type WebToolKind = 'search' | 'fetch';

/** 대화 응답 스트림(SSE)의 이벤트. */
export type AgentEvent =
  | { type: 'run.start'; runId: string; model: string }
  | { type: 'text.delta'; delta: string }
  | { type: 'thinking.delta'; delta: string }
  /** 직전 글이 근거로 쓴 지식 */
  | { type: 'text.citations'; citations: KnowledgeRef[] }
  | { type: 'tool.start'; toolUseId: string; name: string }
  | { type: 'tool.input'; toolUseId: string; name: string; input: unknown }
  | { type: 'tool.result'; toolUseId: string; result: ToolResultView }
  | { type: 'web.start'; toolUseId: string; kind: WebToolKind }
  | { type: 'web.input'; toolUseId: string; kind: WebToolKind; query: string }
  | { type: 'web.result'; toolUseId: string; results: WebSource[]; error?: string }
  /** AI가 지식 후보를 제안함 */
  | { type: 'candidate.proposed'; candidate: KnowledgeCandidate }
  | { type: 'run.end'; reason: RunEndReason; message?: string }
  | { type: 'error'; code: AgentErrorCode; message: string };

export type AgentErrorCode = 'not_configured' | 'authentication' | 'rate_limit' | 'network' | 'busy' | 'internal';

export type TranscriptBlock =
  /** sources: 인용된 웹 출처 / citations: 근거로 쓴 지식 */
  | { type: 'text'; text: string; sources?: WebSource[]; citations?: KnowledgeRef[] }
  | { type: 'thinking'; text: string }
  | { type: 'tool'; toolUseId: string; name: string; input: unknown; result?: ToolResultView }
  | { type: 'web'; toolUseId: string; kind: WebToolKind; query: string; results?: WebSource[]; error?: string }
  /** AI가 제안한 지식 후보 카드 */
  | { type: 'candidate'; candidateId: string; title: string; summary: string; knowledgeType: KnowledgeType }
  /** 사용자가 함께 보낸 지식 */
  | { type: 'attached'; knowledge: KnowledgeRef };

export interface TranscriptEntry {
  role: 'user' | 'assistant';
  blocks: TranscriptBlock[];
  createdAt?: string;
}

export interface ConversationSummary {
  id: string;
  spaceId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface Conversation extends ConversationSummary {
  entries: TranscriptEntry[];
  lastRunEnd?: { reason: RunEndReason; message?: string };
}
