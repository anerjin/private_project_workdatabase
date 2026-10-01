import { useEffect, useState } from 'react';
import { Badge, Button, Input, Modal, Select, Tabs, Textarea, toast } from '@bricks/core';
import { Eye, FileText, Globe, History, Link2, MessagesSquare, PencilLine, PenLine, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { AUTHOR_LABEL, type KnowledgeDetail, type KnowledgeSource, type KnowledgeVersion, type SourceKind } from '@doi-kb/shared';
import { errorMessage } from '../../api/client';
import { formatDateTime, hostOf, isWebUrl, timeAgo } from '../../lib/format';
import { Markdown } from '../../lib/Markdown';
import { useWorkspace } from '../../state/workspace';

type TabKey = 'doc' | 'sources' | 'history';

export function KnowledgeView() {
  const detail = useWorkspace((state) => state.detail);
  const loading = useWorkspace((state) => state.detailLoading);
  const editing = useWorkspace((state) => !!state.detail && state.editingId === state.detail.id);
  const setEditing = useWorkspace((state) => state.setEditing);
  const removeKnowledge = useWorkspace((state) => state.removeKnowledge);
  const [tab, setTab] = useState<TabKey>('doc');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 다른 지식을 열면 문서 탭으로 돌아간다.
  useEffect(() => setTab('doc'), [detail?.id]);
  useEffect(() => {
    if (editing) setTab('doc');
  }, [editing]);

  if (!detail) return <p className="kb-empty-note">{loading ? '불러오는 중…' : '지식을 찾지 못했습니다.'}</p>;

  async function remove() {
    if (!detail) return;
    setDeleting(true);
    try {
      await removeKnowledge(detail.id);
      toast.success(`"${detail.title}"을(를) 삭제했습니다.`);
    } catch (error) {
      toast.error(errorMessage(error, '삭제하지 못했습니다.'));
      setDeleting(false);
    }
  }

  return (
    <div className="kb-knowledge">
      <div className="kb-tabbar">
        <Tabs
          className="kb-tabs"
          size="sm"
          variant="border"
          activeKey={tab}
          onChange={(key) => setTab(key as TabKey)}
          contentClassName="hidden"
          items={[
            { key: 'doc', label: '문서', icon: <FileText size={14} />, content: null },
            { key: 'sources', label: '출처', icon: <Link2 size={14} />, content: null, disabled: editing, badge: <span className="kb-tab-count">{detail.sources.length}</span> },
            { key: 'history', label: '기록', icon: <History size={14} />, content: null, disabled: editing, badge: <span className="kb-tab-count">{detail.versions.length}</span> },
          ]}
        />
        {!editing && (
          <div className="kb-tab-actions">
            <Button size="xs" variant="ghost" leftIcon={<PencilLine size={13} />} onClick={() => setEditing(detail.id)}>
              편집
            </Button>
            <Button size="xs" variant="ghost" shape="square" aria-label="지식 삭제" title="삭제" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={13} />
            </Button>
          </div>
        )}
      </div>

      <div className="kb-panel kb-panel--scroll">
        {tab === 'doc' && (editing ? <KnowledgeEditor key={detail.id} detail={detail} onDone={() => setEditing(null)} /> : <DocPanel detail={detail} />)}
        {tab === 'sources' && <SourcesPanel detail={detail} />}
        {tab === 'history' && <HistoryPanel detail={detail} />}
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="지식 삭제"
        size="sm"
        footer={
          <>
            <Button variant="surface" onClick={() => setConfirmDelete(false)}>
              취소
            </Button>
            <Button color="error" loading={deleting} onClick={() => void remove()}>
              삭제
            </Button>
          </>
        }
      >
        <p>"{detail.title}"을(를) 삭제합니다. 버전 기록과 출처도 함께 지워지고, AI가 더 이상 근거로 쓰지 않습니다.</p>
      </Modal>
    </div>
  );
}

function DocPanel({ detail }: { detail: KnowledgeDetail }) {
  const setEditing = useWorkspace((state) => state.setEditing);
  const last = detail.versions.at(-1);
  return (
    <article className="kb-doc">
      {detail.summary && <p className="kb-doc-summary">{detail.summary}</p>}
      {detail.body.trim() ? (
        <Markdown className="kb-markdown kb-markdown--doc">{detail.body}</Markdown>
      ) : (
        <div className="kb-empty">
          <PenLine size={24} aria-hidden />
          <strong>본문이 비어 있습니다</strong>
          <p>직접 쓰거나, 채팅에 내용을 알려 주고 "이 지식에 정리해줘"라고 부탁하세요.</p>
          <Button size="sm" variant="outline" onClick={() => setEditing(detail.id)}>
            본문 쓰기
          </Button>
        </div>
      )}
      {last && (
        <p className="kb-doc-meta">
          v{last.id} · {AUTHOR_LABEL[last.author]} · {last.note} · {timeAgo(last.createdAt)}
        </p>
      )}
    </article>
  );
}

function KnowledgeEditor({ detail, onDone }: { detail: KnowledgeDetail; onDone: () => void }) {
  const saveKnowledge = useWorkspace((state) => state.saveKnowledge);
  const [title, setTitle] = useState(detail.title);
  const [summary, setSummary] = useState(detail.summary);
  const [body, setBody] = useState(detail.body);
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirty = title !== detail.title || summary !== detail.summary || body !== detail.body;

  async function save() {
    setSaving(true);
    try {
      await saveKnowledge(detail.id, { title, summary, body }, note);
      toast.success('저장했습니다. 새 버전이 기록에 남았습니다.');
      onDone();
    } catch (error) {
      toast.error(errorMessage(error, '저장하지 못했습니다.'));
      setSaving(false);
    }
  }

  return (
    <form
      className="kb-editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (dirty) void save();
      }}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 's') {
          event.preventDefault();
          if (dirty && !saving) void save();
        }
        if (event.key === 'Escape' && !dirty) onDone();
      }}
    >
      <label className="three-column-field">
        <span>제목</span>
        <Input size="sm" value={title} maxLength={120} autoFocus onFocus={(event) => detail.title === '새 지식' && event.target.select()} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label className="three-column-field">
        <span>요약 — 검색 결과와 AI 답변에 먼저 보이는 한두 문장</span>
        <Textarea size="sm" rows={2} className="kb-summary-input" value={summary} maxLength={400} onChange={(event) => setSummary(event.target.value)} />
      </label>
      <div className="three-column-field">
        <span className="kb-editor-label">
          본문 (마크다운)
          <Button type="button" size="xs" variant={preview ? 'soft' : 'ghost'} color={preview ? 'primary' : undefined} leftIcon={<Eye size={12} />} aria-pressed={preview} onClick={() => setPreview(!preview)}>
            미리보기
          </Button>
        </span>
        {preview ? (
          <div className="kb-editor-preview">{body.trim() ? <Markdown>{body}</Markdown> : <p className="three-column-caption">본문이 비어 있습니다.</p>}</div>
        ) : (
          <Textarea size="sm" rows={14} className="kb-mono" aria-label="본문" value={body} onChange={(event) => setBody(event.target.value)} />
        )}
      </div>
      <label className="three-column-field">
        <span>변경 메모 (선택) — 기록 탭에 남습니다</span>
        <Input size="sm" value={note} maxLength={120} placeholder="예: 2026년 기준으로 금액 수정" onChange={(event) => setNote(event.target.value)} />
      </label>
      <div className="kb-editor-actions">
        <span className="three-column-caption">Ctrl+S 저장</span>
        <Button type="button" variant="surface" size="sm" onClick={onDone}>
          {dirty ? '취소' : '닫기'}
        </Button>
        <Button type="submit" color="primary" size="sm" loading={saving} disabled={!dirty || !title.trim()}>
          저장
        </Button>
      </div>
    </form>
  );
}

