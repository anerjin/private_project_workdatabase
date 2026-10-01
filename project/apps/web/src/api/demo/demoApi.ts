import {
  applyAgentEvent,
  plainText,
  rank,
  type AgentEvent,
  type AiStatus,
  type Author,
  type ChatModel,
  type Conversation,
  type ConversationSummary,
  type IngestJob,
  type IngestStage,
  type KnowledgeCandidate,
  type KnowledgeDetail,
  type KnowledgeInput,
  type KnowledgeSource,
  type KnowledgeSummary,
  type SearchHit,
  type TranscriptBlock,
  type WorkspaceEvent,
} from '@doi-kb/shared';
import type { KnowledgeApi, SearchOptions } from '../client';
import { ApiError } from '../errors';
import { runDemoAgent, type CandidateDraft } from './demoAgent';
import { createSeed, type DemoDb } from './seed';

const STORAGE_KEY = 'doi-kb-demo-v1';
/** 실제 네트워크처럼 아주 잠깐 기다려 로딩 상태가 화면에 드러나게 한다. */
const LATENCY_MS = 90;
/** AI가 근거로 쓸 최소 검색 점수. 이보다 낮으면 우연히 겹친 낱말이라 답변이 흐려진다. */
const AGENT_MIN_SCORE = 0.3;

const MODELS: ChatModel[] = [
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', developer: 'Anthropic', contextLength: null, inputPrice: null, outputPrice: null },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', developer: 'Anthropic', contextLength: null, inputPrice: null, outputPrice: null },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', developer: 'Anthropic', contextLength: null, inputPrice: null, outputPrice: null },
  { id: 'claude-fable-5-1', name: 'Claude Fable 5.1', developer: 'Anthropic', contextLength: null, inputPrice: null, outputPrice: null },
  { id: 'claude-code:opus', name: 'Claude Code · Opus (구독)', developer: 'Claude Code', contextLength: null, inputPrice: null, outputPrice: null },
  { id: 'claude-code:sonnet', name: 'Claude Code · Sonnet (구독)', developer: 'Claude Code', contextLength: null, inputPrice: null, outputPrice: null },
];

const AI_STATUS: AiStatus = {
  configured: false,
  modelSource: '예시 모델 목록 (서버 미연결)',
  defaultModel: 'claude-opus-5-5',
  defaultEffort: 'high',
  webSearch: true,
};

const SUMMARY_KEYS = ['id', 'spaceId', 'title', 'summary', 'type', 'status', 'tags', 'author', 'createdAt', 'updatedAt', 'citedCount'] as const;

/**
 * 브라우저 안에서 도는 데모 API. 데이터는 localStorage에 저장되고, AI 응답은 지식 검색 결과로 만든 예시다.
 * 서버가 붙으면 같은 KnowledgeApi 계약의 HTTP 클라이언트로 바뀐다.
 */
