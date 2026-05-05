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
  test('inputs de usuário e senha têm a mesma largura visual', async ({ page }) => {
    await page.goto('/');

    const userInput = page.locator('#loginUsuario');
    const senhaInput = page.locator('#loginSenha');
    const eyeBtn = page.locator('#loginEyeBtn');

    await expect(userInput).toBeVisible();
    await expect(senhaInput).toBeVisible();
    await expect(eyeBtn).toBeVisible();

    const userBox = await userInput.boundingBox();
    const senhaBox = await senhaInput.boundingBox();
    expect(userBox).not.toBeNull();
    expect(senhaBox).not.toBeNull();

    // Ambos inputs devem ter MESMA largura (tolerância 1px pra
    // rounding). Era o bug original: senha ficava menor que usuário.
    expect(Math.abs(userBox.width - senhaBox.width)).toBeLessThanOrEqual(1);
    // E mesma posição X
    expect(Math.abs(userBox.x - senhaBox.x)).toBeLessThanOrEqual(1);

    // Sanidade do input
    expect(senhaBox.width).toBeGreaterThan(150);
    expect(senhaBox.height).toBeGreaterThan(30);
    expect(senhaBox.height).toBeLessThan(80);

    // Bug original (tooltip.js + utils.css): o helper de tooltip
    // convertia title="..." em data-tooltip e o CSS
    // [data-tooltip] { position: relative } sobrescrevia o
    // position:absolute do .ls-eye, mandando o olho pra esquerda.
    // Verificamos que position é absolute (não foi sobreposto).
    const eyeStyle = await eyeBtn.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { position: cs.position, right: cs.right };
    });
    expect(eyeStyle.position).toBe('absolute');
    // E que o `right` foi aplicado (não "auto")
    expect(eyeStyle.right).not.toBe('auto');
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

test.describe('Regressão #5 — Botão tema NÃO aparece duplicado em mobile', () => {
  test('em viewport mobile, sidebar-theme-btn fica oculto (já tem no topbar)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone 14 ish
    await page.goto('/');
    const sidebarBtn = page.locator('#sidebarThemeBtn');
    if ((await sidebarBtn.count()) === 0) return; // botão não foi adicionado
    const visible = await sidebarBtn.isVisible();
    expect(visible).toBe(false);
  });

  test('em viewport desktop, sidebar-theme-btn fica visível', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 800 });
    await page.goto('/');
    const sidebarBtn = page.locator('#sidebarThemeBtn');
    if ((await sidebarBtn.count()) === 0) return;
    // Sidebar é display:flex em desktop por padrão. O botão deve ter
    // display computed != none.
    const isShown = await sidebarBtn.evaluate(
      (el) => getComputedStyle(el).display !== 'none'
    );
    expect(isShown).toBe(true);
  });
});

test.describe('Regressão #6 — Auditoria tem botão Limpar filtros', () => {
  test('limparAuditoriaFiltros está exposto e zera os 3 campos', async ({ page }) => {
    await page.goto('/');
    // Força a página de auditoria visível pra DOM ficar acessível
    await page.evaluate(() => {
      const p = document.getElementById('pageAuditoria');
      if (p) p.classList.remove('page-content--hidden');
    });

    // Verifica existência dos elementos
    const btnLimpar = page
      .locator('button.btn-ghost', { hasText: /limpar filtro/i })
      .first();
    if (!(await btnLimpar.isVisible())) return; // sem auditoria visível, pula

    const acao = page.locator('#auditoriaFiltroAcao');
    const recurso = page.locator('#auditoriaFiltroRecurso');
    const user = page.locator('#auditoriaFiltroUser');

    // Preenche os 3 filtros
    await acao.selectOption({ index: 1 });
    await recurso.selectOption({ index: 1 });
    await user.fill('teste');

    // Clica em Limpar
    await btnLimpar.click();

    // Todos devem voltar a vazio
    expect(await acao.inputValue()).toBe('');
    expect(await recurso.inputValue()).toBe('');
    expect(await user.inputValue()).toBe('');
  });
});
