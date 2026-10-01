import { expect, test, type Page } from '@playwright/test';

/** 콘솔 오류·페이지 예외가 하나도 없어야 한다(React 경고 포함). */
let problems: string[] = [];

test.beforeEach(async ({ page }) => {
  problems = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' || (message.type() === 'warning' && /React|Warning/.test(message.text()))) problems.push(`${message.type()}: ${message.text()}`);
  });
  await page.goto('/');
  await expect(page.locator('.kb-knowledge-item').first()).toBeVisible();
});

test.afterEach(() => {
  expect(problems).toEqual([]);
});

const menu = (page: Page) => page.getByRole('navigation', { name: '지식 메뉴' });
const chat = (page: Page) => page.getByRole('dialog', { name: 'AI 에이전트' });
const chatInput = (page: Page) => page.getByRole('textbox', { name: 'AI에게 보낼 메시지' });

async function switchSpace(page: Page, name: '내 공간' | 'DOI 팀') {
  await menu(page).getByRole('radio', { name }).click();
  await expect(menu(page).getByRole('radio', { name })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.kb-knowledge-item').first()).toBeVisible();
}

async function openKnowledge(page: Page, title: string) {
  await page.locator('.kb-knowledge-item', { hasText: title }).click();
  await expect(page.locator('.kb-title-name')).toHaveText(title);
}

async function ask(page: Page, message: string) {
  await chatInput(page).fill(message);
  await chatInput(page).press('Enter');
  // 응답이 끝나면 중지 버튼이 사라진다.
  await expect(page.getByRole('button', { name: '응답 중지' })).toBeVisible();
  await expect(page.getByRole('button', { name: '응답 중지' })).toBeHidden({ timeout: 30_000 });
}

test('3단 레이아웃: 메뉴 · 콘텐츠 · 도킹 채팅 · 옵션', async ({ page }) => {
  await expect(menu(page)).toBeVisible();
  await expect(page.getByRole('complementary', { name: '옵션' })).toBeVisible();
  // 채팅은 처음부터 열려 있고 오른쪽 컬럼에 도킹된다.
  await expect(page.locator('.three-column-chat-slot .layout-chat-popup[data-docked="true"]')).toBeVisible();
  await expect(page.locator('.kb-title-name')).toHaveText('홈');
  await expect(page.getByText('지식 후보', { exact: true }).first()).toBeVisible();

  // 채팅 띄우기 ↔ 도킹
  await chat(page).getByRole('button', { name: '채팅창 띄우기' }).click();
  await expect(page.locator('.layout-chat-popup[data-docked="false"]')).toBeVisible();
  await chat(page).getByRole('button', { name: '채팅창 사이드에 배치' }).click();
  await expect(page.locator('.three-column-chat-slot .layout-chat-popup[data-docked="true"]')).toBeVisible();
});

test('공간을 바꾸고 지식을 편집하면 새 버전이 기록된다', async ({ page }) => {
  await switchSpace(page, 'DOI 팀');
  await openKnowledge(page, '연차휴가 부여 기준');
  await expect(page.locator('.kb-doc')).toContainText('근로기준법 제60조');
  await expect(page.getByRole('tab', { name: /기록/ })).toContainText('2');
  // 옵션 칸: 같은 태그·낱말을 가진 관련 지식
  await expect(page.getByRole('complementary', { name: '옵션' }).locator('.kb-related')).toContainText('출장비 정산 기준');

  await page.getByRole('button', { name: '편집' }).click();
  const body = page.getByRole('textbox', { name: '본문' });
  await body.fill(`${await body.inputValue()}\n\n- 연차 신청은 사용 3일 전까지 한다.`);
  await page.getByPlaceholder('예: 2026년 기준으로 금액 수정').fill('신청 기한 추가');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByText('저장했습니다. 새 버전이 기록에 남았습니다.')).toBeVisible();
  await expect(page.locator('.kb-doc')).toContainText('사용 3일 전까지');

  await page.getByRole('tab', { name: /기록/ }).click();
  const latest = page.locator('.kb-history tbody tr').first();
  await expect(latest).toContainText('v3');
  await expect(latest).toContainText('신청 기한 추가');

  // 되돌리기도 새 버전으로 남는다.
  await page.locator('.kb-history tbody tr', { hasText: 'v2' }).getByRole('button', { name: '되돌리기' }).click();
  await expect(page.locator('.kb-history tbody tr').first()).toContainText('v2로 되돌림');
});

