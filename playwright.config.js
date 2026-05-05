// Playwright config — IETEB Financeiro E2E
//
// Como rodar:
//   npm install                      # primeira vez
//   npx playwright install chromium  # baixa o browser (~150MB)
//   npm run test:e2e                 # roda em headless
//   npm run test:e2e:ui              # com UI interativa para debug
//
// O testServer abre http://localhost:4173 servindo a raiz do projeto.
// Sem build, é apenas um http-server estático.

import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.js',
  // Cada teste tem timeout de 30s; total da suite, 5min.
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-iphone',
      use: { ...devices['iPhone 14'] },
    },
  ],
  webServer: {
    // Sobe um http-server na raiz do projeto. `npx serve` é leve e já
    // está disponível como dep transitiva da maioria dos projetos JS;
    // se faltar, troque para `python -m http.server` ou similar.
    command: `npx --yes serve -l ${PORT} -s .`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
