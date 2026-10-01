import { Button, Progress } from '@bricks/core';
import { ArrowRight, CheckCheck, CircleAlert, FileText, Globe, Inbox, Library, MessagesSquare, Sparkles, Type, Upload } from 'lucide-react';
import { AUTHOR_LABEL, INGEST_STAGES, type IngestJob, type KnowledgeSummary } from '@doi-kb/shared';
import { timeAgo, withinDays } from '../../lib/format';
import { pendingCandidates, useWorkspace } from '../../state/workspace';
import { TypeIcon } from '../common/KnowledgeBits';

/** 공간 홈: 지식이 쌓이는 흐름, 숫자 요약, 최근·자주 쓰인·검토할 지식, 자료 수집 현황 */
export function HomeView() {
  const items = useWorkspace((state) => state.items);
  const candidates = useWorkspace((state) => state.candidates);
  const conversations = useWorkspace((state) => state.conversations);
  const jobs = useWorkspace((state) => state.ingestJobs);
  const loaded = useWorkspace((state) => state.loaded);
  const space = useWorkspace((state) => state.spaces.find((item) => item.id === state.spaceId));
  const openInbox = useWorkspace((state) => state.openInbox);
  const setIngestOpen = useWorkspace((state) => state.setIngestOpen);
  const pending = pendingCandidates(candidates).length;
  const verified = items.filter((item) => item.status === 'verified').length;
  const cited = items.reduce((sum, item) => sum + item.citedCount, 0);
  const addedThisWeek = items.filter((item) => withinDays(item.createdAt, 7)).length;
  const review = items.filter((item) => item.status === 'stale' || (item.status === 'draft' && !withinDays(item.updatedAt, 2)));
  const recent = items.slice(0, 5);
  const popular = [...items].filter((item) => item.citedCount > 0).sort((a, b) => b.citedCount - a.citedCount).slice(0, 5);

  if (!loaded) return <p className="kb-empty-note">불러오는 중…</p>;

  return (
    <div className="kb-home">
      <section className="kb-flow" aria-label="지식이 쌓이는 흐름">
        <FlowStep icon={MessagesSquare} label="대화 · 자료" value={`대화 ${conversations.length} · 수집 ${jobs.length}`} />
        <ArrowRight className="kb-flow-arrow" size={16} aria-hidden />
        <FlowStep icon={Sparkles} label="지식 후보" value={`대기 ${pending}`} highlight={pending > 0} onClick={openInbox} />
        <ArrowRight className="kb-flow-arrow" size={16} aria-hidden />
        <FlowStep icon={CheckCheck} label="사람이 확인" value={`확인됨 ${verified}`} />
        <ArrowRight className="kb-flow-arrow" size={16} aria-hidden />
        <FlowStep icon={Library} label="답변 근거로 사용" value={`인용 ${cited}회`} />
      </section>

      <section className="kb-stats" aria-label="요약">
        <Stat label="전체 지식" value={items.length} hint={addedThisWeek ? `이번 주 +${addedThisWeek}` : '이번 주 추가 없음'} />
        <Stat label="검토 대기 후보" value={pending} hint={pending ? 'AI가 찾은 후보를 확인하세요' : '모두 처리했습니다'} action={pending ? { label: '검토하기', onClick: openInbox } : undefined} />
        <Stat label="검토 필요" value={items.filter((item) => item.status === 'stale').length} hint="검토일이 지난 지식" tone={items.some((item) => item.status === 'stale') ? 'warning' : undefined} />
        <Stat label="AI 인용" value={cited} hint="답변 근거로 쓰인 횟수" suffix="회" />
      </section>

      {!items.length && (
        <section className="kb-getting-started">
          <h2>{space?.name ?? '이 공간'}에 첫 지식을 쌓아 보세요</h2>
          <ol>
            <li>오른쪽 채팅에 기억할 내용을 알려 주세요. 예: "회의실은 하루 전까지 예약해야 해. 기억해줘."</li>
            <li>[자료 추가]로 문서·웹 주소·텍스트를 올리면 AI가 지식 후보를 뽑습니다.</li>
            <li>검토 대기에서 후보를 확인해 저장하면, 다음 질문부터 AI가 근거로 씁니다.</li>
          </ol>
          <Button size="sm" variant="outline" leftIcon={<Upload size={14} />} onClick={() => setIngestOpen(true)}>
            자료 추가
          </Button>
        </section>
      )}

      {items.length > 0 && (
        <div className="kb-home-grid">
          <HomeList title="최근 바뀐 지식" items={recent} meta={(item) => `${AUTHOR_LABEL[item.author]} · ${timeAgo(item.updatedAt)}`} />
          <HomeList title="AI가 자주 쓴 지식" items={popular} empty="아직 답변 근거로 쓰인 지식이 없습니다." meta={(item) => `${item.citedCount}회 인용`} />
          <HomeList
            title="다시 확인할 지식"
            items={review}
            empty="다시 확인할 지식이 없습니다."
            meta={(item) => (item.status === 'stale' ? '검토일 지남' : `초안 · ${timeAgo(item.updatedAt)}`)}
            warn
          />
          <IngestList jobs={jobs} onAdd={() => setIngestOpen(true)} onReview={openInbox} />
        </div>
      )}
    </div>
  );
}

