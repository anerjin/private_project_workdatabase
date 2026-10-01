# DOI 지식베이스

AI와 대화하며 찾은 자료가 회사·개인 지식으로 쌓이고, 쌓인 지식이 다음 답변의 근거가 되는 웹 앱.
UI는 디자인 시스템 `anerjin/design_system`(jake-doi/design_system 포크)의 **DOI-L-THREE-COLUMN** 레이아웃을 따르고,
기술 구성은 [jake-doi/cad](https://github.com/jake-doi/cad)와 같다(TypeScript npm workspaces, React 18 + `@bricks/core`, zustand, vitest, Playwright).

설계 문서: [`../_doc/README.md`](../_doc/README.md)

> **지금 단계: UI 먼저.** 서버(`apps/server`)는 아직 없다. 화면은 브라우저 안의 **데모 API**로 돈다 —
> 데이터는 localStorage에 저장되고, AI 응답은 지식 검색 결과로 만든 예시다. 지식 검색·근거·지식 후보 흐름은 그대로 시험할 수 있다.

## 빠른 시작

```sh
git clone --recurse-submodules <이 저장소>   # 디자인 시스템 submodule 포함
cd private_project_workdatabase/project
npm install
npm run dev                                 # http://localhost:5180
```

이미 clone했다면 `git submodule update --init --depth 1`로 디자인 시스템을 받는다.

| 스크립트 | 설명 |
|---|---|
| `npm run dev` | Vite 개발 서버(5180) |
| `npm run build` | 웹 앱 프로덕션 빌드(`apps/web/dist`) |
| `npm run check` | 타입 검사(디자인 시스템 소스 포함) + 단위 테스트 |
| `npm run test:e2e` | Playwright E2E(포트 5280, 테스트마다 빈 저장소). 처음 한 번 `npx playwright install chromium` |

요구 사항: Node.js 22 이상(개발은 24), Windows 11 / macOS / Linux.

## 화면 (DOI-L-THREE-COLUMN)

| 영역 | 내용 |
|---|---|
| 메뉴 (240px) | 공간 전환(내 공간 / DOI 팀), [새 지식], [자료 추가], 홈·검토 대기, 지식 검색·유형 필터, 지식 목록 |
| 콘텐츠 | **홈**: 지식이 쌓이는 흐름, 숫자 요약, 최근·자주 쓰인·다시 확인할 지식, 자료 수집 현황<br>**검토 대기**: AI가 찾은 지식 후보 — 저장 / 기존 지식에 합치기 / 고쳐서 저장 / 버리기<br>**지식**: 문서(마크다운) · 출처 · 기록(버전·되돌리기) 탭, 편집 |
| 채팅 (도킹, 리사이즈) | AI 에이전트: 지식 검색 → 답변 → 근거 지식 → 지식 후보 제안. 대화 목록, 지식베이스·웹 검색 켜고 끄기, 지금 보는 지식 함께 보내기, 모델·추론 강도 선택 |
| 옵션 (300px) | 지식: 유형·상태·다시 확인할 날짜·태그·AI 검색 포함·인용 통계·관련 지식·Markdown 내보내기<br>홈·검토 대기: AI 지식 검색 설정, 공간 정보, 연결 상태, 예시 데이터 초기화 |

지식이 쌓이는 흐름:

```
대화 · 웹 검색 · 자료 추가 → AI가 지식 후보 추출 → 사람이 확인(저장 · 합치기 · 버리기)
→ 지식(본문 + 출처 + 메타데이터, 버전 기록) → 다음 질문에서 검색되어 답변 근거로 인용
```

### 데모에서 해 볼 것

1. **DOI 팀** 공간 → 채팅 예시 "입사 1년 지나면 연차가 며칠이야?" → 지식 검색 카드와 근거 지식 → 근거를 눌러 문서 열기
2. 채팅에 "법인카드 영수증은 사용 후 3일 안에 경비 시스템에 올려야 해. 기억해줘." → 지식 후보 카드 → [저장]
3. **검토 대기** → "출장비 정산 기준 (2026년 개정)"을 [기존 지식에 합치기] → 원래 지식의 기록 탭에 새 버전
4. [자료 추가] → 텍스트 탭에 회의록을 붙여 넣기 → 홈에서 수집 단계 진행 → 검토 대기에 후보

## 구조

```
project/
├─ apps/web          React 18 + @bricks/core 화면
│  └─ src/
│     ├─ app/        Workspace(3단 구성) · workspace.css
│     ├─ layout/     DOI-L-THREE-COLUMN 이식본(채팅 창·패널·모델 선택기) — 디자인 시스템과 맞춰 둔다
│     ├─ features/   menu · content(홈·검토 대기·지식) · agent(채팅) · options · ingest
│     ├─ state/      zustand 워크스페이스 상태
│     └─ api/        KnowledgeApi 계약(client.ts) + 데모 구현(demo/: 저장소·예시 에이전트·예시 데이터)
├─ packages/shared   공용 타입(지식·후보·대화·이벤트), 키워드 검색(한국어 두 글자 조각), 응답 이벤트 → 대화 기록 변환
├─ vendor/design_system  디자인 시스템 submodule(anerjin/design_system @ f54ecbe)
└─ e2e/              Playwright 시나리오
```

## 서버를 붙일 때

화면은 `apps/web/src/api/client.ts`의 `KnowledgeApi` 계약만 쓴다. 서버가 생기면 같은 계약의 REST·SSE 클라이언트를 만들어
`export const api = …`만 바꾼다. 응답 이벤트(`AgentEvent`)와 대화 기록 변환(`applyAgentEvent`)은 `packages/shared`에 있어 서버도 같이 쓴다.
예정 구성(jake-doi/cad와 같은 방식): Fastify 서버, Claude 에이전트 루프(OpenRouter·Anthropic·Claude Code), MCP 서버,
PostgreSQL + pgvector(로컬은 PGlite), 교체 가능한 임베딩 제공자.

## 문제 해결

| 증상 | 확인 |
|---|---|
| 화면이 스타일 없이 깨짐 | `vendor/design_system`이 비어 있다 → `git submodule update --init --depth 1` |
| 예시 데이터를 처음으로 되돌리고 싶다 | 홈 오른쪽 옵션 → [예시 데이터로 초기화] |
| 응답·수집이 아주 느림 | 브라우저 창이 가려져 있으면 타이머가 늦게 돈다(데모 응답은 타이머로 흘려 보낸다) |