test('채팅 질문: 지식 검색 → 답변 → 근거 지식을 눌러 연다', async ({ page }) => {
  await switchSpace(page, 'DOI 팀');
  await ask(page, '입사 1년 지나면 연차가 며칠이야?');
  const answer = chat(page).locator('.kb-assistant').last();
  await expect(answer.locator('.kb-tool', { hasText: '지식 검색' })).toContainText('연차휴가 부여 기준');
  await expect(answer.locator('.kb-citations')).toContainText('연차휴가 부여 기준');
  await answer.locator('.kb-citations button', { hasText: '연차휴가 부여 기준' }).click();
  await expect(page.locator('.kb-title-name')).toHaveText('연차휴가 부여 기준');
  // 인용 횟수가 올라간다(12 → 13).
  await expect(page.locator('.kb-footer-stats')).toContainText('AI 인용 13회');
  // 새 대화가 목록에 남는다.
  await chat(page).getByRole('button', { name: '대화 목록' }).click();
  await expect(chat(page).getByRole('list', { name: '대화 목록' })).toContainText('입사 1년 지나면 연차가 며칠이야?');
});

test('"기억해줘" → 지식 후보 → 채팅에서 저장 → 지식 목록에 생긴다', async ({ page }) => {
  await switchSpace(page, 'DOI 팀');
  await ask(page, '법인카드 영수증은 사용 후 3일 안에 경비 시스템에 올려야 해. 기억해줘.');
  const card = chat(page).locator('.kb-chat-candidate').last();
  await expect(card).toContainText('법인카드 영수증은 사용 후 3일 안에 경비 시스템에 올려야 해');
  await expect(menu(page).getByRole('button', { name: /검토 대기 3건/ })).toBeVisible();

  await card.getByRole('button', { name: '저장' }).click();
  await expect(card.getByRole('button', { name: '저장됨 · 열기' })).toBeVisible();
  await expect(page.locator('.kb-knowledge-item', { hasText: '법인카드 영수증' })).toBeVisible();
  await card.getByRole('button', { name: '저장됨 · 열기' }).click();
  await expect(page.locator('.kb-title-name')).toContainText('법인카드 영수증');
  await expect(page.getByRole('tab', { name: /출처/ })).toContainText('1');
});

test('검토 대기: 비슷한 지식에 합치기 · 버리기', async ({ page }) => {
  await switchSpace(page, 'DOI 팀');
  await menu(page).getByRole('button', { name: /검토 대기/ }).click();
  const travel = page.getByRole('article', { name: '지식 후보: 출장비 정산 기준 (2026년 개정)' });
  await expect(travel).toContainText('겹침 78%');
  await travel.getByRole('button', { name: '기존 지식에 합치기' }).click();
  await expect(page.getByText('"출장비 정산 기준"에 합쳤습니다.', { exact: false })).toBeVisible();

  const room = page.getByRole('article', { name: '지식 후보: 회의실 예약 규칙' });
  // 겹침이 낮으면 합치기를 권하지 않는다.
  await expect(room.getByRole('button', { name: '기존 지식에 합치기' })).toHaveCount(0);
  await room.getByRole('button', { name: '버리기' }).click();
  await expect(page.getByText('검토할 후보가 없습니다')).toBeVisible();

  await page.getByRole('radio', { name: /처리함/ }).click();
  await expect(page.getByRole('article', { name: '지식 후보: 회의실 예약 규칙' })).toContainText('버림');

  await openKnowledge(page, '출장비 정산 기준');
  await expect(page.locator('.kb-doc')).toContainText('추가된 내용');
  await expect(page.locator('.kb-content-top')).toContainText('초안');
});

test('자료 추가(텍스트): 읽기 → 조각내기 → 임베딩 → 후보 추출', async ({ page }) => {
  await menu(page).getByRole('button', { name: '자료 추가' }).click();
  const dialog = page.getByRole('dialog', { name: /자료 추가/ });
  await dialog.getByRole('radio', { name: /텍스트/ }).click();
  await dialog.getByPlaceholder('예: 9월 운영회의 회의록').fill('9월 운영회의');
  await dialog.getByPlaceholder(/붙여 넣으세요/).fill('# 고객 문의 응답 기준\n\n고객 문의는 접수 후 4시간 안에 첫 답변을 보낸다. 주말 문의는 월요일 오전에 처리한다.');
  await dialog.getByRole('button', { name: '수집 시작' }).click();

  const job = page.locator('.kb-ingest-row', { hasText: '9월 운영회의' });
  await expect(job).toBeVisible();
  await expect(job).toContainText('후보 1개', { timeout: 15_000 });
  await job.getByRole('button', { name: '검토 대기 보기' }).click();
  await expect(page.getByRole('article', { name: '지식 후보: 고객 문의 응답 기준' })).toContainText('4시간 안에 첫 답변');
});

test('테마 전환과 좁은 화면(375px)', async ({ page }) => {
  const toggle = menu(page).locator('.kb-theme-toggle');
  const before = await page.locator('html').getAttribute('data-theme');
  await toggle.click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', before ?? '');
  await page.reload();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', before ?? '');

  await page.setViewportSize({ width: 375, height: 800 });
  await expect(page.locator('.kb-knowledge-item').first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  // 채팅은 아래로 쌓여도 같은 인스턴스로 쓸 수 있다.
  await expect(chatInput(page)).toBeVisible();
});
