import { defineConfig, devices } from '@playwright/test';

// E2E는 개발 서버(5180)와 겹치지 않는 포트로 웹만 띄운다. 지금은 데모 API(브라우저 저장)라 서버가 없다.
// 테스트마다 새 브라우저 컨텍스트라 localStorage가 비어 예시 데이터로 시작한다.
const WEB_PORT = 5280;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: '.tmp/test-results',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    viewport: { width: 1440, height: 900 },
    locale: 'ko-KR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: 'npx vite --config apps/web/vite.config.ts apps/web',
    url: `http://localhost:${WEB_PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { KB_WEB_PORT: String(WEB_PORT) },
  },
});
