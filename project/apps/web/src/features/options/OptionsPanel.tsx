import { useEffect, useState } from 'react';
import { Button, Input, Modal, Range, Select, Toggle, toast } from '@bricks/core';
import { Copy, Download, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { KNOWLEDGE_STATUSES, KNOWLEDGE_TYPES, SEARCH_MODES, type KnowledgeDetail, type KnowledgePatch, type KnowledgeStatus, type KnowledgeType, type SearchHit, type SearchMode } from '@doi-kb/shared';
import { api, errorMessage } from '../../api/client';
import { downloadBlob, formatDate, percent, safeFileName, timeAgo } from '../../lib/format';
import { useWorkspace } from '../../state/workspace';
import { TypeIcon } from '../common/KnowledgeBits';

export function OptionsPanel() {
  const view = useWorkspace((state) => state.view);
  const detail = useWorkspace((state) => state.detail);
  return (
    <aside className="three-column-options kb-options" aria-label="옵션">
      <div className="three-column-region-title">
        <SlidersHorizontal size={16} />
        {view.kind === 'knowledge' ? '지식 정보' : '설정'}
      </div>
      {view.kind === 'knowledge' ? detail ? <KnowledgeOptions key={detail.id} detail={detail} /> : null : <WorkspaceOptions />}
    </aside>
  );
}

function KnowledgeOptions({ detail }: { detail: KnowledgeDetail }) {
  const saveKnowledge = useWorkspace((state) => state.saveKnowledge);
  const [tag, setTag] = useState('');

  async function update(patch: KnowledgePatch) {
    try {
      await saveKnowledge(detail.id, patch);
    } catch (error) {
      toast.error(errorMessage(error, '바꾸지 못했습니다.'));
    }
  }

  function addTag() {
    const next = tag.trim().replace(/^#/, '');
    setTag('');
    if (next && !detail.tags.includes(next)) void update({ tags: [...detail.tags, next] });
  }

  function exportMarkdown() {
    const front = [
      '---',
      `title: ${JSON.stringify(detail.title)}`,
      `type: ${detail.type}`,
      `status: ${detail.status}`,
      `tags: [${detail.tags.map((item) => JSON.stringify(item)).join(', ')}]`,
      `updated: ${detail.updatedAt}`,
      '---',
      '',
    ].join('\n');
    const sources = detail.sources.length
      ? `\n\n## 출처\n\n${detail.sources.map((source) => `- ${source.url ? `[${source.title}](${source.url})` : source.title}`).join('\n')}\n`
      : '\n';
    const text = `${front}# ${detail.title}\n\n${detail.summary ? `> ${detail.summary}\n\n` : ''}${detail.body}${sources}`;
    downloadBlob(new Blob([text], { type: 'text/markdown;charset=utf-8' }), `${safeFileName(detail.title)}.md`);
  }

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(`${detail.title}\n${detail.summary}`);
      toast.success('제목과 요약을 복사했습니다.');
    } catch {
      toast.error('클립보드에 복사하지 못했습니다.');
    }
  }

  return (
    <>
      <fieldset className="three-column-option-group">
        <legend>분류</legend>
        <label className="three-column-field">
          <span>유형</span>
          <Select
            size="sm"
            value={detail.type}
            options={KNOWLEDGE_TYPES.map(({ value, label }) => ({ value, label }))}
            onChange={(event) => void update({ type: event.target.value as KnowledgeType })}
          />
        </label>
        <label className="three-column-field">
          <span>상태</span>
          <Select size="sm" value={detail.status} options={KNOWLEDGE_STATUSES} onChange={(event) => void update({ status: event.target.value as KnowledgeStatus })} />
        </label>
        <label className="three-column-field">
          <span className="three-column-option-label">
            다시 확인할 날짜
            <span>{detail.reviewAt ? formatDate(detail.reviewAt) : '없음'}</span>
          </span>
          <Input size="sm" type="date" value={detail.reviewAt ?? ''} onChange={(event) => void update({ reviewAt: event.target.value })} />
        </label>
      </fieldset>

      <fieldset className="three-column-option-group">
        <legend>태그</legend>
        <div className="kb-tags">
          {detail.tags.map((item) => (
            <span key={item} className="kb-chip kb-chip--tag">
              <span className="kb-chip-text">#{item}</span>
              <button type="button" aria-label={`${item} 태그 빼기`} onClick={() => void update({ tags: detail.tags.filter((tagItem) => tagItem !== item) })}>
                <X size={11} />
              </button>
            </span>
          ))}
          {!detail.tags.length && <span className="three-column-caption">태그가 없습니다.</span>}
        </div>
        <Input
          size="sm"
          aria-label="태그 추가"
          placeholder="태그 입력 후 Enter"
          value={tag}
          onChange={(event) => setTag(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              addTag();
            }
          }}
          onBlur={addTag}
        />
      </fieldset>

      <fieldset className="three-column-option-group">
        <legend>AI 활용</legend>
        <label className="three-column-switch">
          <span>AI 검색에 포함</span>
          <Toggle size="sm" checked={detail.searchable} onChange={(event) => void update({ searchable: event.target.checked })} />
        </label>
        <dl className="kb-info">
          <dt>답변 근거로 쓰임</dt>
          <dd>{detail.citedCount}회</dd>
          <dt>마지막 인용</dt>
          <dd>{detail.lastCitedAt ? timeAgo(detail.lastCitedAt) : '-'}</dd>
          <dt>처음 만든 곳</dt>
          <dd>{detail.author === 'user' ? '직접 작성' : 'AI 후보 → 확인'}</dd>
        </dl>
      </fieldset>

      <RelatedKnowledge id={detail.id} updatedAt={detail.updatedAt} />

      <fieldset className="three-column-option-group">
        <legend>내보내기</legend>
        <div className="kb-exports">
          <Button size="xs" variant="outline" leftIcon={<Download size={12} />} onClick={exportMarkdown}>
            Markdown
          </Button>
          <Button size="xs" variant="outline" leftIcon={<Copy size={12} />} onClick={() => void copySummary()}>
            요약 복사
          </Button>
        </div>
      </fieldset>
    </>
  );
}