export function createDemoApi(): KnowledgeApi {
  let db = load();
  const listeners = new Set<(event: WorkspaceEvent) => void>();
  const runningChats = new Set<string>();

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {
      // 저장소가 막혀 있어도 이번 화면에서는 계속 쓸 수 있다.
    }
  }

  function emit(...events: WorkspaceEvent[]) {
    // 호출한 쪽의 상태 갱신이 끝난 뒤 알린다(서버 SSE와 같은 순서).
    queueMicrotask(() => {
      for (const event of events) for (const listener of listeners) listener(event);
    });
  }

  function reply<T>(value: T, ms = LATENCY_MS): Promise<T> {
    const copy = structuredClone(value);
    return new Promise((resolve) => setTimeout(() => resolve(copy), ms));
  }

  function findKnowledge(id: string): KnowledgeDetail {
    const item = db.knowledge.find((entry) => entry.id === id);
    if (!item) throw new ApiError('지식을 찾지 못했습니다. 다른 곳에서 삭제되었을 수 있습니다.', 'not_found', 404);
    return item;
  }

  function findCandidate(id: string): KnowledgeCandidate {
    const item = db.candidates.find((entry) => entry.id === id);
    if (!item) throw new ApiError('지식 후보를 찾지 못했습니다.', 'not_found', 404);
    if (item.status !== 'pending') throw new ApiError('이미 처리한 후보입니다.', 'conflict', 409);
    return item;
  }

  function findConversation(id: string): Conversation {
    const item = db.conversations.find((entry) => entry.id === id);
    if (!item) throw new ApiError('대화를 찾지 못했습니다.', 'not_found', 404);
    return item;
  }

  function touch(item: KnowledgeDetail) {
    item.updatedAt = new Date().toISOString();
    item.sourceCount = item.sources.length;
  }

  function pushVersion(item: KnowledgeDetail, author: Author, note: string) {
    item.versions.push({
      id: (item.versions.at(-1)?.id ?? 0) + 1,
      createdAt: new Date().toISOString(),
      author,
      note,
      title: item.title,
      summary: item.summary,
      body: item.body,
    });
  }

  function insertKnowledge(spaceId: string, input: KnowledgeInput, author: Author, note: string): KnowledgeDetail {
    if (!db.spaces.some((space) => space.id === spaceId)) throw new ApiError('공간을 찾지 못했습니다.', 'not_found', 404);
    const now = new Date().toISOString();
    const item: KnowledgeDetail = {
      id: newId('k'),
      spaceId,
      title: input.title.trim() || '제목 없음',
      summary: input.summary.trim(),
      body: input.body,
      type: input.type,
      status: input.status ?? 'draft',
      tags: normalizeTags(input.tags ?? []),
      author,
      createdAt: now,
      updatedAt: now,
      sourceCount: 0,
      citedCount: 0,
      sources: (input.sources ?? []).map((source) => ({ ...source, id: newId('s'), addedAt: now })),
      versions: [],
      searchable: true,
    };
    item.sourceCount = item.sources.length;
    pushVersion(item, author, note);
    db.knowledge.unshift(item);
    return item;
  }

  function searchSpace(spaceId: string, query: string, options: SearchOptions = {}): SearchHit[] {
    const docs = db.knowledge.filter((item) => item.spaceId === spaceId && item.searchable && item.id !== options.excludeId);
    return rank(query, docs, { limit: options.limit ?? 5, minScore: options.minScore }).map((hit) => {
      const item = docs.find((doc) => doc.id === hit.id)!;
      return { id: item.id, title: item.title, summary: item.summary, type: item.type, score: hit.score, snippet: hit.snippet };
    });
  }

  function similarTo(spaceId: string, draft: { title: string; summary: string }): KnowledgeCandidate['similar'] {
    const top = searchSpace(spaceId, `${draft.title} ${draft.summary}`, { limit: 1, minScore: 0.3 })[0];
    return top ? { id: top.id, title: top.title, score: top.score } : undefined;
  }

  function addCandidate(spaceId: string, draft: CandidateDraft): KnowledgeCandidate {
    const candidate: KnowledgeCandidate = {
      id: newId('cand'),
      spaceId,
      title: draft.title,
      summary: draft.summary,
      body: draft.body,
      type: draft.type,
      tags: normalizeTags(draft.tags ?? []),
      sources: draft.sources ?? [],
      origin: draft.origin,
      createdAt: new Date().toISOString(),
      status: 'pending',
      similar: similarTo(spaceId, draft),
    };
    db.candidates.unshift(candidate);
    return candidate;
  }

  function resolveCandidate(candidate: KnowledgeCandidate, status: KnowledgeCandidate['status'], knowledgeId?: string) {
    candidate.status = status;
    candidate.knowledgeId = knowledgeId;
  }

  function advanceIngest(jobId: string, input: { text?: string; url?: string }) {
    const steps: { stage: IngestStage; after: number }[] = [
      { stage: 'chunking', after: 700 },
      { stage: 'embedding', after: 900 },
      { stage: 'extracting', after: 900 },
      { stage: 'done', after: 800 },
    ];
    let elapsed = 0;
    for (const step of steps) {
      elapsed += step.after;
      setTimeout(() => {
        const job = db.ingestJobs.find((item) => item.id === jobId);
        if (!job || job.stage === 'error') return;
        job.stage = step.stage;
        job.updatedAt = new Date().toISOString();
        if (step.stage === 'chunking') job.chunkCount = Math.max(1, Math.ceil((input.text?.length ?? 2400) / 600));
        if (step.stage === 'done') {
          const drafts = draftsFromIngest(job, input);
          for (const draft of drafts) addCandidate(job.spaceId, draft);
          job.candidateCount = drafts.length;
          emit({ type: 'candidates.changed', spaceId: job.spaceId });
        }
        save();
        emit({ type: 'ingest.changed', spaceId: job.spaceId });
      }, elapsed);
    }
  }

  return {
    demo: true,

    spaces: () => reply(db.spaces),

    listKnowledge: (spaceId) => reply(db.knowledge.filter((item) => item.spaceId === spaceId).map(toSummary)),

    async getKnowledge(id) {
      return reply(findKnowledge(id));
    },

    async createKnowledge(spaceId, input) {
      const item = insertKnowledge(spaceId, input, 'user', '새로 만듦');
      save();
      emit({ type: 'knowledge.changed', spaceId, id: item.id });
      return reply(item);
    },

    async updateKnowledge(id, patch, note) {
      const item = findKnowledge(id);
      const contentChanged =
        (patch.title !== undefined && patch.title !== item.title) ||
        (patch.summary !== undefined && patch.summary !== item.summary) ||
        (patch.body !== undefined && patch.body !== item.body);
      Object.assign(item, patch);
      if (patch.title !== undefined) item.title = patch.title.trim() || '제목 없음';
      if (patch.tags) item.tags = normalizeTags(patch.tags);
      if (patch.reviewAt === '') delete item.reviewAt;
      if (contentChanged) pushVersion(item, 'user', note?.trim() || '내용 수정');
      touch(item);
      save();
      emit({ type: 'knowledge.changed', spaceId: item.spaceId, id });
      return reply(item);
    },

    async deleteKnowledge(id) {
      const item = findKnowledge(id);
      db.knowledge = db.knowledge.filter((entry) => entry.id !== id);
      save();
      emit({ type: 'knowledge.deleted', spaceId: item.spaceId, id });
      return reply(undefined);
    },

    async restoreVersion(id, version) {
      const item = findKnowledge(id);
      const target = item.versions.find((entry) => entry.id === version);
      if (!target) throw new ApiError('버전을 찾지 못했습니다.', 'not_found', 404);
      item.title = target.title;
      item.summary = target.summary;
      item.body = target.body;
      pushVersion(item, 'user', `v${version}로 되돌림`);
      touch(item);
      save();
      emit({ type: 'knowledge.changed', spaceId: item.spaceId, id });
      return reply(item);
    },

    async addSource(id, source) {
      const item = findKnowledge(id);
      item.sources.push({ ...source, id: newId('s'), addedAt: new Date().toISOString() });
      touch(item);
      save();
      emit({ type: 'knowledge.changed', spaceId: item.spaceId, id });
      return reply(item);
    },

    async removeSource(id, sourceId) {
      const item = findKnowledge(id);
      item.sources = item.sources.filter((source) => source.id !== sourceId);
      touch(item);
      save();
      emit({ type: 'knowledge.changed', spaceId: item.spaceId, id });
      return reply(item);
    },

    search: (spaceId, query, options) => reply(searchSpace(spaceId, query, options)),

    async related(id, limit = 5) {
      const item = findKnowledge(id);
      // 요약까지 넣으면 검색어가 길어져 점수가 묽어진다. 제목과 태그로 찾는다.
      const query = `${item.title} ${item.tags.join(' ')}`;
      return reply(searchSpace(item.spaceId, query, { limit, excludeId: id, minScore: 0.12 }));
    },

    listCandidates: (spaceId) => reply(db.candidates.filter((item) => item.spaceId === spaceId)),

    async acceptCandidate(id, edits = {}) {
      const candidate = findCandidate(id);
      const item = insertKnowledge(
        candidate.spaceId,
        {
          title: edits.title ?? candidate.title,
          summary: edits.summary ?? candidate.summary,
          body: edits.body ?? candidate.body,
          type: edits.type ?? candidate.type,
          status: edits.status ?? 'verified',
          tags: edits.tags ?? candidate.tags,
          sources: candidate.sources,
        },
        'agent',
        candidate.origin.kind === 'conversation' ? `대화 "${candidate.origin.label}"의 후보를 확인 후 저장` : `자료 "${candidate.origin.label}"의 후보를 확인 후 저장`,
      );
      resolveCandidate(candidate, 'accepted', item.id);
      save();
      emit({ type: 'candidates.changed', spaceId: candidate.spaceId }, { type: 'knowledge.changed', spaceId: item.spaceId, id: item.id });
      return reply(item);
    },

    async mergeCandidate(id, targetId) {
      const candidate = findCandidate(id);
      const target = findKnowledge(targetId);
      const date = new Date().toLocaleDateString('ko-KR');
      target.body = `${target.body.trimEnd()}\n\n## 추가된 내용 (${date})\n\n${candidate.body || candidate.summary}`;
      for (const source of candidate.sources) target.sources.push({ ...source, id: newId('s'), addedAt: new Date().toISOString() });
      for (const tag of candidate.tags) if (!target.tags.includes(tag)) target.tags.push(tag);
      // 새 내용이 들어왔으니 사람이 다시 확인할 때까지 초안으로 둔다.
      target.status = 'draft';
      pushVersion(target, 'agent', `후보 "${candidate.title}" 내용을 합침`);
      touch(target);
      resolveCandidate(candidate, 'merged', target.id);
      save();
      emit({ type: 'candidates.changed', spaceId: candidate.spaceId }, { type: 'knowledge.changed', spaceId: target.spaceId, id: target.id });
      return reply(target);
    },

    async rejectCandidate(id) {
      const candidate = findCandidate(id);
      resolveCandidate(candidate, 'rejected');
      save();
      emit({ type: 'candidates.changed', spaceId: candidate.spaceId });
      return reply(undefined);
    },

    listIngestJobs: (spaceId) => reply(db.ingestJobs.filter((job) => job.spaceId === spaceId)),

    async startIngest(spaceId, input) {
      if (!input.name.trim()) throw new ApiError('자료 이름이 비어 있습니다.');
      const now = new Date().toISOString();
      const job: IngestJob = { id: newId('job'), spaceId, kind: input.kind, name: input.name.trim(), stage: 'reading', createdAt: now, updatedAt: now };
      db.ingestJobs.unshift(job);
      save();
      emit({ type: 'ingest.changed', spaceId });
      advanceIngest(job.id, { text: input.text, url: input.url });
      return reply(job);
    },

    listConversations: (spaceId) =>
      reply(
        db.conversations
          .filter((item) => item.spaceId === spaceId)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .map(toConversationSummary),
      ),

    async getConversation(id) {
      return reply(findConversation(id));
    },

    async createConversation(spaceId, title) {
      const now = new Date().toISOString();
      const conversation: Conversation = { id: newId('c'), spaceId, title: title.trim().slice(0, 60) || '새 대화', createdAt: now, updatedAt: now, messageCount: 0, entries: [] };
      db.conversations.unshift(conversation);
      save();
      emit({ type: 'conversations.changed', spaceId });
      return reply(toConversationSummary(conversation));
    },

    async deleteConversation(id) {
      const conversation = findConversation(id);
      if (runningChats.has(id)) throw new ApiError('응답 중인 대화는 지울 수 없습니다. 먼저 중지하세요.', 'busy', 409);
      db.conversations = db.conversations.filter((item) => item.id !== id);
      save();
      emit({ type: 'conversations.changed', spaceId: conversation.spaceId });
      return reply(undefined);
    },

    async chat(conversationId, request, onEvent, signal) {
      const conversation = findConversation(conversationId);
      if (runningChats.has(conversationId)) throw new ApiError('이 대화는 이미 응답 중입니다.', 'busy', 409);
      const message = request.message.trim();
      if (!message) throw new ApiError('보낼 메시지가 비어 있습니다.');
      runningChats.add(conversationId);
      const now = new Date().toISOString();
      const userBlocks: TranscriptBlock[] = [
        ...(request.attached ?? []).map((knowledge) => ({ type: 'attached' as const, knowledge })),
        { type: 'text', text: message },
      ];
      conversation.entries.push({ role: 'user', blocks: userBlocks, createdAt: now });
      const assistant = { role: 'assistant' as const, blocks: [] as TranscriptBlock[], createdAt: now };
      conversation.entries.push(assistant);
      conversation.updatedAt = now;
      conversation.messageCount = conversation.entries.length;
      save();
      emit({ type: 'conversations.changed', spaceId: conversation.spaceId });

      const record = (event: AgentEvent) => {
        assistant.blocks = applyAgentEvent(assistant.blocks, event);
        if (event.type === 'run.end') conversation.lastRunEnd = { reason: event.reason, message: event.message };
        onEvent(event);
      };
      try {
        await runDemoAgent(
          {
            spaceName: db.spaces.find((space) => space.id === conversation.spaceId)?.name ?? '',
            conversationTitle: conversation.title,
            search: (query, limit) => searchSpace(conversation.spaceId, query, { limit, minScore: AGENT_MIN_SCORE }),
            get: (id) => db.knowledge.find((item) => item.id === id),
            cite(ids) {
              const at = new Date().toISOString();
              for (const item of db.knowledge) {
                if (!ids.includes(item.id)) continue;
                item.citedCount += 1;
                item.lastCitedAt = at;
                emit({ type: 'knowledge.changed', spaceId: item.spaceId, id: item.id });
              }
            },
            propose(draft) {
              // 후보를 만든 대화를 출처로 남겨, 저장한 뒤에도 어디서 나온 지식인지 따라갈 수 있게 한다.
              const candidate = addCandidate(conversation.spaceId, {
                ...draft,
                sources: [...(draft.sources ?? []), { kind: 'conversation', title: conversation.title, conversationId: conversation.id }],
                origin: { kind: 'conversation', label: conversation.title, conversationId: conversation.id },
              });
              emit({ type: 'candidates.changed', spaceId: conversation.spaceId });
              return candidate;
            },
          },
          request,
          record,
          signal,
        );
      } finally {
        runningChats.delete(conversationId);
        conversation.updatedAt = new Date().toISOString();
        save();
        emit({ type: 'conversations.changed', spaceId: conversation.spaceId });
      }
    },

    aiStatus: () => reply(AI_STATUS),
    aiModels: () => reply(MODELS),

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async resetDemo() {
      db = createSeed();
      save();
      for (const space of db.spaces) {
        emit(
          { type: 'candidates.changed', spaceId: space.id },
          { type: 'ingest.changed', spaceId: space.id },
          { type: 'conversations.changed', spaceId: space.id },
        );
      }
      return reply(undefined);
    },
  };
}

