// Ported from jake-doi/design_system apps/gallery/src/layouts/useChatWindow.ts @ 99d7ac2 (DOI-L-THREE-COLUMN) via jake-doi/cad. Submodule: anerjin/design_system @ f54ecbe (same layout code). Keep in sync when the layout changes upstream.
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from 'react';

type ChatRect = { left: number; top: number; width: number; height: number };
type Interaction = 'move' | 'resize' | 'icon';
const displayModeKey = 'doi-chat-display-mode';
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
function viewport() {
  const view = window.visualViewport;
  const left = (view?.offsetLeft ?? 0) + 16;
  const top = (view?.offsetTop ?? 0) + 16;
  return {
    left,
    top,
    right: left + (view?.width ?? window.innerWidth) - 32,
    bottom: top + (view?.height ?? window.innerHeight) - 32,
  };
}
function fit(rect: ChatRect): ChatRect {
  const bounds = viewport();
  const width = clamp(rect.width, Math.min(280, bounds.right - bounds.left), bounds.right - bounds.left);
  const height = clamp(rect.height, Math.min(300, bounds.bottom - bounds.top), bounds.bottom - bounds.top);
  return {
    width,
    height,
    left: clamp(rect.left, bounds.left, bounds.right - width),
    top: clamp(rect.top, bounds.top, bounds.bottom - height),
  };
}
function fitIcon(rect: ChatRect): ChatRect {
  const bounds = viewport();
  return {
    width: 48,
    height: 48,
    left: clamp(rect.left, bounds.left, bounds.right - 48),
    top: clamp(rect.top, bounds.top, bounds.bottom - 48),
  };
}
function adjust(rect: ChatRect, mode: Exclude<Interaction, 'icon'>, dx: number, dy: number): ChatRect {
  if (mode === 'move') return fit({ ...rect, left: rect.left + dx, top: rect.top + dy });
  const bounds = viewport();
  return fit({
    ...rect,
    width: clamp(rect.width + dx, Math.min(280, bounds.right - rect.left), bounds.right - rect.left),
    height: clamp(rect.height + dy, Math.min(300, bounds.bottom - rect.top), bounds.bottom - rect.top),
  });
}

// DOI CAD 변경(지식베이스도 같음): 채팅이 주 작업 영역이라 처음부터 열고(defaultOpen) 저장값이 없으면 도킹한다(defaultDocked).
// 도킹 상태에서 창 좌표가 없을 때 쓰는 기본 좌표(defaultRect)를 더했다.
function defaultRect(): ChatRect {
  const bounds = viewport();
  return fit({ left: bounds.right - 380, top: bounds.bottom - 560, width: 380, height: 560 });
}