const SOURCE_META: Record<SourceKind, { label: string; icon: typeof Globe }> = {
  web: { label: '웹', icon: Globe },
  file: { label: '파일', icon: FileText },
  conversation: { label: '대화', icon: MessagesSquare },
  manual: { label: '직접 입력', icon: PenLine },
};

function SourcesPanel({ detail }: { detail: KnowledgeDetail }) {
  const addSource = useWorkspace((state) => state.addSource);
  const removeSource = useWorkspace((state) => state.removeSource);
  const setConversation = useWorkspace((state) => state.setConversation);
  const [kind, setKind] = useState<Exclude<SourceKind, 'conversation'>>('web');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const urlInvalid = kind === 'web' && !!url && !isWebUrl(url);

  async function add() {
    setAdding(true);
    try {
      await addSource(detail.id, { kind, title: title.trim() || (kind === 'web' ? hostOf(url) || url : '출처'), url: kind === 'web' ? url.trim() : undefined });
      setTitle('');
      setUrl('');
    } catch (error) {
      toast.error(errorMessage(error, '출처를 더하지 못했습니다.'));
    } finally {
      setAdding(false);
    }
  }

  async function remove(source: KnowledgeSource) {
    try {
      await removeSource(detail.id, source.id);
    } catch (error) {
      toast.error(errorMessage(error, '출처를 빼지 못했습니다.'));
    }
  }

  return (
    <div className="kb-sources">
      <p className="kb-lead">출처는 이 지식이 맞는지 다시 확인할 때 쓰입니다. AI 답변에도 함께 보입니다.</p>
      {!detail.sources.length && <p className="three-column-caption">아직 출처가 없습니다.</p>}
      <ul className="kb-source-list">
        {detail.sources.map((source) => {
          const meta = SOURCE_META[source.kind];
          return (
            <li key={source.id}>
              <meta.icon size={15} aria-hidden className="kb-source-icon" />
              <div className="kb-source-main">
                {source.kind === 'web' && isWebUrl(source.url) ? (
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.title}
                  </a>
                ) : source.kind === 'conversation' && source.conversationId ? (
                  <button type="button" className="kb-linklike" onClick={() => setConversation(source.conversationId!)}>
                    {source.title}
                  </button>
                ) : (
                  <span>{source.title}</span>
                )}
                <span className="kb-source-meta">
                  {meta.label}
                  {source.url && isWebUrl(source.url) ? ` · ${hostOf(source.url)}` : ''} · {timeAgo(source.addedAt)}
                </span>
                {source.excerpt && <blockquote>{source.excerpt}</blockquote>}
              </div>
              <Button size="xs" variant="ghost" shape="square" aria-label={`${source.title} 출처 빼기`} title="출처 빼기" onClick={() => void remove(source)}>
                <Trash2 size={13} />
              </Button>
            </li>
          );
        })}
      </ul>
      <form
        className="kb-source-form"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <Select
          size="sm"
          aria-label="출처 종류"
          value={kind}
          options={[
            { value: 'web', label: '웹 주소' },
            { value: 'file', label: '파일' },
            { value: 'manual', label: '직접 입력' },
          ]}
          onChange={(event) => setKind(event.target.value as Exclude<SourceKind, 'conversation'>)}
        />
        {kind === 'web' && (
          <Input size="sm" aria-label="웹 주소" placeholder="https://" value={url} color={urlInvalid ? 'error' : undefined} onChange={(event) => setUrl(event.target.value)} />
        )}
        <Input size="sm" aria-label="출처 이름" placeholder={kind === 'web' ? '이름 (비우면 주소)' : kind === 'file' ? '파일 이름' : '예: 재무팀 김OO 확인'} value={title} onChange={(event) => setTitle(event.target.value)} />
        <Button type="submit" size="sm" variant="outline" leftIcon={<Plus size={14} />} loading={adding} disabled={kind === 'web' ? !isWebUrl(url) : !title.trim()}>
          출처 추가
        </Button>
      </form>
    </div>
  );
}

