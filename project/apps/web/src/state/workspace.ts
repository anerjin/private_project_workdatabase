import { create } from 'zustand';
import type {
  AiStatus,
  ChatModel,
  ConversationSummary,
  IngestInput,
  IngestJob,
  KnowledgeCandidate,
  KnowledgeDetail,
  KnowledgeInput,
  KnowledgePatch,
  KnowledgeSource,
  KnowledgeSummary,
  SearchMode,
  Space,
  WorkspaceEvent,
} from '@doi-kb/shared';
import { api, ApiError } from '../api/client';

/** 가운데 콘텐츠 영역에 보이는 화면 */
export type View = { kind: 'home' } | { kind: 'inbox' } | { kind: 'knowledge'; id: string };

export interface Settings {
  theme: 'light' | 'dark';
  /** AI가 지식을 찾을 때 쓰는 방식 */
  searchMode: SearchMode;
  /** AI가 한 번에 가져올 지식 수 */
  topK: number;
  /** 대화에서 지식 후보를 자동으로 제안 */
  autoPropose: boolean;
}

interface WorkspaceState {
  loaded: boolean;
  /** 처음 불러오기 실패 등 화면 전체에 보일 오류 */
  fatal: string | null;
  spaces: Space[];
  spaceId: string;
  items: KnowledgeSummary[];
  /** 이 공간의 모든 후보(처리한 것 포함 — 채팅 카드가 상태를 보여준다) */
  candidates: KnowledgeCandidate[];
  ingestJobs: IngestJob[];
  conversations: ConversationSummary[];
  view: View;
  detail: KnowledgeDetail | null;
  detailLoading: boolean;
  /** 편집 중인 지식 */
  editingId: string | null;
  conversationId: string | null;
  aiStatus: AiStatus | null;
  aiModels: ChatModel[];
  settings: Settings;
  ingestOpen: boolean;

  init(): () => void;
  setSpace(id: string): Promise<void>;
  openHome(): void;
  openInbox(): void;
  openKnowledge(id: string, options?: { edit?: boolean }): Promise<void>;
  createKnowledge(input?: Partial<KnowledgeInput>): Promise<KnowledgeDetail>;
  saveKnowledge(id: string, patch: KnowledgePatch, note?: string): Promise<void>;
  removeKnowledge(id: string): Promise<void>;
  restoreVersion(id: string, version: number): Promise<void>;
  addSource(id: string, source: Omit<KnowledgeSource, 'id' | 'addedAt'>): Promise<void>;
  removeSource(id: string, sourceId: string): Promise<void>;
  acceptCandidate(id: string, edits?: Partial<KnowledgeInput>): Promise<KnowledgeDetail>;
  mergeCandidate(id: string, targetId: string): Promise<KnowledgeDetail>;
  rejectCandidate(id: string): Promise<void>;
  startIngest(input: IngestInput): Promise<void>;
  setConversation(id: string | null): void;
  setEditing(id: string | null): void;
  setIngestOpen(open: boolean): void;
  updateSettings(patch: Partial<Settings>): void;
  resetDemo(): Promise<void>;
}

const SPACE_KEY = 'doi-kb-space';
const VIEW_KEY = 'doi-kb-view';
const SETTINGS_KEY = 'doi-kb-settings';
const conversationKey = (spaceId: string) => `doi-kb-conversation:${spaceId}`;

const DEFAULT_SETTINGS: Omit<Settings, 'theme'> = { searchMode: 'hybrid', topK: 5, autoPropose: true };

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function persist(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // 저장소가 막혀 있어도 화면은 동작해야 한다.
  }
}

function loadSettings(): Settings {
  const theme = document.documentElement.dataset.theme === 'bricks-dark' ? 'dark' : 'light';
  try {
    const saved = JSON.parse(read(SETTINGS_KEY) ?? '{}') as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...saved, theme };
  } catch {
    return { ...DEFAULT_SETTINGS, theme };
  }
}

