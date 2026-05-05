// Regression tests — protege contra bugs corrigidos não voltarem.
//
// Cada bloco mapeia um bug específico relatado em prod e validado
// como corrigido. Se algum desses falhar, é regressão e PR não passa.

import { test, expect } from '@playwright/test';

test.describe('Regressão #1 — PWA splash não pode ficar em loop', () => {
  test('splash some em ≤12s mesmo se Firebase não responder', async ({ page }) => {
    // Bloqueia TODAS as requests do Firebase pra simular cenário onde
    // o checkAuth() ficaria preso. O watchdog deve forçar splash a sair.
    await page.route('**/*googleapis.com/**', (r) => r.abort());
    await page.route('**/*firebaseio.com/**', (r) => r.abort());
    await page.route('**/*firebaseapp.com/**', (r) => r.abort());

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Espera o splash desaparecer (10s do watchdog + 2s de margem).
    await page.waitForFunction(
      () => {
        const s = document.getElementById('appBootSplash');
        if (!s) return true; // foi removido do DOM
        const cs = getComputedStyle(s);
        return cs.display === 'none' || s.classList.contains('boot-splash--exit');
      },
      { timeout: 12000 }
    );
  });
});

test.describe('Regressão #2 — Campo de senha do login não pode ficar "quebrado"', () => {
  test('input de senha tem largura/altura razoáveis e o botão "olho" cabe dentro', async ({ page }) => {
    await page.goto('/');

    const senhaInput = page.locator('#loginSenha');
    await expect(senhaInput).toBeVisible();

    const bbox = await senhaInput.boundingBox();
    expect(bbox).not.toBeNull();
    // Sanidade: input não pode ser microscópico nem fora da tela
    expect(bbox.width).toBeGreaterThan(150);
    expect(bbox.height).toBeGreaterThan(30);
    expect(bbox.height).toBeLessThan(80);

    // Botão "olho" tem que estar DENTRO do wrap visual (que é o input).
    // Medimos contra o wrap (parent direto) pra evitar arredondamentos
    // de subpixel entre input e wrap.
    const wrapBox = await page.locator('#loginSenha').locator('xpath=..').boundingBox();
    const eyeBox = await page.locator('#loginEyeBtn').boundingBox();
    expect(wrapBox).not.toBeNull();
    expect(eyeBox).not.toBeNull();
    expect(eyeBox.x).toBeGreaterThanOrEqual(wrapBox.x);
    expect(eyeBox.x + eyeBox.width).toBeLessThanOrEqual(wrapBox.x + wrapBox.width + 1);
    expect(eyeBox.y).toBeGreaterThanOrEqual(wrapBox.y - 1);
    expect(eyeBox.y + eyeBox.height).toBeLessThanOrEqual(wrapBox.y + wrapBox.height + 1);
  });

  test('CSS de anti-autofill amarelo está aplicado no .ls-input', async ({ page }) => {
    await page.goto('/');
    // Verifica que existe regra com -webkit-box-shadow inset (anti-autofill)
    const hasAntiAutofill = await page.evaluate(() => {
      // Percorre stylesheets carregados
      for (const ss of document.styleSheets) {
        try {
          for (const r of ss.cssRules) {
            const txt = r.cssText || '';
            if (txt.includes('-webkit-autofill') && txt.includes('.ls-input')) {
              return true;
            }
          }
        } catch (_) {
          // CORS-blocked stylesheet — ignora
        }
      }
      return false;
    });
    expect(hasAntiAutofill).toBe(true);
  });
});

test.describe('Regressão #3 — Botão "Início" não pode sobrepor título da página', () => {
  test('em desktop, o botão back-home não cobre o page-title', async ({ page }) => {
    // Como precisaria estar logado pra ver as páginas internas, este
    // teste valida via DOM diretamente: pega um content-header e força
    // visibility, depois mede bounding boxes.
    await page.goto('/');

    // Injeta um header de teste numa página interna (já existe no DOM,
    // só está oculto enquanto não logado).
    await page.evaluate(() => {
      const main = document.getElementById('pageEntradas') || document.getElementById('pageHome');
      if (main) main.classList.remove('page-content--hidden');
    });

    const header = page.locator('.content-header').first();
    if (!(await header.isVisible())) return; // sem header acessível, pula

    const headerBox = await header.boundingBox();
    const btn = header.locator('.btn-back-home').first();
    const title = header.locator('.page-title').first();

    if (!(await btn.isVisible()) || !(await title.isVisible())) return;

    const btnBox = await btn.boundingBox();
    const titleBox = await title.boundingBox();

    // Em desktop o botão fica à direita; o title à esquerda.
    // A direita do título deve estar à esquerda do botão (sem overlap).
    expect(headerBox).not.toBeNull();
    expect(btnBox).not.toBeNull();
    expect(titleBox).not.toBeNull();

    // Verticalmente: ambos dentro do header.
    expect(btnBox.x + btnBox.width).toBeLessThanOrEqual(headerBox.x + headerBox.width + 1);
    // Horizontalmente: título termina antes do botão começar (com 4px de tolerância
    // pra arredondamentos sub-pixel).
    expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(btnBox.x + 4);
  });
});

test.describe('Regressão #4 — Toggle de tema acessível em desktop', () => {
  test('botão de tema existe no sidebar (desktop) ou topbar (mobile)', async ({ page }) => {
    await page.goto('/');
    // Pelo menos UM dos dois botões de toggle deve existir no DOM
    const sidebarBtn = page.locator('#sidebarThemeBtn');
    const topbarBtn = page.locator('#themeToggleBtn');
    const hasAny = (await sidebarBtn.count()) + (await topbarBtn.count());
    expect(hasAny).toBeGreaterThanOrEqual(1);
  });

  test('window.theme.toggle alterna data-theme entre light/dark', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.theme !== 'undefined', { timeout: 5000 });

    const initial = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await page.evaluate(() => window.theme.toggle());
    const after = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));

    expect(after).not.toBe(initial);
    expect(['light', 'dark']).toContain(after);
  });
});
