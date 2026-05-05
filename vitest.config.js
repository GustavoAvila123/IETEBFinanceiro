// Vitest config — testes unitários (NÃO E2E)
//
// E2E mora em tests/e2e/*.e2e.js e roda via Playwright (npm run test:e2e).
// Aqui excluímos esse padrão para o Vitest não tentar carregá-los.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'playwright-report/**'],
    environment: 'node',
  },
});
