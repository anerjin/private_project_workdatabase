// Ported from jake-doi/design_system apps/gallery/src/layouts/useLayoutPanels.ts @ 99d7ac2 (DOI-L-THREE-COLUMN) via jake-doi/cad. Submodule: anerjin/design_system @ f54ecbe (same layout code). Keep in sync when the layout changes upstream.
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { usePanelRef, type ResizablePanelGroupProps } from '@bricks/core';

export function useLayoutPanels() {
  const contentHeader = useRef<HTMLDivElement>(null);
  const chatColumn = useRef<HTMLDivElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const chatWidth = useRef<number>();
  const chatPanel = usePanelRef();
  const [layoutWidth, setLayoutWidth] = useState(0);
  const [chatDocked, setChatDocked] = useState(false);
  const desktop = layoutWidth >= 960;
  const defaultChatWidth = layoutWidth < 1100 ? 280 : 320;
  useLayoutEffect(() => {
    const header = contentHeader.current;
    if (!header) return;
    const syncHeaderHeight = () => {
      chatColumn.current?.style.setProperty(
        '--layout-content-header-height',
        `${header.getBoundingClientRect().height}px`,
      );
    };
    syncHeaderHeight();
    const observer = new ResizeObserver(syncHeaderHeight);
    observer.observe(header, { box: 'border-box' });
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const container = workspace.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => setLayoutWidth(entry.contentRect.width));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (!chatDocked || !desktop) return;
    // Apply the saved pixel width after the grid and panels have been measured.
    const frame = requestAnimationFrame(() => {
      chatPanel.current?.resize(chatWidth.current ?? defaultChatWidth);
    });
    return () => cancelAnimationFrame(frame);
  }, [chatDocked, desktop, layoutWidth, defaultChatWidth, chatPanel]);
  const rememberChatWidth: NonNullable<ResizablePanelGroupProps['onLayoutChanged']> = (
    _layout,
    { isUserInteraction },
  ) => {
    if (isUserInteraction && chatDocked && desktop) chatWidth.current = chatPanel.current?.getSize().inPixels;
  };
  return {
    workspace,
    contentHeader,
    chatColumn,
    chatPanel,
    panelId,
    chatDocked,
    setChatDocked,
    desktop,
    initialChatWidth: chatWidth.current ?? defaultChatWidth,
    rememberChatWidth,
  };
}
