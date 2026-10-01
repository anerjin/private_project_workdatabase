/**
 * 워크스페이스 변경 알림(서버에서는 SSE /api/events). 다른 창·MCP·자료 수집처럼
 * 화면 밖에서 일어난 변경도 여기로 온다. 화면은 받은 범위만 다시 읽는다.
 */
export type WorkspaceEvent =
  | { type: 'knowledge.changed'; spaceId: string; id: string }
  | { type: 'knowledge.deleted'; spaceId: string; id: string }
  | { type: 'candidates.changed'; spaceId: string }
  | { type: 'ingest.changed'; spaceId: string }
  | { type: 'conversations.changed'; spaceId: string };
