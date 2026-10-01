import {
  knowledgeTypeLabel,
  queryTokens,
  type AgentEvent,
  type CandidateOrigin,
  type ChatRequest,
  type KnowledgeCandidate,
  type KnowledgeDetail,
  type KnowledgeRef,
  type KnowledgeSource,
  type KnowledgeType,
  type SearchHit,
} from '@doi-kb/shared';

export interface CandidateDraft {
  title: string;
  summary: string;
  body: string;
  type: KnowledgeType;
  tags?: string[];
  sources?: Omit<KnowledgeSource, 'id' | 'addedAt'>[];
  origin: CandidateOrigin;
}

export interface DemoAgentContext {
  spaceName: string;
  conversationTitle: string;
  search(query: string, limit: number): SearchHit[];
  get(id: string): KnowledgeDetail | undefined;
  /** 답변 근거로 쓴 지식의 인용 횟수를 올린다 */
  cite(ids: string[]): void;
  propose(draft: Omit<CandidateDraft, 'origin'>): KnowledgeCandidate;
}

const REMEMBER = /기억해|기억해\s*줘|저장해|메모해|적어\s*둬|남겨\s*줘|알아\s*둬/;
const RESEARCH = /찾아|조사|검색|최신|비교|알아봐/;

/**
 * 예시 에이전트. 실제 LLM 대신 지식 검색 결과로 답을 꾸미되, 실제 에이전트와 같은 이벤트 순서
 * (생각 → 지식 검색 → 웹 검색 → 답변 → 근거 → 지식 후보)를 내보내 화면을 끝까지 시험할 수 있게 한다.
 */
export async function runDemoAgent(context: DemoAgentContext, request: ChatRequest, emit: (event: AgentEvent) => void, signal?: AbortSignal): Promise<void> {
  const message = request.message.trim();
  const remember = REMEMBER.test(message);
  const research = RESEARCH.test(message);
  let toolSeq = 0;
  const toolId = () => `demo-${Date.now().toString(36)}-${toolSeq++}`;

  try {
    emit({ type: 'run.start', runId: toolId(), model: request.model ?? 'demo' });
    await stream(
      emit,
      'thinking',
      remember
        ? '사용자가 기억해 달라고 한 내용이다. 이미 비슷한 지식이 있는지 먼저 찾고, 없으면 지식 후보로 만든다.'
        : '질문의 핵심어로 지식베이스를 먼저 찾고, 근거가 부족하면 웹 검색을 쓴다.',
      signal,
    );

    // 1) 지식 검색 — 함께 보낸 문서는 점수 1로 맨 앞에 둔다.
    let hits: SearchHit[] = [];
    const attached = (request.attached ?? [])
      .map((ref) => context.get(ref.id))
      .filter((item): item is KnowledgeDetail => !!item)
      .map((item) => ({ id: item.id, title: item.title, summary: item.summary, type: item.type, score: 1, snippet: item.summary }));
    if (request.useKnowledge !== false) {
      const query = queryTokens(stripRequest(message)).length ? stripRequest(message) : message;
      const id = toolId();
      emit({ type: 'tool.start', toolUseId: id, name: 'knowledge_search' });
      const limit = request.searchLimit ?? 5;
      emit({ type: 'tool.input', toolUseId: id, name: 'knowledge_search', input: { query, limit } });
      await wait(500, signal);
      hits = context.search(query, limit);
      emit({
        type: 'tool.result',
        toolUseId: id,
        result: {
          isError: false,
          text: hits.length ? `관련 지식 ${hits.length}개를 찾았습니다.` : '관련 지식을 찾지 못했습니다.',
          hits,
        },
      });
    }
    hits = [...attached, ...hits.filter((hit) => !attached.some((item) => item.id === hit.id))];

    // 2) 웹 검색 — 조사 요청이거나 근거가 없을 때
    const searchedWeb = request.webSearch !== false && !remember && (research || hits.length === 0);
    if (searchedWeb) {
      const id = toolId();
      const query = stripRequest(message).slice(0, 60);
      emit({ type: 'web.start', toolUseId: id, kind: 'search' });
      emit({ type: 'web.input', toolUseId: id, kind: 'search', query });
      await wait(700, signal);
      emit({
        type: 'web.result',
        toolUseId: id,
        results: [{ title: '예시 결과 — 서버가 연결되면 실제 검색 결과가 보입니다', url: `https://example.com/search?q=${encodeURIComponent(query)}` }],
      });
    }

    // 3) 답변
    // 기억 요청은 비슷한 지식 하나만 짚는다(답변에 [1]만 나온다).
    const used = hits.slice(0, remember ? 1 : 3);
    await stream(emit, 'text', answer(context, message, used, { remember, searchedWeb }), signal);
    if (used.length) {
      const citations: KnowledgeRef[] = used.map(({ id, title }) => ({ id, title }));
      emit({ type: 'text.citations', citations });
      context.cite(citations.map((item) => item.id));
    }

    // 4) 지식 후보 — 기억 요청은 항상, 조사 요청은 근거가 없을 때
    if (request.proposeCandidates !== false && (remember || (research && hits.length === 0))) {
      const draft = remember ? rememberDraft(message) : researchDraft(message);
      const id = toolId();
      emit({ type: 'tool.start', toolUseId: id, name: 'knowledge_propose' });
      emit({ type: 'tool.input', toolUseId: id, name: 'knowledge_propose', input: { title: draft.title, type: draft.type } });
      await wait(400, signal);
      const candidate = context.propose(draft);
      emit({
        type: 'tool.result',
        toolUseId: id,
        result: {
          isError: false,
          text: candidate.similar
            ? `후보 "${candidate.title}"를 만들었습니다. 비슷한 지식 "${candidate.similar.title}"이 있어 합칠지 확인이 필요합니다.`
            : `후보 "${candidate.title}"를 만들었습니다. 검토 대기에서 확인하세요.`,
        },
      });
      emit({ type: 'candidate.proposed', candidate });
    }
    emit({ type: 'run.end', reason: 'completed' });
  } catch (error) {
    if (signal?.aborted || (error as Error).name === 'AbortError') {
      emit({ type: 'run.end', reason: 'stopped', message: '응답을 중지했습니다.' });
      return;
    }
    emit({ type: 'error', code: 'internal', message: `예시 응답을 만들지 못했습니다: ${(error as Error).message}` });
    emit({ type: 'run.end', reason: 'error' });
  }
}

