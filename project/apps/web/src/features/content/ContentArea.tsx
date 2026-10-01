import type { RefObject } from 'react';
import { Badge } from '@bricks/core';
import { plainText } from '@doi-kb/shared';
import { timeAgo } from '../../lib/format';
import { pendingCandidates, useWorkspace } from '../../state/workspace';
import { StatusBadge, TypeBadge } from '../common/KnowledgeBits';
import { HomeView } from './HomeView';
import { InboxView } from './InboxView';
import { KnowledgeView } from './KnowledgeView';

/** 가운데 영역: 헤더(공간 / 화면 이름 + 배지) · 본문(홈·검토 대기·지식) · 푸터(숫자 요약) */
export function ContentArea({ headerRef }: { headerRef: RefObject<HTMLDivElement> }) {
  const view = useWorkspace((state) => state.view);
  const fatal = useWorkspace((state) => state.fatal);

  return (
    <div className="three-column-content-scroll kb-content">
      <div ref={headerRef} className="three-column-content-top kb-content-top">
        <Breadcrumb />
        <HeaderBadges />
      </div>
      {fatal && (
        <div className="kb-banner" role="alert">
          {fatal}
        </div>
      )}
      <div className="kb-panels">
        {view.kind === 'home' && <HomeView />}
        {view.kind === 'inbox' && <InboxView />}
        {view.kind === 'knowledge' && <KnowledgeView />}
      </div>
      <footer className="three-column-content-footer kb-content-footer">
        <FooterStats />
      </footer>
    </div>
  );
}

function Breadcrumb() {
  const view = useWorkspace((state) => state.view);
  const detail = useWorkspace((state) => state.detail);
  const space = useWorkspace((state) => state.spaces.find((item) => item.id === state.spaceId));
  const openHome = useWorkspace((state) => state.openHome);
  const title = view.kind === 'home' ? '홈' : view.kind === 'inbox' ? '검토 대기' : (detail?.title ?? '불러오는 중…');
  return (
    <div className="kb-title">
      <button type="button" className="kb-crumb" onClick={openHome} title="공간 홈으로">
        {space?.name ?? '지식베이스'}
      </button>
      <span className="three-column-caption" aria-hidden>
        /
      </span>
      <h1 className="kb-title-name" title={title}>
        {title}
      </h1>
    </div>
  );
}

function HeaderBadges() {
  const view = useWorkspace((state) => state.view);
  const detail = useWorkspace((state) => state.detail);
  const space = useWorkspace((state) => state.spaces.find((item) => item.id === state.spaceId));
  const pending = useWorkspace((state) => pendingCandidates(state.candidates).length);
  if (view.kind === 'knowledge') {
    if (!detail) return null;
    return (
      <div className="three-column-badges">
        <TypeBadge type={detail.type} />
        <StatusBadge status={detail.status} />
        {detail.author !== 'user' && (
          <Badge variant="outline" size="sm" title="AI가 대화·자료에서 만든 지식">
            AI 작성
          </Badge>
        )}
        {!detail.searchable && (
          <Badge variant="outline" size="sm" title="AI 검색에서 빠져 있습니다">
            검색 제외
          </Badge>
        )}
      </div>
    );
  }
  return (
    <div className="three-column-badges">
      {space && (
        <Badge variant="outline" size="sm">
          {space.kind === 'team' ? '팀 공간' : '개인 공간'}
        </Badge>
      )}
      {view.kind === 'inbox' && (
        <Badge variant="soft" size="sm" color={pending ? 'primary' : undefined}>
          대기 {pending}
        </Badge>
      )}
    </div>
  );
}

function FooterStats() {
  const view = useWorkspace((state) => state.view);
  const detail = useWorkspace((state) => state.detail);
  const items = useWorkspace((state) => state.items);
  const candidates = useWorkspace((state) => state.candidates);
  const conversations = useWorkspace((state) => state.conversations);
  if (view.kind === 'knowledge') {
    if (!detail) return <span>&nbsp;</span>;
    return (
      <span className="kb-footer-stats">
        <span>{plainText(detail.body).replace(/\s+/g, '').length.toLocaleString()}자</span>
        <span>출처 {detail.sources.length}</span>
        <span>AI 인용 {detail.citedCount}회</span>
        <span>버전 {detail.versions.length}</span>
        <span>수정 {timeAgo(detail.updatedAt)}</span>
      </span>
    );
  }
  const pending = pendingCandidates(candidates).length;
  return (
    <span className="kb-footer-stats">
      <span>지식 {items.length}</span>
      <span>검토 대기 {pending}</span>
      <span>처리한 후보 {candidates.length - pending}</span>
      <span>대화 {conversations.length}</span>
    </span>
  );
}
