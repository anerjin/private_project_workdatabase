import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { createPortal } from 'react-dom';
import { Alert, Badge, Button, Icon, Select, Textarea } from '@bricks/core';
import { Bot, FileText, Globe, History, Library, MessageSquarePlus, Paperclip, Square, X } from 'lucide-react';
import type { AgentEffort, KnowledgeRef } from '@doi-kb/shared';
import { ChatModelPicker } from '../../layout/ChatModelPicker';
import { readModelPreferences, saveModelPreferences } from '../../layout/chatModels';
import { useChatWindow } from '../../layout/useChatWindow';
import '../../layout/layout-chat.css';
import { useWorkspace } from '../../state/workspace';
import { ChatMessages } from './ChatMessages';
import { ConversationList } from './ConversationList';
import { useAgentSession } from './useAgentSession';

const EXAMPLES = {
  team: ['입사 1년 지나면 연차가 며칠이야?', '출장비 정산은 어떻게 해?', '주간 회의록은 앞으로 지식베이스에 남기기로 했어. 기억해줘.'],
  personal: ['RAG가 뭔지 다시 설명해줘', '한국어 검색에서 벡터 검색만 쓰면 뭐가 문제야?', 'pgvector와 Qdrant를 비교해서 찾아줘'],
} as const;

const EFFORTS: { value: AgentEffort; label: string }[] = [
  { value: 'low', label: '빠르게' },
  { value: 'medium', label: '보통' },
  { value: 'high', label: '꼼꼼히' },
  { value: 'xhigh', label: '매우 꼼꼼히' },
  { value: 'max', label: '최대' },
];

const PREFS = { web: 'doi-kb-web-search', knowledge: 'doi-kb-use-knowledge', demoNotice: 'doi-kb-demo-notice' } as const;

/** 로그인한 Claude Code(구독)로 도는 모델 — 모델 선택기 맨 위에 둔다(DOI CAD와 같음). */
const isClaudeCodeModel = (model: { id: string }) => model.id.startsWith('claude-code:');

/** 좁은 채팅 칸용 이름: "Claude Opus 5.5" → "Opus 5.5", "Claude Code · Opus (구독)" → "Code · Opus" */
const shortModelName = (model: { name: string }) => model.name.replace(/^Claude\s+/, '').replace(/\s*\(구독\)$/, '');

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === 'on';
  } catch {
    return fallback;
  }
}

function saveFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? 'on' : 'off');
  } catch {
    // 저장이 막혀도 이번 세션에는 적용된다.
  }
}

/**
 * AI 에이전트 채팅. 창 동작(플로팅·드래그·리사이즈·최소화·도킹)은 디자인 시스템 LayoutChat 그대로이고(DOI CAD AgentChat과 같음),
 * 내용은 지식베이스 대화(지식 검색 → 답변·근거 → 지식 후보)로 바꿨다.
 */
