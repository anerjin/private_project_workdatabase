import { useMemo, useState } from 'react';
import { Badge, Button, Input, Select, toast } from '@bricks/core';
import { House, Inbox, Library, Moon, Plus, Search, Sun, Upload, User, Users } from 'lucide-react';
import { KNOWLEDGE_TYPES, rank, type KnowledgeSummary, type KnowledgeType } from '@doi-kb/shared';
import { errorMessage } from '../../api/client';
import { timeAgo } from '../../lib/format';
import { pendingCandidates, useWorkspace } from '../../state/workspace';
import { TypeIcon } from '../common/KnowledgeBits';

const TYPE_FILTERS = [{ value: 'all', label: '모든 유형' }, ...KNOWLEDGE_TYPES.map(({ value, label }) => ({ value, label }))];

export function KnowledgeMenu() {
  const spaces = useWorkspace((state) => state.spaces);
  const spaceId = useWorkspace((state) => state.spaceId);
  const setSpace = useWorkspace((state) => state.setSpace);
  const items = useWorkspace((state) => state.items);
  const loaded = useWorkspace((state) => state.loaded);
  const view = useWorkspace((state) => state.view);
  const candidates = useWorkspace((state) => state.candidates);
  const openHome = useWorkspace((state) => state.openHome);
  const openInbox = useWorkspace((state) => state.openInbox);
  const openKnowledge = useWorkspace((state) => state.openKnowledge);
  const createKnowledge = useWorkspace((state) => state.createKnowledge);
  const setIngestOpen = useWorkspace((state) => state.setIngestOpen);
  const settings = useWorkspace((state) => state.settings);
  const updateSettings = useWorkspace((state) => state.updateSettings);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<'all' | KnowledgeType>('all');
  const [creating, setCreating] = useState(false);
  const pending = pendingCandidates(candidates).length;
  const activeId = view.kind === 'knowledge' ? view.id : null;

  const filtered = useMemo(() => {
    const ofType = type === 'all' ? items : items.filter((item) => item.type === type);
    const term = query.trim();
    if (!term) return ofType;
    // 메뉴 검색도 AI와 같은 검색 규칙(한국어 두 글자 조각)을 쓴다. 짧은 검색어는 포함 여부로 찾는다.
    const ranked = rank(term, ofType.map(toRankDoc), { limit: 50, minScore: 0.3 }).map((hit) => ofType.find((item) => item.id === hit.id)!);
    const contains = ofType.filter((item) => `${item.title} ${item.tags.join(' ')}`.toLowerCase().includes(term.toLowerCase()));
    return [...new Map([...contains, ...ranked].map((item) => [item.id, item])).values()];
  }, [items, query, type]);

  async function create() {
    setCreating(true);
    try {
      await createKnowledge();
    } catch (error) {
      toast.error(errorMessage(error, '지식을 만들지 못했습니다.'));
    } finally {
      setCreating(false);
    }
  }

  function toggleTheme() {
    const theme = settings.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme === 'dark' ? 'bricks-dark' : 'bricks-light';
    try {
      localStorage.setItem('doi-kb-theme', theme);
    } catch {
      // 저장하지 못해도 이번 화면에는 적용된다.
    }
    updateSettings({ theme });
  }

  return (
    <nav className="three-column-menu kb-menu" aria-label="지식 메뉴">
      <div className="three-column-brand" aria-label="DOI 지식베이스">
        <span className="three-column-brand-mark">
          <Library size={17} />
        </span>
        <span>DOI 지식베이스</span>
        <Button
          className="kb-theme-toggle"
          size="xs"
          shape="circle"
          variant="ghost"
          aria-label={settings.theme === 'dark' ? '밝은 테마로' : '어두운 테마로'}
          title={settings.theme === 'dark' ? '밝은 테마로' : '어두운 테마로'}
          onClick={toggleTheme}
        >
          {settings.theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </Button>
      </div>

      <div className="kb-space-switch" role="radiogroup" aria-label="지식 공간">
        {spaces.map((space) => {
          const Icon = space.kind === 'team' ? Users : User;
          return (
            <button
              key={space.id}
              type="button"
              role="radio"
              aria-checked={space.id === spaceId}
              className="kb-space-tab"
              title={space.description}
              onClick={() => void setSpace(space.id)}
            >
              <Icon size={14} aria-hidden />
              <span>{space.name}</span>
            </button>
          );
        })}
      </div>

      <div className="kb-menu-actions">
        <Button size="sm" color="primary" onClick={create} loading={creating} leftIcon={<Plus size={15} />}>
          새 지식
        </Button>
        <Button size="sm" variant="outline" onClick={() => setIngestOpen(true)} leftIcon={<Upload size={15} />}>
          자료 추가
        </Button>
      </div>

      <div className="kb-nav">
        <Button
          size="sm"
          variant={view.kind === 'home' ? 'soft' : 'ghost'}
          color={view.kind === 'home' ? 'primary' : undefined}
          aria-current={view.kind === 'home' ? 'page' : undefined}
          className="kb-nav-item"
          onClick={openHome}
        >
          <House size={14} aria-hidden />
          <span className="kb-nav-label">홈</span>
        </Button>
        <Button
          size="sm"
          variant={view.kind === 'inbox' ? 'soft' : 'ghost'}
          color={view.kind === 'inbox' ? 'primary' : undefined}
          aria-current={view.kind === 'inbox' ? 'page' : undefined}
          aria-label={`검토 대기 ${pending}건`}
          className="kb-nav-item"
          onClick={openInbox}
        >
          <Inbox size={14} aria-hidden />
          <span className="kb-nav-label">검토 대기</span>
          {pending > 0 && (
            <Badge size="xs" color="primary" className="kb-nav-count">
              {pending}
            </Badge>
          )}
        </Button>
      </div>

      <Input
        size="sm"
        aria-label="지식 검색"
        placeholder="지식 검색"
        leftIcon={<Search size={14} />}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="kb-list-head">
        <p className="three-column-caption">지식 {items.length ? `· ${items.length}` : ''}</p>
        <Select
          size="xs"
          aria-label="유형으로 거르기"
          className="kb-type-filter"
          value={type}
          options={TYPE_FILTERS}
          onChange={(event) => setType(event.target.value as 'all' | KnowledgeType)}
        />
      </div>
      <div className="kb-knowledge-list" role="list" aria-label="지식 목록">
        {!loaded && <p className="three-column-caption">불러오는 중…</p>}
        {loaded && !items.length && (
          <p className="three-column-caption kb-menu-empty">
            아직 지식이 없습니다.
            <br />
            AI와 대화하거나 [자료 추가]로 문서를 올리면 지식 후보가 생깁니다.
          </p>
        )}
        {loaded && items.length > 0 && !filtered.length && <p className="three-column-caption kb-menu-empty">맞는 지식이 없습니다.</p>}
        {filtered.map((item) => (
          <KnowledgeItem key={item.id} item={item} active={item.id === activeId} onSelect={() => void openKnowledge(item.id)} />
        ))}
      </div>

      <div className="three-column-menu-note kb-menu-note">
        <span className="kb-connection" aria-live="polite">
          데모 모드 · 브라우저에 저장
        </span>
        <br />
        <span>DOI INC</span>
      </div>
    </nav>
  );
}

function KnowledgeItem({ item, active, onSelect }: { item: KnowledgeSummary; active: boolean; onSelect: () => void }) {
  return (
    <div role="listitem">
      <Button
        size="sm"
        variant={active ? 'soft' : 'ghost'}
        color={active ? 'primary' : undefined}
        aria-current={active ? 'page' : undefined}
        className="kb-knowledge-item"
        data-knowledge-id={item.id}
        title={item.summary || item.title}
        onClick={onSelect}
      >
        <TypeIcon type={item.type} className="kb-item-icon" />
        <span className="kb-item-title">{item.title}</span>
        <span className="kb-item-meta">
          {item.status === 'stale' && <span className="kb-dot kb-dot--warning" role="img" aria-label="검토 필요" />}
          {item.status === 'draft' && <span className="kb-dot kb-dot--muted" role="img" aria-label="초안" />}
          <time dateTime={item.updatedAt}>{timeAgo(item.updatedAt)}</time>
        </span>
      </Button>
    </div>
  );
}

function toRankDoc(item: KnowledgeSummary) {
  return { id: item.id, title: item.title, summary: item.summary, body: '', tags: item.tags };
}
