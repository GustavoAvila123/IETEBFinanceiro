// Smoke tests — sanity check de que o app inicializa corretamente.
//
// Estes testes NÃO logam no Firebase real (custo + flakiness com auth).
// Validam apenas a renderização inicial: tela de login aparece, campos
// estão presentes, manifest.json é servido, service worker registra,
// e os assets críticos são acessíveis sem erro.
//
// Para testes que cobrem fluxos autenticados (cadastro de entrada,
// relatório, etc.), criar fixtures em tests/e2e/fixtures/ usando
// uma conta de teste dedicada (preferência: emulador Firebase).

import { test, expect } from '@playwright/test';

test.describe('Smoke: app boota corretamente', () => {
  test('tela de login renderiza com campos visíveis', async ({ page }) => {
    await page.goto('/');

    // Título do app
    await expect(page).toHaveTitle(/IETEB/i);

    // Texto da tela de login (Bem-vindo)
    await expect(page.locator('text=/bem.vindo/i').first()).toBeVisible();

    // Campos de usuário e senha
    const userInput = page.locator('input[type="text"]').first();
    const passInput = page.locator('input[type="password"]').first();
    await expect(userInput).toBeVisible();
    await expect(passInput).toBeVisible();

    // Botão Entrar
    await expect(page.locator('button:has-text("Entrar")').first()).toBeVisible();
  });

  test('manifest.json é servido com campos críticos', async ({ request }) => {
    const res = await request.get('/manifest.json');
    expect(res.ok()).toBeTruthy();
    const m = await res.json();
    expect(m.name).toBeTruthy();
    expect(m.start_url).toBeTruthy();
    expect(m.display).toBe('standalone');
    expect(Array.isArray(m.icons)).toBeTruthy();
    expect(m.icons.length).toBeGreaterThan(0);
  });

  test('service worker é registrável (sw.js acessível)', async ({ request }) => {
    const res = await request.get('/sw.js');
    expect(res.ok()).toBeTruthy();
    const body = await res.text();
    expect(body).toContain('CACHE_VERSION');
  });

  test('assets críticos carregam sem 404', async ({ page }) => {
    const ownHost = new URL((await page.goto('/')).url()).hostname;
    const failures = [];

    page.on('requestfailed', (req) => {
      const errorText = req.failure()?.errorText || '';
      let host;
      try {
        host = new URL(req.url()).hostname;
      } catch (_) {
        host = '';
      }
      // Falhas em hosts EXTERNOS são esperadas e desejáveis quando vêm
      // de bloqueio CSP — significa que o CSP está funcionando.
      // Só nos importam falhas de assets do nosso próprio domínio.
      if (host !== ownHost) return;
      failures.push(`${req.method()} ${req.url()} — ${errorText}`);
    });
    page.on('response', (res) => {
      let host;
      try {
        host = new URL(res.url()).hostname;
      } catch (_) {
        return;
      }
      if (res.status() >= 400 && host === ownHost) {
        failures.push(`${res.status()} ${res.url()}`);
      }
    });

    await page.reload({ waitUntil: 'networkidle' });

    // Filtra ruídos conhecidos: favicon, sourcemaps
    const real = failures.filter((f) => !f.includes('favicon') && !f.includes('.map'));
    expect(real, `Recursos com erro: ${real.join('; ')}`).toEqual([]);
  });
});

test.describe('Acessibilidade básica', () => {
  test('tela de login tem labels associados aos inputs', async ({ page }) => {
    await page.goto('/');

    // Cada input visível deve ter aria-label ou label associado
    const inputs = page.locator('input:visible');
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const placeholder = await input.getAttribute('placeholder');

      const hasLabel =
        ariaLabel || placeholder || (id && (await page.locator(`label[for="${id}"]`).count()) > 0);

      expect(hasLabel, `Input #${i} (id=${id}) sem label/aria-label/placeholder`).toBeTruthy();
    }
  });
});
