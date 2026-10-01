import { useCallback, useEffect, useRef, useState } from 'react';
import { applyAgentEvent, type AgentEvent, type ChatRequest, type RunEndReason, type TranscriptBlock, type TranscriptEntry } from '@doi-kb/shared';
import { api, errorMessage } from '../../api/client';
import { useWorkspace } from '../../state/workspace';

export interface ChatNotice {
  kind: 'error' | 'info';
  text: string;
}

export interface AgentSession {
  entries: TranscriptEntry[];
  loading: boolean;
  /** 이 창에서 시작한 응답을 받는 중 */
  streaming: boolean;
  notice: ChatNotice | null;
  /** 메시지를 보낸다. 대화가 없으면 새 대화를 만든다. 실패하면 false. */
  send(request: ChatRequest): Promise<boolean>;
  stop(): void;
  dismissNotice(): void;
}

const END_NOTICE: Partial<Record<RunEndReason, ChatNotice['kind']>> = {
  stopped: 'info',
  tool_limit: 'info',
  max_tokens: 'info',
  refusal: 'error',
  error: 'error',
};

/** 지금 대화의 기록을 불러오고, 새 메시지를 보내 응답 이벤트로 화면을 갱신한다(DOI CAD useAgentSession과 같은 흐름). */
export function useAgentSession(conversationId: string | null): AgentSession {
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [notice, setNotice] = useState<ChatNotice | null>(null);
  const controller = useRef<AbortController | null>(null);
  const current = useRef(conversationId);
  current.current = conversationId;
  /** 보내면서 막 만든 대화 — 이 id로 바뀔 때는 기록을 다시 읽지 않는다(스트리밍 중인 화면 유지). */
  const adopting = useRef<string | null>(null);
  /**
   * 보낼 때마다 1씩 오른다. 기록을 다시 읽는 응답이 늦게 도착했을 때, 그 사이 새 메시지를 보냈다면
   * 옛 기록으로 화면(방금 보낸 말풍선)을 덮어쓰지 않도록 비교한다.
   */
  const runSeq = useRef(0);

  const reload = useCallback(async (id: string) => {
    const seq = runSeq.current;
    setLoading(true);
    try {
      const conversation = await api.getConversation(id);
      if (current.current !== id || runSeq.current !== seq) return;
      setEntries(conversation.entries);
      const end = conversation.lastRunEnd;
      setNotice(end && END_NOTICE[end.reason] && end.message ? { kind: END_NOTICE[end.reason]!, text: end.message } : null);
    } catch (error) {
      if (current.current === id) setNotice({ kind: 'error', text: errorMessage(error, '대화 기록을 불러오지 못했습니다.') });
    } finally {
      if (current.current === id) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (conversationId && adopting.current === conversationId) {
      adopting.current = null;
      return;
    }
    controller.current?.abort();
    setStreaming(false);
    setEntries([]);
    setNotice(null);
    if (conversationId) void reload(conversationId);
  }, [conversationId, reload]);

  useEffect(() => () => controller.current?.abort(), []);

  const send = useCallback(
    async (request: ChatRequest): Promise<boolean> => {
      if (streaming) return false;
      const seq = ++runSeq.current;
      const abort = new AbortController();
      controller.current = abort;
      setStreaming(true);
      setNotice(null);
      const userBlocks: TranscriptBlock[] = [
        ...(request.attached ?? []).map((knowledge) => ({ type: 'attached' as const, knowledge })),
        { type: 'text', text: request.message },
      ];
      setEntries((list) => [...list, { role: 'user', blocks: userBlocks }, { role: 'assistant', blocks: [] }]);

      let id = conversationId;
      let failed = false;
      try {
        if (!id) {
          const { spaceId, setConversation } = useWorkspace.getState();
          const created = await api.createConversation(spaceId, request.message);
          id = created.id;
          adopting.current = id;
          current.current = id;
          setConversation(id);
        }
        const target = id;
        const onEvent = (event: AgentEvent) => {
          if (current.current !== target) return;
          if (event.type === 'error') {
            failed = true;
            setNotice({ kind: 'error', text: event.message });
          } else if (event.type === 'run.end' && event.reason !== 'completed' && event.reason !== 'error' && event.message) {
            setNotice({ kind: END_NOTICE[event.reason] ?? 'info', text: event.message });
          }
          setEntries((list) => {
            const last = list.at(-1);
            if (!last || last.role !== 'assistant') return list;
            return [...list.slice(0, -1), { ...last, blocks: applyAgentEvent(last.blocks, event) }];
          });
        };
        await api.chat(target, request, onEvent, abort.signal);
      } catch (error) {
        failed = true;
        // 대화를 만들지도 못했으면 방금 그린 말풍선을 거둔다(입력창에 글이 돌아간다).
        if (!id) setEntries((list) => list.slice(0, -2));
        setNotice({ kind: 'error', text: errorMessage(error, `요청에 실패했습니다: ${(error as Error).message}`) });
      } finally {
        if (controller.current === abort) controller.current = null;
        setStreaming(false);
        // 저장된 기록과 맞춘다. 그 사이 다음 메시지를 보냈으면 건너뛴다.
        if (id && current.current === id) {
          try {
            const conversation = await api.getConversation(id);
            if (current.current === id && runSeq.current === seq) setEntries(conversation.entries);
          } catch {
            // 화면 기록을 그대로 둔다.
          }
        }
      }
      return !failed;
    },
    [conversationId, streaming],
  );

  return {
    entries,
    loading,
    streaming,
    notice,
    send,
    stop: () => controller.current?.abort(),
    dismissNotice: () => setNotice(null),
  };
}