export function useChatWindow({
  dockContainer,
  onDockChange,
  defaultOpen = false,
  defaultDocked = false,
}: {
  dockContainer?: RefObject<HTMLDivElement>;
  onDockChange?: (docked: boolean) => void;
  defaultOpen?: boolean;
  defaultDocked?: boolean;
}) {
  const [visibility, setVisibility] = useState<'closed' | 'open' | 'minimized'>(defaultOpen ? 'open' : 'closed');
  const open = visibility !== 'closed';
  const minimized = visibility === 'minimized';
  const [docked, setDocked] = useState(() => {
    if (!dockContainer) return false;
    try {
      const saved = localStorage.getItem(displayModeKey);
      return saved ? saved === 'docked' : defaultDocked;
    } catch {
      return defaultDocked;
    }
  });
  useEffect(() => {
    if (!dockContainer) return;
    try {
      localStorage.setItem(displayModeKey, docked ? 'docked' : 'floating');
    } catch {
      // Keep the current mode in memory when browser storage is unavailable.
    }
  }, [docked, dockContainer]);
  useLayoutEffect(() => {
    onDockChange?.(open && !minimized && docked);
  }, [open, minimized, docked, onDockChange]);
  const [iconRect, setIconRect] = useState<ChatRect | null>(null);
  const iconButton = useRef<HTMLButtonElement>(null);
  const iconOffset = useRef({ left: 0, top: 0 });
  const suppressIconClick = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<ChatRect | null>(null);
  const [interaction, setInteraction] = useState<Interaction | null>(null);
  useEffect(() => {
    if (!interaction) return;
    document.documentElement.dataset.layoutChatInteraction = interaction;
    return () => {
      delete document.documentElement.dataset.layoutChatInteraction;
    };
  }, [interaction]);
  const gesture = useRef<{
    mode: Interaction;
    x: number;
    y: number;
    rect: ChatRect;
    pointerId: number;
    element: HTMLElement;
    moved: boolean;
  } | null>(null);

  useEffect(
    () => () => {
      const active = gesture.current;
      gesture.current = null;
      if (active?.element.hasPointerCapture(active.pointerId))
        active.element.releasePointerCapture(active.pointerId);
    },
    [],
  );

  const finishInteraction = useCallback(() => {
    const active = gesture.current;
    gesture.current = null;
    if (active?.mode === 'icon' && active.moved) suppressIconClick.current = true;
    if (active?.element.hasPointerCapture(active.pointerId))
      active.element.releasePointerCapture(active.pointerId);
    setInteraction(null);
  }, []);

  useEffect(() => {
    const constrain = () => {
      finishInteraction();
      setRect((current) => (current ? fit(current) : current));
      setIconRect((current) => (current ? fitIcon(current) : current));
    };
    window.addEventListener('resize', constrain);
    window.visualViewport?.addEventListener('resize', constrain);
    window.visualViewport?.addEventListener('scroll', constrain);
    return () => {
      window.removeEventListener('resize', constrain);
      window.visualViewport?.removeEventListener('resize', constrain);
      window.visualViewport?.removeEventListener('scroll', constrain);
    };
  }, [finishInteraction]);

  function openChat() {
    const anchor = trigger.current?.getBoundingClientRect();
    if (!anchor) return;
    finishInteraction();
    setRect((current) =>
      fit(current ?? { left: anchor.right - 370, top: anchor.top - 492, width: 370, height: 480 }),
    );
    setVisibility('open');
  }

  function onOpenChange(next: boolean) {
    finishInteraction();
    setVisibility(next ? 'open' : 'closed');
  }

  function toggleDock() {
    if (!dockContainer) return;
    finishInteraction();
    if (docked) setRect((current) => (current ? fit(current) : defaultRect()));
    setDocked(!docked);
  }

  useEffect(() => {
    if (!open || minimized) return;
    const frame = requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [open, minimized, docked]);

  function minimizeChat(event: MouseEvent<HTMLButtonElement>) {
    const base = rect ?? defaultRect();
    if (!rect) setRect(base);
    finishInteraction();
    const button = event.currentTarget.getBoundingClientRect();
    const position = fitIcon({
      left: button.left + button.width / 2 - 24,
      top: button.top + button.height / 2 - 24,
      width: 48,
      height: 48,
    });
    iconOffset.current = { left: position.left - base.left, top: position.top - base.top };
    setIconRect(position);
    setVisibility('minimized');
  }

  function restoreChat() {
    if (!docked && iconRect && rect)
      setRect(
        fit({
          ...rect,
          left: iconRect.left - iconOffset.current.left,
          top: iconRect.top - iconOffset.current.top,
        }),
      );
    setVisibility('open');
  }

  function finishIconPointer() {
    const active = gesture.current;
    const tapped = active?.mode === 'icon' && !active.moved;
    finishInteraction();
    if (tapped) {
      suppressIconClick.current = true;
      restoreChat();
    }
  }

  function startInteraction(event: PointerEvent<HTMLElement>, mode: Interaction) {
    if (docked && mode !== 'icon') return;
    if (event.button !== 0 || (mode !== 'icon' && !popup.current) || gesture.current) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    const bounds = (mode === 'icon' ? event.currentTarget : popup.current!).getBoundingClientRect();
    if (mode === 'icon') suppressIconClick.current = false;
    const origin = { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height };
    gesture.current = {
      mode,
      rect: origin,
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
      element: event.currentTarget,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setInteraction(mode);
  }

  function moveInteraction(event: PointerEvent<HTMLElement>) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (active.mode === 'icon') {
      const dx = event.clientX - active.x;
      const dy = event.clientY - active.y;
      if (!active.moved && Math.hypot(dx, dy) < 4) return;
      active.moved = true;
      setIconRect(fitIcon({ ...active.rect, left: active.rect.left + dx, top: active.rect.top + dy }));
      return;
    }
    setRect(adjust(active.rect, active.mode, event.clientX - active.x, event.clientY - active.y));
  }

  function keyboardAdjust(event: KeyboardEvent<HTMLElement>, mode: Interaction) {
    if (docked && mode !== 'icon') return;
    const offsets: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    const step = event.shiftKey ? 40 : 10;
    if (mode === 'icon' && iconRect) {
      setIconRect(
        fitIcon({
          ...iconRect,
          left: iconRect.left + offset[0] * step,
          top: iconRect.top + offset[1] * step,
        }),
      );
    } else if (mode !== 'icon' && rect) setRect(adjust(rect, mode, offset[0] * step, offset[1] * step));
  }

  function interactionProps(mode: Interaction) {
    return {
      onPointerDown: (event: PointerEvent<HTMLElement>) => startInteraction(event, mode),
      onPointerMove: moveInteraction,
      onPointerUp: mode === 'icon' ? finishIconPointer : finishInteraction,
      onPointerCancel: () => {
        if (mode === 'icon') suppressIconClick.current = true;
        finishInteraction();
      },
      onLostPointerCapture: finishInteraction,
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => keyboardAdjust(event, mode),
    };
  }

  function onIconClick(event: MouseEvent<HTMLButtonElement>) {
    if (event.detail !== 0 && suppressIconClick.current) {
      suppressIconClick.current = false;
      return;
    }
    restoreChat();
  }

  return {
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
  };
}
