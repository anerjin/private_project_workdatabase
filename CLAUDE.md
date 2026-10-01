# CLAUDE.md

DOI 지식베이스 — AI와 대화하며 찾은 자료가 회사·개인 지식으로 쌓이고, 쌓인 지식이 다음 답변의 근거가 되는 웹 앱.

- 문서: `_doc/README.md` (결정 사항과 문서 색인)
- 코드: `project/` (npm workspaces: `apps/web`, `packages/shared`. 서버 `apps/server`는 아직 없다)
- 기술 구성은 jake-doi/cad를 따른다. AI 연결(에이전트 루프·OpenRouter·Claude Code·MCP)은 cad 코드를 참고해 옮긴다.
- UI는 디자인 시스템 submodule `project/vendor/design_system`(anerjin/design_system)의 DOI-L-THREE-COLUMN을 따른다. submodule 안은 고치지 않는다. `apps/web/src/layout/`은 이식본이라 원본과 맞춰 둔다.

## 명령 (project 폴더에서)

```sh
npm install
npm run dev          # 웹 5180
npm run check        # 타입 검사 + 단위 테스트
npm run test:e2e     # Playwright (5280)
npm run build
```

## 규칙

- 사용자 문구·문서는 한국어. 코드 식별자는 영어.
- 화면은 `KnowledgeApi`(apps/web/src/api/client.ts) 계약만 쓴다. 지금은 데모 구현(`api/demo/`)이 채운다. 서버를 붙일 때 계약을 바꾸면 데모 구현도 함께 고친다.
- 응답 이벤트 → 대화 기록 변환은 `packages/shared/src/transcript.ts` 한 곳에 둔다(화면·저장소·서버 공용).
- 지식은 사람이 확인해야 쌓인다: AI는 지식 후보만 만들고, 저장·합치기·버리기는 사람이 한다. 내용이 바뀌면 버전이 남는다.
- 컨테이너 쿼리: 홈·검토 대기(`kb-view`)와 채팅(`kb-chat`) 안에서는 이름 붙은 컨테이너만 쓴다(이름 없는 쿼리는 셸 너비 기준인 레이아웃 CSS와 섞인다).