function readView(): View {
  const saved = read(VIEW_KEY);
  if (saved === 'inbox') return { kind: 'inbox' };
  if (saved?.startsWith('k:')) return { kind: 'knowledge', id: saved.slice(2) };
  return { kind: 'home' };
}

function saveView(view: View) {
  persist(VIEW_KEY, view.kind === 'knowledge' ? `k:${view.id}` : view.kind);
}

export const useWorkspace = create<WorkspaceState>((set, get) => {
  /** 공간이 바뀌는 사이 늦게 도착한 응답은 버린다. */
  const current = (spaceId: string) => get().spaceId === spaceId;

  async function reloadItems(spaceId: string) {
    const items = await api.listKnowledge(spaceId);
    if (current(spaceId)) set({ items: items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) });
  }
  async function reloadCandidates(spaceId: string) {
    const candidates = await api.listCandidates(spaceId);
    if (current(spaceId)) set({ candidates });
  }
  async function reloadJobs(spaceId: string) {
    const ingestJobs = await api.listIngestJobs(spaceId);
    if (current(spaceId)) set({ ingestJobs });
  }
  async function reloadConversations(spaceId: string) {
    const conversations = await api.listConversations(spaceId);
    if (!current(spaceId)) return;
    set((state) => ({
      conversations,
      // 지운 대화를 보고 있었다면 비운다.
      conversationId: state.conversationId && conversations.some((item) => item.id === state.conversationId) ? state.conversationId : null,
    }));
  }
  async function reloadDetail(id: string) {
    try {
      const detail = await api.getKnowledge(id);
      const { view } = get();
      if (view.kind === 'knowledge' && view.id === id) set({ detail, detailLoading: false });
    } catch (error) {
      const { view } = get();
      if (view.kind !== 'knowledge' || view.id !== id) return;
      // 다른 곳에서 지워졌으면 조용히 홈으로, 그 밖의 오류는 알린다.
      set({ view: { kind: 'home' }, detail: null, detailLoading: false });
      saveView({ kind: 'home' });
      if (!(error instanceof ApiError && error.status === 404)) set({ fatal: error instanceof Error ? error.message : '지식을 불러오지 못했습니다.' });
    }
  }

  async function loadSpace(spaceId: string) {
    await Promise.all([reloadItems(spaceId), reloadCandidates(spaceId), reloadJobs(spaceId), reloadConversations(spaceId)]);
  }

  function onEvent(event: WorkspaceEvent) {
    const { spaceId, view } = get();
    if (event.spaceId !== spaceId) return;
    switch (event.type) {
      case 'knowledge.changed':
        void reloadItems(spaceId);
        if (view.kind === 'knowledge' && view.id === event.id) void reloadDetail(event.id);
        break;
      case 'knowledge.deleted':
        void reloadItems(spaceId);
        if (view.kind === 'knowledge' && view.id === event.id) {
          set({ view: { kind: 'home' }, detail: null, editingId: null });
          saveView({ kind: 'home' });
        }
        break;
      case 'candidates.changed':
        void reloadCandidates(spaceId);
        break;
      case 'ingest.changed':
        void reloadJobs(spaceId);
        break;
      case 'conversations.changed':
        void reloadConversations(spaceId);
        break;
    }
  }

  function go(view: View) {
    set({ view, editingId: null, ...(view.kind === 'knowledge' ? {} : { detail: null, detailLoading: false }) });
    saveView(view);
  }

  return {
    loaded: false,
    fatal: null,
    spaces: [],
    spaceId: read(SPACE_KEY) ?? 'personal',
    items: [],
    candidates: [],
    ingestJobs: [],
    conversations: [],
    view: readView(),
    detail: null,
    detailLoading: false,
    editingId: null,
    conversationId: null,
    aiStatus: null,
    aiModels: [],
    settings: loadSettings(),
    ingestOpen: false,

    init() {
      const unsubscribe = api.subscribe(onEvent);
      void (async () => {
        try {
          const [spaces, aiStatus, aiModels] = await Promise.all([api.spaces(), api.aiStatus(), api.aiModels()]);
          const saved = get().spaceId;
          const spaceId = spaces.some((space) => space.id === saved) ? saved : (spaces[0]?.id ?? '');
          set({ spaces, spaceId, aiStatus, aiModels, conversationId: read(conversationKey(spaceId)) });
          await loadSpace(spaceId);
          set({ loaded: true });
          const { view } = get();
          if (view.kind === 'knowledge') {
            set({ detailLoading: true });
            await reloadDetail(view.id);
          }
        } catch (error) {
          set({ fatal: error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.', loaded: true });
        }
      })();
      return unsubscribe;
    },

    async setSpace(spaceId) {
      if (spaceId === get().spaceId) return;
      persist(SPACE_KEY, spaceId);
      set({
        spaceId,
        items: [],
        candidates: [],
        ingestJobs: [],
        conversations: [],
        conversationId: read(conversationKey(spaceId)),
        loaded: false,
      });
      go({ kind: 'home' });
      await loadSpace(spaceId);
      if (current(spaceId)) set({ loaded: true });
    },

    openHome: () => go({ kind: 'home' }),
    openInbox: () => go({ kind: 'inbox' }),

    async openKnowledge(id, options = {}) {
      const { view, detail } = get();
      if (view.kind === 'knowledge' && view.id === id && detail) {
        if (options.edit) set({ editingId: id });
        return;
      }
      set({ view: { kind: 'knowledge', id }, detail: null, detailLoading: true, editingId: options.edit ? id : null });
      saveView({ kind: 'knowledge', id });
      await reloadDetail(id);
    },

    async createKnowledge(input = {}) {
      const { spaceId } = get();
      const detail = await api.createKnowledge(spaceId, {
        title: input.title ?? '새 지식',
        summary: input.summary ?? '',
        body: input.body ?? '',
        type: input.type ?? 'note',
        status: 'draft',
        tags: input.tags,
        sources: input.sources,
      });
      set({ view: { kind: 'knowledge', id: detail.id }, detail, detailLoading: false, editingId: detail.id });
      saveView({ kind: 'knowledge', id: detail.id });
      return detail;
    },

    async saveKnowledge(id, patch, note) {
      const detail = await api.updateKnowledge(id, patch, note);
      if (get().detail?.id === id) set({ detail });
    },

    async removeKnowledge(id) {
      await api.deleteKnowledge(id);
      if (get().view.kind === 'knowledge') go({ kind: 'home' });
    },

    async restoreVersion(id, version) {
      const detail = await api.restoreVersion(id, version);
      if (get().detail?.id === id) set({ detail });
    },

    async addSource(id, source) {
      const detail = await api.addSource(id, source);
      if (get().detail?.id === id) set({ detail });
    },

    async removeSource(id, sourceId) {
      const detail = await api.removeSource(id, sourceId);
      if (get().detail?.id === id) set({ detail });
    },

    acceptCandidate: (id, edits) => api.acceptCandidate(id, edits),
    mergeCandidate: (id, targetId) => api.mergeCandidate(id, targetId),
    rejectCandidate: (id) => api.rejectCandidate(id),

    async startIngest(input) {
      await api.startIngest(get().spaceId, input);
    },

    setConversation(id) {
      persist(conversationKey(get().spaceId), id);
      set({ conversationId: id });
    },

    setEditing: (id) => set({ editingId: id }),
    setIngestOpen: (open) => set({ ingestOpen: open }),

    updateSettings(patch) {
      const settings = { ...get().settings, ...patch };
      set({ settings });
      const { theme: _theme, ...rest } = settings;
      persist(SETTINGS_KEY, JSON.stringify(rest));
    },

    async resetDemo() {
      await api.resetDemo();
      for (const space of get().spaces) persist(conversationKey(space.id), null);
      set({ conversationId: null });
      go({ kind: 'home' });
      await loadSpace(get().spaceId);
    },
  };
});

/** 검토를 기다리는 후보 */
export function pendingCandidates(candidates: KnowledgeCandidate[]): KnowledgeCandidate[] {
  return candidates.filter((candidate) => candidate.status === 'pending');
}
