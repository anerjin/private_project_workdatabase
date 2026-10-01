import { Card, ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@bricks/core';
import { useLayoutPanels } from '../layout/useLayoutPanels';
import { AgentChat } from '../features/agent/AgentChat';
import { ContentArea } from '../features/content/ContentArea';
import { IngestDialog } from '../features/ingest/IngestDialog';
import { KnowledgeMenu } from '../features/menu/KnowledgeMenu';
import { OptionsPanel } from '../features/options/OptionsPanel';
import './workspace.css';

/**
 * DOI-L-THREE-COLUMN 구성: 메뉴 | 콘텐츠 + (도킹 채팅) | 옵션.
 * 원본 ThreeColumnLayout.tsx(DOI CAD Workspace.tsx)의 패널·채팅 슬롯 구조를 그대로 따르고 내용만 지식베이스 기능으로 바꿨다.
 */
export function Workspace() {
  const { workspace, contentHeader, chatColumn, chatPanel, panelId, chatDocked, setChatDocked, desktop, initialChatWidth, rememberChatWidth } =
    useLayoutPanels();

  return (
    <Card ref={workspace} variant="border" className="three-column-demo kb-workspace" data-chat-docked={chatDocked}>
      <KnowledgeMenu />
      <ResizablePanelGroup className="three-column-content-panels" disabled={!chatDocked || !desktop} onLayoutChanged={rememberChatWidth}>
        <ResizablePanel id={`${panelId}-editor`} minSize={desktop ? 360 : 0} className="three-column-editor-panel">
          <section className="three-column-content" aria-label="지식 영역">
            <ContentArea headerRef={contentHeader} />
            <AgentChat dockContainer={chatColumn} onDockChange={setChatDocked} />
          </section>
        </ResizablePanel>
        {chatDocked && desktop && <ResizableHandle withHandle className="three-column-chat-divider" aria-label="채팅 컬럼 너비 조절" />}
        <ResizablePanel
          id={`${panelId}-chat`}
          panelRef={chatPanel}
          defaultSize={chatDocked ? initialChatWidth : 0}
          minSize={chatDocked && desktop ? 300 : 0}
          maxSize={chatDocked ? undefined : 0}
          className="three-column-chat-panel"
        >
          <div ref={chatColumn} className="three-column-chat-slot" role="complementary" aria-label="AI 에이전트 채팅" hidden={!chatDocked} />
        </ResizablePanel>
      </ResizablePanelGroup>
      <OptionsPanel />
      <IngestDialog />
    </Card>
  );
}