/** 의미가 가까운 지식. 서버가 붙으면 벡터 유사도로, 지금은 키워드 점수로 찾는다. */
function RelatedKnowledge({ id, updatedAt }: { id: string; updatedAt: string }) {
  const openKnowledge = useWorkspace((state) => state.openKnowledge);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .related(id, 5)
      .then((result) => alive && setHits(result))
      .catch(() => alive && setHits([]));
    return () => {
      alive = false;
    };
  }, [id, updatedAt]);

  return (
    <fieldset className="three-column-option-group">
      <legend>관련 지식</legend>
      {hits === null && <span className="three-column-caption">찾는 중…</span>}
      {hits?.length === 0 && <span className="three-column-caption">비슷한 지식이 없습니다.</span>}
      {!!hits?.length && (
        <ul className="kb-related">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button type="button" onClick={() => void openKnowledge(hit.id)} title={hit.snippet}>
                <TypeIcon type={hit.type} size={13} />
                <span className="kb-related-title">{hit.title}</span>
                <span className="kb-score">{percent(hit.score)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}

function WorkspaceOptions() {
  const settings = useWorkspace((state) => state.settings);
  const updateSettings = useWorkspace((state) => state.updateSettings);
  const space = useWorkspace((state) => state.spaces.find((item) => item.id === state.spaceId));
  const items = useWorkspace((state) => state.items);
  const aiStatus = useWorkspace((state) => state.aiStatus);
  const resetDemo = useWorkspace((state) => state.resetDemo);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function reset() {
    setResetting(true);
    try {
      await resetDemo();
      toast.success('예시 데이터로 되돌렸습니다.');
      setConfirmReset(false);
    } catch (error) {
      toast.error(errorMessage(error, '초기화하지 못했습니다.'));
    } finally {
      setResetting(false);
    }
  }

  return (
    <>
      <fieldset className="three-column-option-group">
        <legend>AI 지식 검색</legend>
        <label className="three-column-field">
          <span>검색 방식</span>
          <Select size="sm" value={settings.searchMode} options={SEARCH_MODES} onChange={(event) => updateSettings({ searchMode: event.target.value as SearchMode })} />
        </label>
        <label className="three-column-field">
          <span className="three-column-option-label">
            한 번에 찾을 지식 수<span>{settings.topK}개</span>
          </span>
          <Range size="xs" min={1} max={10} step={1} value={settings.topK} onChange={(event) => updateSettings({ topK: Number(event.target.value) })} />
        </label>
        <label className="three-column-switch">
          <span>대화에서 지식 후보 제안</span>
          <Toggle size="sm" checked={settings.autoPropose} onChange={(event) => updateSettings({ autoPropose: event.target.checked })} />
        </label>
        <p className="three-column-caption">데모에서는 키워드 검색만 동작합니다. 서버가 붙으면 혼합 검색(pgvector + 키워드)을 씁니다.</p>
      </fieldset>

      {space && (
        <fieldset className="three-column-option-group">
          <legend>공간</legend>
          <dl className="kb-info">
            <dt>이름</dt>
            <dd>{space.name}</dd>
            <dt>범위</dt>
            <dd>{space.kind === 'team' ? '팀 전체' : '나만'}</dd>
            <dt>지식</dt>
            <dd>{items.length}개</dd>
          </dl>
          <p className="three-column-caption">{space.description}</p>
        </fieldset>
      )}

      <fieldset className="three-column-option-group">
        <legend>연결 상태</legend>
        <dl className="kb-info">
          <dt>저장소</dt>
          <dd>브라우저 (데모)</dd>
          <dt>AI 모델</dt>
          <dd>{aiStatus?.configured ? '연결됨' : '미연결 · 예시 응답'}</dd>
          <dt>임베딩</dt>
          <dd>미연결</dd>
        </dl>
        <p className="three-column-caption">서버를 붙이면 PostgreSQL + pgvector(로컬은 PGlite)에 저장하고, 임베딩 모델로 의미 검색을 합니다.</p>
        <Button size="xs" variant="outline" leftIcon={<RotateCcw size={12} />} onClick={() => setConfirmReset(true)}>
          예시 데이터로 초기화
        </Button>
      </fieldset>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="예시 데이터로 초기화"
        size="sm"
        footer={
          <>
            <Button variant="surface" onClick={() => setConfirmReset(false)}>
              취소
            </Button>
            <Button color="error" loading={resetting} onClick={() => void reset()}>
              초기화
            </Button>
          </>
        }
      >
        <p>이 브라우저에 저장한 지식·후보·대화를 모두 지우고 처음 예시 데이터로 되돌립니다.</p>
      </Modal>
    </>
  );
}