export function AgentChat({ dockContainer, onDockChange }: { dockContainer?: RefObject<HTMLDivElement>; onDockChange?: (docked: boolean) => void }) {
  const {
    open,
    minimized,
    docked,
    rect,
    iconRect,
    interaction,
    input,
    trigger,
    popup,
    iconButton,
    openChat,
    onOpenChange,
    toggleDock,
    minimizeChat,
    interactionProps,
    onIconClick,
  } = useChatWindow({ dockContainer, onDockChange, defaultOpen: true, defaultDocked: true });
  const popupId = useId();
  const log = useRef<HTMLDivElement>(null);
  const aiStatus = useWorkspace((state) => state.aiStatus);
  const models = useWorkspace((state) => state.aiModels);
  const settings = useWorkspace((state) => state.settings);
  const space = useWorkspace((state) => state.spaces.find((item) => item.id === state.spaceId));
  const conversationId = useWorkspace((state) => state.conversationId);
  const conversation = useWorkspace((state) => state.conversations.find((item) => item.id === state.conversationId));
  const setConversation = useWorkspace((state) => state.setConversation);
  const detail = useWorkspace((state) => state.detail);
  const session = useAgentSession(conversationId);
  const [draft, setDraft] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const [model, setModel] = useState(() => readModelPreferences('doi-kb-selected-model')[0] ?? '');
  const [effort, setEffort] = useState<AgentEffort>(() => (readModelPreferences('doi-kb-effort')[0] as AgentEffort | undefined) ?? 'high');
  const [webSearch, setWebSearch] = useState(() => readFlag(PREFS.web, true));
  const [useKnowledge, setUseKnowledge] = useState(() => readFlag(PREFS.knowledge, true));
  const [attachDoc, setAttachDoc] = useState(false);
  const [demoNotice, setDemoNotice] = useState(() => readFlag(PREFS.demoNotice, true));

  const selectedModel = models.find((item) => item.id === model);
  useEffect(() => {
    if (!aiStatus?.defaultModel) return;
    if (!model || (models.length > 0 && !models.some((item) => item.id === model))) setModel(aiStatus.defaultModel);
  }, [model, models, aiStatus?.defaultModel]);
  useEffect(() => {
    if (open && !minimized && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [open, minimized, docked, session.entries, session.notice, listOpen]);
  // 다른 지식으로 옮기면 첨부를 끈다(엉뚱한 문서를 보내지 않도록).
  useEffect(() => setAttachDoc(false), [detail?.id]);

  const attached: KnowledgeRef[] = attachDoc && detail ? [{ id: detail.id, title: detail.title }] : [];
  const canSend = !!draft.trim() && !!selectedModel && !session.streaming;
  const examples = EXAMPLES[space?.kind ?? 'personal'];

  async function send(text = draft) {
    const message = text.trim();
    if (!message || !selectedModel || session.streaming) return;
    setDraft('');
    setListOpen(false);
    const sentAttached = attached;
    setAttachDoc(false);
    const ok = await session.send({
      message,
      model: selectedModel.id,
      effort,
      useKnowledge,
      webSearch: aiStatus?.webSearch !== false && webSearch,
      attached: sentAttached.length ? sentAttached : undefined,
      proposeCandidates: settings.autoPropose,
      searchMode: settings.searchMode,
      searchLimit: settings.topK,
    });
    if (!ok) setDraft((current) => current || message);
    input.current?.focus();
  }

  function newConversation() {
    if (session.streaming) session.stop();
    setConversation(null);
    setListOpen(false);
    input.current?.focus();
  }

  return (
    <Dialog.Root modal={false} disablePointerDismissal open={open && !minimized} onOpenChange={onOpenChange}>
      <Button
        ref={trigger}
        className="layout-chat-launcher"
        hidden={open}
        shape="circle"
        color="primary"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popupId : undefined}
        onClick={openChat}
        aria-label="AI 채팅 열기"
        title="AI 채팅 열기"
      >
        <Icon name="messages-square" size={22} />
      </Button>
      {open &&
        minimized &&
        iconRect &&
        createPortal(
          <Button
            ref={iconButton}
            className="layout-chat-minimized"
            shape="circle"
            color="primary"
            style={iconRect}
            aria-label="채팅창 다시 열기"
            aria-haspopup="dialog"
            title="클릭하여 채팅 열기 · 드래그 또는 방향키로 이동"
            {...interactionProps('icon')}
            onClick={onIconClick}
          >
            <Icon name="messages-square" size={22} />
          </Button>,
          document.body,
        )}
      <Dialog.Portal container={docked ? dockContainer : undefined}>
        <Dialog.Popup
          ref={popup}
          id={popupId}
          className="layout-chat-popup kb-chat"
          initialFocus={input}
          finalFocus={minimized ? iconButton : trigger}
          style={docked ? undefined : (rect ?? undefined)}
          data-docked={docked}
          data-interaction={interaction ?? undefined}
        >
          <header className="layout-chat-header">
            <div
              className="layout-chat-drag-handle"
              role={docked ? undefined : 'button'}
              tabIndex={docked ? undefined : 0}
              aria-label={docked ? undefined : '채팅창 이동'}
              title={docked ? undefined : '드래그하여 이동 · 방향키로 이동'}
              {...interactionProps('move')}
            >
              <Bot size={18} />
              <Dialog.Title>AI 에이전트</Dialog.Title>
            </div>
            <Button
              variant={listOpen ? 'soft' : 'ghost'}
              color={listOpen ? 'primary' : undefined}
              size="sm"
              shape="circle"
              aria-label="대화 목록"
              title="대화 목록"
              aria-pressed={listOpen}
              onClick={() => setListOpen(!listOpen)}
            >
              <History size={15} />
            </Button>
            <Button variant="ghost" size="sm" shape="circle" aria-label="새 대화" title="새 대화" onClick={newConversation}>
              <MessageSquarePlus size={15} />
            </Button>
            {dockContainer && (
              <Button
                variant="ghost"
                size="sm"
                shape="circle"
                aria-label={docked ? '채팅창 띄우기' : '채팅창 사이드에 배치'}
                title={docked ? '채팅창 띄우기' : '사이드 컬럼으로 배치'}
                aria-pressed={docked}
                onClick={toggleDock}
              >
                <Icon name={docked ? 'panels-top-left' : 'panel-right'} size={16} />
              </Button>
            )}
            <Button variant="ghost" size="sm" shape="circle" aria-label="채팅창 아이콘으로 접기" title="아이콘으로 접기" onClick={minimizeChat}>
              <Icon name="minus" size={16} />
            </Button>
            <Dialog.Close render={<Button variant="ghost" size="sm" shape="circle" />} aria-label="채팅 창 닫기">
              <Icon name="x" size={16} />
            </Dialog.Close>
          </header>
          <Dialog.Description className="layout-chat-description kb-chat-description">
            <span className="kb-chat-description-title">{conversation?.title ?? '새 대화'}</span>
            <span> · {space?.name ?? ''}</span>
            {aiStatus && !aiStatus.configured && (
              <Badge size="xs" variant="outline" className="kb-demo-badge">
                예시 응답
              </Badge>
            )}
          </Dialog.Description>

          {listOpen ? (
            <ConversationList onClose={() => setListOpen(false)} />
          ) : (
            <div ref={log} className="layout-chat-log kb-chat-log" role="log" aria-label="AI 대화" aria-live="polite" aria-relevant="additions">
              {aiStatus && !aiStatus.configured && demoNotice && (
                <Alert
                  color="info"
                  variant="soft"
                  description="AI 모델이 아직 연결되지 않았습니다. 지금은 지식 검색 결과로 만든 예시 응답이 나옵니다. 지식 검색·근거·지식 후보 흐름은 그대로 시험할 수 있습니다."
                  dismissible
                  onClose={() => {
                    setDemoNotice(false);
                    saveFlag(PREFS.demoNotice, false);
                  }}
                />
              )}
              {!session.loading && !session.entries.length && (
                <div className="kb-chat-welcome">
                  <p>궁금한 것을 물어보거나, 기억할 내용을 알려 주세요. AI가 {space?.name ?? '지식베이스'}에서 근거를 찾아 답하고, 남길 만한 내용은 지식 후보로 제안합니다.</p>
                  <div className="kb-chat-examples">
                    {examples.map((example) => (
                      <button key={example} type="button" className="kb-chat-example" onClick={() => void send(example)} disabled={!selectedModel || session.streaming}>
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <ChatMessages entries={session.entries} streaming={session.streaming} />
              {session.notice && (
                <Alert color={session.notice.kind === 'error' ? 'error' : 'info'} description={session.notice.text} dismissible onClose={session.dismissNotice} />
              )}
            </div>
          )}

          <form
            className="layout-chat-compose"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            {detail && (
              <div className="kb-chat-context" aria-label="함께 보낼 지식">
                {attachDoc ? (
                  <span className="kb-chip" title={detail.title}>
                    <FileText size={12} aria-hidden />
                    <span className="kb-chip-text">{detail.title}</span>
                    <button type="button" aria-label="첨부한 지식 빼기" onClick={() => setAttachDoc(false)}>
                      <X size={12} />
                    </button>
                  </span>
                ) : (
                  // 지금 보는 지식을 함께 보낼 수 있다고 알려 주는 제안 칩
                  <button type="button" className="kb-chip kb-chip--suggest" title="지금 보는 지식을 메시지와 함께 보냅니다" onClick={() => setAttachDoc(true)}>
                    <Paperclip size={12} aria-hidden />
                    <span className="kb-chip-text">{detail.title}</span>
                    <span className="kb-chip-hint">함께 보내기</span>
                  </button>
                )}
              </div>
            )}
            <Textarea
              ref={input}
              rows={2}
              size="sm"
              aria-label="AI에게 보낼 메시지"
              placeholder={attached.length ? '이 지식에 대해 물어보세요…' : '질문하거나 기억할 내용을 입력하세요…'}
              title="Enter 전송 · Shift+Enter 줄바꿈"
              value={draft}
              maxLength={20000}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <div className="layout-chat-compose-tools">
              <div className="kb-chat-selectors">
                <Button
                  type="button"
                  size="xs"
                  variant={useKnowledge ? 'soft' : 'ghost'}
                  color={useKnowledge ? 'primary' : undefined}
                  shape="square"
                  aria-label="지식베이스 검색"
                  aria-pressed={useKnowledge}
                  title={useKnowledge ? '지식베이스 검색 켜짐: 답하기 전에 저장된 지식에서 근거를 찾습니다' : '지식베이스 검색 꺼짐'}
                  onClick={() => {
                    setUseKnowledge(!useKnowledge);
                    saveFlag(PREFS.knowledge, !useKnowledge);
                  }}
                >
                  <Library size={15} />
                </Button>
                {aiStatus?.webSearch !== false && (
                  <Button
                    type="button"
                    size="xs"
                    variant={webSearch ? 'soft' : 'ghost'}
                    color={webSearch ? 'primary' : undefined}
                    shape="square"
                    aria-label="웹 검색"
                    aria-pressed={webSearch}
                    title={webSearch ? '웹 검색 켜짐: 지식이 부족하거나 조사를 부탁하면 웹에서 찾습니다' : '웹 검색 꺼짐'}
                    onClick={() => {
                      setWebSearch(!webSearch);
                      saveFlag(PREFS.web, !webSearch);
                    }}
                  >
                    <Globe size={15} />
                  </Button>
                )}
                <ChatModelPicker
                  models={models}
                  pinned={isClaudeCodeModel}
                  shortName={shortModelName}
                  sourceLabel={aiStatus?.modelSource ?? 'Claude'}
                  value={model}
                  onChange={(selected) => {
                    setModel(selected.id);
                    saveModelPreferences('doi-kb-selected-model', [selected.id]);
                  }}
                />
                <Select
                  size="xs"
                  aria-label="추론 강도"
                  title="추론 강도(effort): 높을수록 느리고 꼼꼼합니다"
                  className="kb-effort"
                  value={effort}
                  options={EFFORTS}
                  onChange={(event) => {
                    const next = event.target.value as AgentEffort;
                    setEffort(next);
                    saveModelPreferences('doi-kb-effort', [next]);
                  }}
                />
              </div>
              {session.streaming ? (
                <Button type="button" size="sm" shape="circle" color="error" aria-label="응답 중지" title="중지" onClick={session.stop}>
                  <Square size={14} fill="currentColor" />
                </Button>
              ) : (
                <Button type="submit" size="sm" shape="circle" color="primary" aria-label="메시지 보내기" disabled={!canSend}>
                  <Icon name="send" size={16} />
                </Button>
              )}
            </div>
          </form>
          {!docked && (
            <button type="button" className="layout-chat-resize-handle" aria-label="채팅창 크기 조절" title="모서리를 드래그하여 크기 조절 · 방향키로 조절" {...interactionProps('resize')}>
              <span className="layout-chat-resize-grip" aria-hidden="true" />
            </button>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
