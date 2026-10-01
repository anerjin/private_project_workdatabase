import { useState } from 'react';
import { Badge, Button, Collapse, Input, Modal, Select, Textarea, toast } from '@bricks/core';
import { Check, CircleCheck, FileText, GitMerge, Globe, MessagesSquare, PencilLine, Sparkles, X } from 'lucide-react';
import { KNOWLEDGE_TYPES, type KnowledgeCandidate, type KnowledgeType } from '@doi-kb/shared';
import { errorMessage } from '../../api/client';
import { percent, timeAgo } from '../../lib/format';
import { Markdown } from '../../lib/Markdown';
import { pendingCandidates, useWorkspace } from '../../state/workspace';
import { TypeBadge } from '../common/KnowledgeBits';

type Filter = 'pending' | 'done';

const DONE_LABEL = { accepted: '저장함', merged: '기존 지식에 합침', rejected: '버림' } as const;
/** 이 점수 이상 겹치면 "합치기"를 권한다. 그 아래는 참고로만 보여준다. */
const MERGE_SCORE = 0.45;
const STRONG_SCORE = 0.6;

/** 검토 대기: AI가 대화·자료에서 찾은 지식 후보를 사람이 확인하는 곳. 확인한 것만 지식이 된다. */
export function InboxView() {
  const candidates = useWorkspace((state) => state.candidates);
  const [filter, setFilter] = useState<Filter>('pending');
  const [editing, setEditing] = useState<KnowledgeCandidate | null>(null);
  const pending = pendingCandidates(candidates);
  const done = candidates.filter((item) => item.status !== 'pending');
  const list = filter === 'pending' ? pending : done;

  return (
    <div className="kb-inbox">
      <div className="kb-inbox-head">
        <p className="kb-lead">
          AI가 대화와 자료에서 찾은 <strong>지식 후보</strong>입니다. 확인해서 저장한 것만 지식베이스에 들어가고, 다음 질문부터 답변 근거로 쓰입니다.
        </p>
        <div className="kb-segment" role="radiogroup" aria-label="후보 상태">
          {(
            [
              ['pending', `대기 ${pending.length}`],
              ['done', `처리함 ${done.length}`],
            ] as [Filter, string][]
          ).map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={filter === value} className="kb-segment-item" onClick={() => setFilter(value)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {!list.length && (
        <div className="kb-empty">
          <CircleCheck size={28} aria-hidden />
          <strong>{filter === 'pending' ? '검토할 후보가 없습니다' : '처리한 후보가 없습니다'}</strong>
          <p>채팅에서 "기억해줘"라고 하거나 [자료 추가]로 문서를 올리면 후보가 생깁니다.</p>
        </div>
      )}
      <div className="kb-candidates">
        {list.map((candidate) => (
          <CandidateCard key={candidate.id} candidate={candidate} onEdit={() => setEditing(candidate)} />
        ))}
      </div>
      {editing && <CandidateEditor candidate={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CandidateCard({ candidate, onEdit }: { candidate: KnowledgeCandidate; onEdit: () => void }) {
  const acceptCandidate = useWorkspace((state) => state.acceptCandidate);
  const mergeCandidate = useWorkspace((state) => state.mergeCandidate);
  const rejectCandidate = useWorkspace((state) => state.rejectCandidate);
  const openKnowledge = useWorkspace((state) => state.openKnowledge);
  const setConversation = useWorkspace((state) => state.setConversation);
  const [busy, setBusy] = useState<'accept' | 'merge' | 'reject' | null>(null);
  const pending = candidate.status === 'pending';
  const OriginIcon = candidate.origin.kind === 'conversation' ? MessagesSquare : candidate.sources.some((source) => source.kind === 'web') ? Globe : FileText;

  async function run(kind: 'accept' | 'merge' | 'reject') {
    setBusy(kind);
    try {
      if (kind === 'accept') {
        const saved = await acceptCandidate(candidate.id);
        toast.success(`"${saved.title}"을(를) 지식으로 저장했습니다.`);
      } else if (kind === 'merge' && candidate.similar) {
        const merged = await mergeCandidate(candidate.id, candidate.similar.id);
        toast.success(`"${merged.title}"에 합쳤습니다. 새 버전이 초안으로 남았습니다.`);
      } else {
        await rejectCandidate(candidate.id);
      }
    } catch (error) {
      toast.error(errorMessage(error, '후보를 처리하지 못했습니다.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="kb-candidate" data-status={candidate.status} aria-label={`지식 후보: ${candidate.title}`}>
      <header className="kb-candidate-head">
        <TypeBadge type={candidate.type} />
        <h2>{candidate.title}</h2>
      </header>
      <div className="kb-candidate-origin">
        <OriginIcon size={12} aria-hidden />
        {candidate.origin.kind === 'conversation' && candidate.origin.conversationId ? (
          <button type="button" onClick={() => setConversation(candidate.origin.conversationId!)} title="채팅에서 이 대화 열기">
            대화 "{candidate.origin.label}"
          </button>
        ) : (
          <span>자료 "{candidate.origin.label}"</span>
        )}
        <span>· {timeAgo(candidate.createdAt)}</span>
        {candidate.tags.map((tag) => (
          <span key={tag} className="kb-tag">
            #{tag}
          </span>
        ))}
      </div>
      <p className="kb-candidate-summary">{candidate.summary}</p>
      {candidate.body && (
        <Collapse className="kb-candidate-body" title="내용 보기" icon="arrow" variant="bordered">
          <Markdown>{candidate.body}</Markdown>
        </Collapse>
      )}
      {pending && candidate.similar && (
        <div className="kb-similar" data-strong={candidate.similar.score >= STRONG_SCORE || undefined}>
          <span>
            비슷한 지식{' '}
            <button type="button" onClick={() => void openKnowledge(candidate.similar!.id)}>
              {candidate.similar.title}
            </button>{' '}
            · 겹침 {percent(candidate.similar.score)}
          </span>
          {candidate.similar.score >= STRONG_SCORE && <span className="three-column-caption">같은 내용이면 새로 만들지 말고 합치세요.</span>}
        </div>
      )}
      <footer className="kb-candidate-actions">
        {pending ? (
          <>
            <Button size="sm" color="primary" leftIcon={<Check size={14} />} loading={busy === 'accept'} disabled={!!busy} onClick={() => void run('accept')}>
              저장
            </Button>
            {candidate.similar && candidate.similar.score >= MERGE_SCORE && (
              <Button size="sm" variant="outline" leftIcon={<GitMerge size={14} />} loading={busy === 'merge'} disabled={!!busy} onClick={() => void run('merge')}>
                기존 지식에 합치기
              </Button>
            )}
            <Button size="sm" variant="ghost" leftIcon={<PencilLine size={14} />} disabled={!!busy} onClick={onEdit}>
              고쳐서 저장
            </Button>
            <Button size="sm" variant="ghost" leftIcon={<X size={14} />} loading={busy === 'reject'} disabled={!!busy} onClick={() => void run('reject')} className="kb-push-right">
              버리기
            </Button>
          </>
        ) : (
          <>
            <Badge variant="soft" size="sm" color={candidate.status === 'rejected' ? undefined : 'success'}>
              {DONE_LABEL[candidate.status as keyof typeof DONE_LABEL]}
            </Badge>
            {candidate.knowledgeId && (
              <Button size="xs" variant="link" onClick={() => void openKnowledge(candidate.knowledgeId!)}>
                지식 열기
              </Button>
            )}
          </>
        )}
      </footer>
    </article>
  );
}

function CandidateEditor({ candidate, onClose }: { candidate: KnowledgeCandidate; onClose: () => void }) {
  const acceptCandidate = useWorkspace((state) => state.acceptCandidate);
  const openKnowledge = useWorkspace((state) => state.openKnowledge);
  const [title, setTitle] = useState(candidate.title);
  const [summary, setSummary] = useState(candidate.summary);
  const [body, setBody] = useState(candidate.body);
  const [type, setType] = useState<KnowledgeType>(candidate.type);
  const [tags, setTags] = useState(candidate.tags.join(', '));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const saved = await acceptCandidate(candidate.id, {
        title,
        summary,
        body,
        type,
        tags: tags.split(/[,\s]+/).filter(Boolean),
      });
      toast.success(`"${saved.title}"을(를) 지식으로 저장했습니다.`);
      onClose();
      void openKnowledge(saved.id);
    } catch (error) {
      toast.error(errorMessage(error, '저장하지 못했습니다.'));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        <span className="kb-modal-title">
          <Sparkles size={16} /> 지식 후보 고쳐서 저장
        </span>
      }
      footer={
        <>
          <Button variant="surface" onClick={onClose}>
            취소
          </Button>
          <Button color="primary" loading={saving} disabled={!title.trim()} onClick={() => void save()}>
            저장
          </Button>
        </>
      }
    >
      <div className="kb-form">
        <label className="three-column-field">
          <span>제목</span>
          <Input size="sm" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <div className="kb-form-row">
          <label className="three-column-field">
            <span>유형</span>
            <Select size="sm" value={type} options={KNOWLEDGE_TYPES.map(({ value, label }) => ({ value, label }))} onChange={(event) => setType(event.target.value as KnowledgeType)} />
          </label>
          <label className="three-column-field">
            <span>태그 (쉼표로 구분)</span>
            <Input size="sm" value={tags} onChange={(event) => setTags(event.target.value)} />
          </label>
        </div>
        <label className="three-column-field">
          <span>요약 (검색 결과에 보입니다)</span>
          <Textarea size="sm" rows={2} className="kb-summary-input" value={summary} onChange={(event) => setSummary(event.target.value)} />
        </label>
        <label className="three-column-field">
          <span>본문 (마크다운)</span>
          <Textarea size="sm" rows={10} className="kb-mono" value={body} onChange={(event) => setBody(event.target.value)} />
        </label>
      </div>
    </Modal>
  );
}