function HistoryPanel({ detail }: { detail: KnowledgeDetail }) {
  const restoreVersion = useWorkspace((state) => state.restoreVersion);
  const [viewing, setViewing] = useState<KnowledgeVersion | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);
  const latest = detail.versions.at(-1)?.id;

  async function restore(version: number) {
    setRestoring(version);
    try {
      await restoreVersion(detail.id, version);
      toast.success(`v${version} 내용으로 되돌렸습니다(새 버전으로 기록).`);
      setViewing(null);
    } catch (error) {
      toast.error(errorMessage(error, '되돌리지 못했습니다.'));
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="kb-history-wrap">
      <table className="kb-history">
        <thead>
          <tr>
            <th scope="col">버전</th>
            <th scope="col">시각</th>
            <th scope="col">작성</th>
            <th scope="col">메모</th>
            <th scope="col">
              <span className="sr-only">동작</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {[...detail.versions].reverse().map((version) => (
            <tr key={version.id}>
              <td>
                v{version.id}
                {version.id === latest && (
                  <Badge size="xs" variant="soft" color="primary">
                    현재
                  </Badge>
                )}
              </td>
              <td>{formatDateTime(version.createdAt)}</td>
              <td>{AUTHOR_LABEL[version.author]}</td>
              <td className="kb-history-note">{version.note}</td>
              <td>
                <div className="kb-history-actions">
                  <Button size="xs" variant="ghost" onClick={() => setViewing(version)}>
                    보기
                  </Button>
                  {version.id !== latest && (
                    <Button size="xs" variant="ghost" leftIcon={<RotateCcw size={12} />} loading={restoring === version.id} onClick={() => void restore(version.id)}>
                      되돌리기
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        size="lg"
        title={viewing ? `v${viewing.id} · ${viewing.title}` : ''}
        footer={
          viewing && viewing.id !== latest ? (
            <>
              <Button variant="surface" onClick={() => setViewing(null)}>
                닫기
              </Button>
              <Button color="primary" leftIcon={<RotateCcw size={14} />} loading={restoring === viewing.id} onClick={() => void restore(viewing.id)}>
                이 버전으로 되돌리기
              </Button>
            </>
          ) : null
        }
      >
        {viewing && (
          <div className="kb-version-view">
            <p className="three-column-caption">
              {formatDateTime(viewing.createdAt)} · {AUTHOR_LABEL[viewing.author]} · {viewing.note}
            </p>
            {viewing.summary && <p className="kb-doc-summary">{viewing.summary}</p>}
            <Markdown className="kb-markdown kb-markdown--doc">{viewing.body || '_본문 없음_'}</Markdown>
          </div>
        )}
      </Modal>
    </div>
  );
}