function answer(context: DemoAgentContext, message: string, hits: SearchHit[], flags: { remember: boolean; searchedWeb: boolean }): string {
  const lines: string[] = [];
  if (flags.remember) {
    lines.push(`알겠습니다. 말씀하신 내용을 **지식 후보**로 만들어 두었습니다. 검토 대기에서 확인하면 **${context.spaceName}** 지식으로 저장됩니다.`);
    if (hits.length) lines.push('', `비슷한 지식이 이미 있습니다: **${hits[0].title}** [1]. 저장할 때 합칠지 확인하세요.`);
  } else if (hits.length) {
    lines.push(`지식베이스에서 관련 지식 ${hits.length}개를 찾았습니다.`, '');
    hits.forEach((hit, index) => {
      lines.push(`**${hit.title}** [${index + 1}] · ${knowledgeTypeLabel(hit.type)}`, `> ${hit.summary || hit.snippet}`, '');
    });
    lines.pop();
  } else {
    lines.push(`"${stripRequest(message).slice(0, 40)}"에 대한 지식이 아직 없습니다.`);
    if (flags.searchedWeb) lines.push('', '웹 검색 결과를 참고해 정리할 수 있습니다. 확인한 내용을 지식 후보로 남겨 두면 다음 질문부터 근거로 쓰입니다.');
  }
  lines.push('', '_예시 응답입니다. AI 모델을 연결하면 찾은 근거로 실제 답변을 씁니다._');
  return lines.join('\n');
}

function rememberDraft(message: string): Omit<CandidateDraft, 'origin'> {
  const content = stripRequest(message);
  // "…해야 해" 같은 말끝은 그대로 두고 문장으로 끝맺는다.
  const text = content ? (/[.!?。]$/.test(content) ? content : `${content}.`) : message;
  return {
    title: titleFrom(text),
    summary: text.slice(0, 200),
    body: `${text}\n\n> 대화에서 사용자가 알려 준 내용`,
    type: /절차|순서|방법|하려면/.test(text) ? 'procedure' : /결정|정했|하기로/.test(text) ? 'decision' : 'fact',
  };
}

function researchDraft(message: string): Omit<CandidateDraft, 'origin'> {
  const topic = stripRequest(message).slice(0, 40);
  return {
    title: `조사: ${topic}`,
    summary: '대화에서 조사한 주제입니다. 확인한 내용을 채워 저장하면 다음부터 답변 근거로 쓰입니다.',
    body: `## 질문\n\n${message}\n\n## 확인한 내용\n\n- (여기에 정리)\n`,
    type: 'note',
  };
}

const REQUEST_TAIL =
  /[\s.!?]*(이거|이 내용|이걸)?\s*(좀|를|을)?\s*(알려\s*줘|알려\s*주세요|찾아\s*줘|찾아\s*봐|정리해\s*줘|설명해\s*줘|비교해\s*줘|조사해\s*줘|알아\s*봐\s*줘?|기억해\s*[줘둬]?|저장해\s*줘?|메모해\s*줘?|적어\s*둬|남겨\s*줘|알아\s*둬)[.!?\s]*$/u;

/** "…알려줘", "…기억해줘" 같은 요청 꼬리를 떼어 검색어·제목·후보 내용으로 쓴다. */
function stripRequest(message: string): string {
  return message.replace(REQUEST_TAIL, '').replace(/[?？]+$/, '').trim();
}

function titleFrom(text: string): string {
  const first = text.split(/(?<=[.!?。])\s+|\n/)[0]?.trim() ?? text;
  return first.length > 40 ? `${first.slice(0, 39)}…` : first;
}

async function stream(emit: (event: AgentEvent) => void, kind: 'text' | 'thinking', text: string, signal?: AbortSignal) {
  const size = kind === 'thinking' ? 6 : 3;
  for (let index = 0; index < text.length; index += size) {
    emit({ type: kind === 'text' ? 'text.delta' : 'thinking.delta', delta: text.slice(index, index + size) });
    await wait(kind === 'thinking' ? 12 : 16, signal);
  }
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('중지됨', 'AbortError'));
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('중지됨', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