function FlowStep({ icon: Icon, label, value, highlight, onClick }: { icon: typeof Inbox; label: string; value: string; highlight?: boolean; onClick?: () => void }) {
  const content = (
    <>
      <Icon size={16} aria-hidden />
      <span className="kb-flow-label">{label}</span>
      <span className="kb-flow-value">{value}</span>
    </>
  );
  return onClick ? (
    <button type="button" className="kb-flow-step" data-highlight={highlight || undefined} onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className="kb-flow-step">{content}</div>
  );
}

function Stat({
  label,
  value,
  hint,
  suffix,
  tone,
  action,
}: {
  label: string;
  value: number;
  hint: string;
  suffix?: string;
  tone?: 'warning';
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="kb-stat" data-tone={tone}>
      <span className="kb-stat-label">{label}</span>
      <span className="kb-stat-value">
        {value.toLocaleString()}
        {suffix && <small>{suffix}</small>}
      </span>
      <span className="kb-stat-hint">{hint}</span>
      {action && (
        <Button size="xs" variant="link" className="kb-stat-action" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

function HomeList({
  title,
  items,
  meta,
  empty = '',
  warn,
}: {
  title: string;
  items: KnowledgeSummary[];
  meta: (item: KnowledgeSummary) => string;
  empty?: string;
  warn?: boolean;
}) {
  const openKnowledge = useWorkspace((state) => state.openKnowledge);
  return (
    <section className="kb-home-card">
      <h2>{title}</h2>
      {!items.length && <p className="three-column-caption">{empty}</p>}
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <button type="button" className="kb-home-row" onClick={() => void openKnowledge(item.id)} title={item.summary}>
              {warn && item.status === 'stale' ? <CircleAlert size={14} className="kb-text-warning" aria-label="검토 필요" /> : <TypeIcon type={item.type} />}
              <span className="kb-home-row-title">{item.title}</span>
              <span className="kb-home-row-meta">{meta(item)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

const KIND_ICON = { file: FileText, url: Globe, text: Type } as const;

function IngestList({ jobs, onAdd, onReview }: { jobs: IngestJob[]; onAdd: () => void; onReview: () => void }) {
  return (
    <section className="kb-home-card">
      <div className="kb-home-card-head">
        <h2>자료 수집</h2>
        <Button size="xs" variant="ghost" leftIcon={<Upload size={12} />} onClick={onAdd}>
          추가
        </Button>
      </div>
      {!jobs.length && <p className="three-column-caption">올린 자료가 없습니다. 문서·웹 주소·텍스트를 올리면 지식 후보를 뽑습니다.</p>}
      <ul>
        {jobs.slice(0, 5).map((job) => {
          const Icon = KIND_ICON[job.kind];
          const step = INGEST_STAGES.findIndex((stage) => stage.value === job.stage);
          return (
            <li key={job.id} className="kb-ingest-row">
              <div className="kb-ingest-head">
                <Icon size={14} aria-hidden />
                <span className="kb-home-row-title" title={job.name}>
                  {job.name}
                </span>
                <span className="kb-home-row-meta">{timeAgo(job.createdAt)}</span>
              </div>
              {job.stage === 'done' && (
                <p className="kb-ingest-result">
                  조각 {job.chunkCount ?? 0}개 · 후보 {job.candidateCount ?? 0}개
                  <Button size="xs" variant="link" onClick={onReview}>
                    검토 대기 보기
                  </Button>
                </p>
              )}
              {job.stage === 'error' && <p className="kb-ingest-result kb-text-error">{job.error ?? '수집하지 못했습니다.'}</p>}
              {step >= 0 && (
                <div className="kb-ingest-progress">
                  <Progress size="xs" color="primary" value={step + 0.5} max={INGEST_STAGES.length} aria-label="수집 진행" />
                  <span>
                    {INGEST_STAGES[step].label} 중… ({step + 1}/{INGEST_STAGES.length})
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