function load(): DemoDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as DemoDb;
      if (saved.version === 1 && Array.isArray(saved.knowledge)) return repair(saved);
    }
  } catch {
    // 깨진 저장값은 버리고 예시 데이터로 시작한다.
  }
  return createSeed();
}

/** 새로 고침으로 끊긴 수집 작업을 오류로 표시하고, 검토 날짜가 지난 지식을 검토 필요로 바꾼다. */
function repair(db: DemoDb): DemoDb {
  const today = new Date().toISOString().slice(0, 10);
  for (const job of db.ingestJobs) {
    if (job.stage !== 'done' && job.stage !== 'error') {
      job.stage = 'error';
      job.error = '페이지를 새로 고쳐 수집이 중단되었습니다. 다시 추가하세요.';
    }
  }
  for (const item of db.knowledge) {
    if (item.status === 'verified' && item.reviewAt && item.reviewAt < today) item.status = 'stale';
  }
  return db;
}

function toSummary(item: KnowledgeDetail): KnowledgeSummary {
  const summary = Object.fromEntries(SUMMARY_KEYS.map((key) => [key, item[key]])) as Omit<KnowledgeSummary, 'sourceCount'>;
  return { ...summary, sourceCount: item.sources.length };
}

function toConversationSummary({ entries: _entries, lastRunEnd: _end, ...summary }: Conversation): ConversationSummary {
  return summary;
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean))].slice(0, 20);
}

