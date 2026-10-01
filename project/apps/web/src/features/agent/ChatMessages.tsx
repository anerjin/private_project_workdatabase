import { memo, useState } from 'react';
import { Avatar, Button, ChatBubble, Collapse, toast } from '@bricks/core';
import { Brain, Check, CircleCheck, CircleX, FileText, Globe, Library, Loader2, PencilLine, Search, Sparkles, X } from 'lucide-react';
import { knowledgeTypeLabel, type KnowledgeRef, type TranscriptBlock, type TranscriptEntry, type WebSource } from '@doi-kb/shared';
import { errorMessage } from '../../api/client';
import { hostOf, isWebUrl, percent } from '../../lib/format';
import { Markdown } from '../../lib/Markdown';
import { useWorkspace } from '../../state/workspace';
import { TypeIcon } from '../common/KnowledgeBits';

const TOOL_META: Record<string, { label: string; icon: typeof Search }> = {
  knowledge_search: { label: '지식 검색', icon: Search },
  knowledge_get: { label: '지식 읽기', icon: FileText },
  knowledge_propose: { label: '지식 후보 제안', icon: Sparkles },
  knowledge_update: { label: '지식 수정', icon: PencilLine },
};

export function ChatMessages({ entries, streaming }: { entries: TranscriptEntry[]; streaming: boolean }) {
  return (
    <>
      {entries.map((entry, index) =>
        entry.role === 'user' ? (
          <ChatBubble key={index} side="end" color="primary" header="나">
            <AttachedChips blocks={entry.blocks} />
            {entry.blocks
              .filter((block): block is Extract<TranscriptBlock, { type: 'text' }> => block.type === 'text')
              .map((block) => block.text)
              .join('\n')}
          </ChatBubble>
        ) : (
          <AssistantEntry key={index} blocks={entry.blocks} live={streaming && index === entries.length - 1} />
        ),
      )}
    </>
  );
}

const AssistantEntry = memo(function AssistantEntry({ blocks, live }: { blocks: TranscriptBlock[]; live: boolean }) {
  return (
    <div className="kb-assistant">
      <div className="kb-assistant-head">
        <Avatar size="xs" initials="AI" />
        <span>AI 에이전트</span>
        {live && <Loader2 size={12} className="kb-spin" aria-label="응답 중" />}
      </div>
      {!blocks.length && live && <p className="kb-typing">생각하는 중…</p>}
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'text':
            return (
              <div key={index} className="kb-answer">
                {block.text && <Markdown>{block.text}</Markdown>}
                {block.citations?.length ? <Citations citations={block.citations} /> : null}
                {block.sources?.length ? <Sources sources={block.sources} /> : null}
              </div>
            );
          case 'thinking':
            return (
              <Collapse key={index} className="kb-thinking" icon="arrow" title={<span className="kb-thinking-title"><Brain size={13} /> 생각 과정</span>}>
                <p>{block.text}</p>
              </Collapse>
            );
          case 'web':
            return <WebCard key={block.toolUseId} block={block} />;
          case 'candidate':
            return <CandidateChatCard key={block.candidateId} block={block} />;
          case 'tool':
            return <ToolCard key={block.toolUseId} block={block} />;
          default:
            return null;
        }
      })}
    </div>
  );
});

function AttachedChips({ blocks }: { blocks: TranscriptBlock[] }) {
  const openKnowledge = useWorkspace((state) => state.openKnowledge);
  const attached = blocks.filter((block): block is Extract<TranscriptBlock, { type: 'attached' }> => block.type === 'attached');
  if (!attached.length) return null;
  return (
    <span className="kb-bubble-attached">
      {attached.map(({ knowledge }) => (
        <button key={knowledge.id} type="button" className="kb-bubble-chip" onClick={() => void openKnowledge(knowledge.id)} title="지식 열기">
          <FileText size={11} aria-hidden />
          {knowledge.title}
        </button>
      ))}
    </span>
  );
}

