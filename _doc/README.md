# _doc — 문서 색인

DOI 지식베이스(AI 대화로 쌓이는 회사·개인 지식) 프로젝트 문서. 코드는 `../project/`, 실행 방법은 `../project/README.md`.

## 정해진 것 (2026-10-01)

| 항목 | 결정 | 이유 |
|---|---|---|
| 기술 구성 | jake-doi/cad와 같다: TypeScript npm workspaces, React 18 + `@bricks/core`, zustand, vitest, Playwright. 서버는 Fastify, AI는 cad의 에이전트 루프(OpenRouter·Anthropic·Claude Code)·MCP를 옮긴다 | 같은 팀이 같은 방식으로 유지 |
| 화면 | 디자인 시스템 DOI-L-THREE-COLUMN (메뉴 · 콘텐츠 · 도킹 채팅 · 옵션) | cad와 같은 레이아웃 |
| 사용 형태 | 처음엔 내 PC에서 혼자 쓰는 로컬 앱. 데이터에 "공간(개인·팀)"을 미리 두고 로그인·권한은 나중에 붙인다 | 빨리 써 보면서 쌓기 시작 |
| 저장소 | PostgreSQL + pgvector. 로컬은 설치 없이 PGlite(WASM Postgres, pgvector 지원), 팀 서버로 옮길 때 같은 스키마를 PostgreSQL에 | 일반 데이터와 벡터를 한 DB에서, `npm install`만으로 실행 |
| 임베딩 | 교체 가능한 인터페이스. 로컬 다국어 모델(bge-m3 등)과 외부 API 중 고른다. 지식마다 임베딩 모델 이름을 함께 저장 | Claude에는 임베딩 API가 없다. 모델을 바꾸면 다시 계산해야 한다 |
| 검색 | 키워드 + 벡터 혼합 | 한국어는 벡터만으로 고유명사·숫자를 놓친다 |
| 쌓는 방식 | AI는 지식 **후보**만 만들고 사람이 확인(저장·합치기·버리기)한다. 내용이 바뀌면 버전이 남는다 | 틀린 지식이 쌓이지 않게 |

## 문서

| 문서 | 내용 |
|---|---|
| [00.자료조사/벡터디비.md](00.자료조사/벡터디비.md) | 벡터 DB·임베딩·RAG 개념, 대표 벡터 DB, pgvector |
| [02.개발설계/01_UI설계.md](02.개발설계/01_UI설계.md) | 화면 구성(DOI-L-THREE-COLUMN 매핑), 화면별 기능, 상태·API 계약, 데모 모드, 반응형, 테스트 |

## 문서 규칙

- 한국어로 쓴다. 코드 식별자·명령은 원문 그대로.
- 새 문서는 해당 폴더에 `NN_제목.md`로 추가하고 위 표에 한 줄 더한다.