/** 수집한 자료에서 지식 후보 초안을 만든다. 읽을 수 없는 형식은 서버 연결 후 처리한다고 알린다. */
function draftsFromIngest(job: IngestJob, input: { text?: string; url?: string }): CandidateDraft[] {
  const origin = { kind: 'ingest' as const, label: job.name, ingestJobId: job.id };
  const source: Omit<KnowledgeSource, 'id' | 'addedAt'> =
    job.kind === 'url' ? { kind: 'web', title: job.name, url: input.url } : { kind: job.kind === 'file' ? 'file' : 'manual', title: job.name };
  const text = input.text?.trim();
  if (text) {
    const plain = plainText(text).replace(/\s+/g, ' ').trim();
    const heading = text.match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim();
    const sentences = plain.split(/(?<=[.!?。])\s+/).slice(0, 2).join(' ');
    return [
      {
        title: (heading ?? job.name.replace(/\.[a-z0-9]+$/i, '')).slice(0, 60),
        summary: sentences.slice(0, 200),
        body: text.slice(0, 6000),
        type: 'reference',
        sources: [{ ...source, excerpt: sentences.slice(0, 120) }],
        origin,
      },
    ];
  }
  const what = job.kind === 'url' ? '웹 페이지' : '파일';
  return [
    {
      title: `${job.name.replace(/\.[a-z0-9]+$/i, '')} 요약`,
      summary: `데모: ${what} "${job.name}"에서 뽑은 지식 후보 자리입니다. 서버가 연결되면 실제 내용을 읽어 요약합니다.`,
      body: `## ${job.name}\n\n데모 모드에서는 이 형식의 ${what}을(를) 읽지 않습니다. 텍스트(.txt·.md)를 올리거나 [텍스트] 탭에 붙여 넣으면 실제 내용으로 후보를 만듭니다.`,
      type: 'reference',
      sources: [source],
      origin,
    },
  ];
}