/** 답변의 근거가 된 지식. 번호는 본문의 [1], [2]와 맞는다. */
function Citations({ citations }: { citations: KnowledgeRef[] }) {
  const openKnowledge = useWorkspace((state) => state.openKnowledge);
  return (
    <div className="kb-citations" aria-label="근거 지식">
      <span>
        <Library size={12} aria-hidden /> 근거 지식
      </span>
      <ol>
        {citations.map((item) => (
          <li key={item.id}>
            <button type="button" onClick={() => void openKnowledge(item.id)} title="지식 열기">
              {item.title}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ToolCard({ block }: { block: Extract<TranscriptBlock, { type: 'tool' }> }) {
  const [open, setOpen] = useState(false);
  const openKnowledge = useWorkspace((state) => state.openKnowledge);
  const meta = TOOL_META[block.name] ?? { label: block.name, icon: Sparkles };
  const Icon = meta.icon;
  const result = block.result;
  const status = !result ? 'running' : result.isError ? 'error' : 'ok';
  const input = block.input as Record<string, unknown> | undefined;
  const headline = typeof input?.query === 'string' ? `"${input.query}"` : typeof input?.title === 'string' ? input.title : (result?.text.split('\n')[0] ?? '실행 중…');
  return (
    <div className="kb-tool" data-status={status}>
      <button type="button" className="kb-tool-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon size={14} />
        <span className="kb-tool-label">{meta.label}</span>
        <span className="kb-tool-summary">{headline}</span>
        {status === 'running' && <Loader2 size={14} className="kb-spin" aria-label="실행 중" />}
        {status === 'ok' && <CircleCheck size={14} className="kb-text-success" aria-label="성공" />}
        {status === 'error' && <CircleX size={14} className="kb-text-error" aria-label="실패" />}
      </button>
      {result?.hits && (
        <ul className="kb-tool-hits">
          {result.hits.length === 0 && <li className="kb-tool-empty">{result.text}</li>}
          {result.hits.map((hit) => (
            <li key={hit.id}>
              <button type="button" onClick={() => void openKnowledge(hit.id)} title={hit.snippet}>
                <TypeIcon type={hit.type} size={12} />
                <span className="kb-tool-hit-title">{hit.title}</span>
                <span className="kb-score" title="검색 점수">
                  {percent(hit.score)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <div className="kb-tool-body">
          {block.input !== undefined && <pre className="kb-tool-input">{JSON.stringify(block.input, null, 2)}</pre>}
          {result && <pre>{result.text}</pre>}
        </div>
      )}
    </div>
  );
}

/** AI가 제안한 지식 후보. 채팅에서 바로 저장하거나 버릴 수 있다. */
function CandidateChatCard({ block }: { block: Extract<TranscriptBlock, { type: 'candidate' }> }) {
  const candidate = useWorkspace((state) => state.candidates.find((item) => item.id === block.candidateId));
  const acceptCandidate = useWorkspace((state) => state.acceptCandidate);
  const rejectCandidate = useWorkspace((state) => state.rejectCandidate);
  const openInbox = useWorkspace((state) => state.openInbox);
  const openKnowledge = useWorkspace((state) => state.openKnowledge);
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null);

  async function act(kind: 'accept' | 'reject') {
    setBusy(kind);
    try {
      if (kind === 'accept') {
        const saved = await acceptCandidate(block.candidateId);
        toast.success(`"${saved.title}"을(를) 지식으로 저장했습니다.`);
      } else {
        await rejectCandidate(block.candidateId);
      }
    } catch (error) {
      toast.error(errorMessage(error, '후보를 처리하지 못했습니다.'));
    } finally {
      setBusy(null);
    }
  }

  const status = candidate?.status;
  return (
    <div className="kb-chat-candidate" data-status={status ?? 'unknown'}>
      <div className="kb-chat-candidate-head">
        <Sparkles size={13} aria-hidden />
        <span>지식 후보</span>
        <span className="kb-chat-candidate-type">
          <TypeIcon type={block.knowledgeType} size={12} /> {knowledgeTypeLabel(block.knowledgeType)}
        </span>
      </div>
      <strong>{block.title}</strong>
      <p>{block.summary}</p>
      {candidate?.similar && status === 'pending' && (
        <p className="kb-chat-candidate-similar">
          비슷한 지식: <button type="button" onClick={() => void openKnowledge(candidate.similar!.id)}>{candidate.similar.title}</button> ({percent(candidate.similar.score)})
        </p>
      )}
      <div className="kb-chat-candidate-actions">
        {status === 'pending' && (
          <>
            <Button size="xs" color="primary" loading={busy === 'accept'} disabled={!!busy} leftIcon={<Check size={12} />} onClick={() => void act('accept')}>
              저장
            </Button>
            <Button size="xs" variant="ghost" disabled={!!busy} onClick={openInbox}>
              검토함에서 보기
            </Button>
            <Button size="xs" variant="ghost" shape="square" aria-label="후보 버리기" title="버리기" loading={busy === 'reject'} disabled={!!busy} onClick={() => void act('reject')}>
              <X size={13} />
            </Button>
          </>
        )}
        {(status === 'accepted' || status === 'merged') && candidate?.knowledgeId && (
          <Button size="xs" variant="soft" color="success" leftIcon={<CircleCheck size={12} />} onClick={() => void openKnowledge(candidate.knowledgeId!)}>
            {status === 'merged' ? '기존 지식에 합침 · 열기' : '저장됨 · 열기'}
          </Button>
        )}
        {status === 'rejected' && <span className="three-column-caption">버린 후보입니다.</span>}
        {!candidate && <span className="three-column-caption">다른 공간의 후보이거나 지워졌습니다.</span>}
      </div>
    </div>
  );
}

/** 웹 검색·페이지 읽기 */
function WebCard({ block }: { block: Extract<TranscriptBlock, { type: 'web' }> }) {
  const search = block.kind === 'search';
  const Icon = search ? Globe : FileText;
  const results = (block.results ?? []).filter((item) => isWebUrl(item.url));
  return (
    <div className="kb-tool kb-web" data-status={block.error ? 'error' : 'ok'}>
      <div className="kb-tool-head">
        <Icon size={14} />
        <span className="kb-tool-label">{search ? '웹 검색' : '페이지 읽기'}</span>
        <span className="kb-tool-summary" title={block.query}>
          {block.query || (search ? '검색 중…' : '읽는 중…')}
        </span>
        {!block.results && !block.error && <Loader2 size={14} className="kb-spin" aria-label="실행 중" />}
        {block.error && <CircleX size={14} className="kb-text-error" aria-label="실패" />}
      </div>
      {results.length > 0 && (
        <ul className="kb-web-results">
          {results.slice(0, 5).map((item) => (
            <li key={item.url}>
              <a href={item.url} target="_blank" rel="noreferrer">
                {item.title}
              </a>
              <span>{hostOf(item.url)}</span>
            </li>
          ))}
        </ul>
      )}
      {block.error && <p className="kb-web-error">실패: {block.error}</p>}
    </div>
  );
}

function Sources({ sources }: { sources: WebSource[] }) {
  const links = sources.filter((item) => isWebUrl(item.url));
  if (!links.length) return null;
  return (
    <div className="kb-citations kb-citations--web" aria-label="웹 출처">
      <span>
        <Globe size={12} aria-hidden /> 웹 출처
      </span>
      <ol>
        {links.map((item) => (
          <li key={item.url}>
            <a href={item.url} target="_blank" rel="noreferrer" title={item.url}>
              {item.title}
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}
