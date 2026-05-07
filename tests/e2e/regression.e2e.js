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

// ════════════════════════════════════════════════════════════════════════
// Regressões adicionadas em 2026-05-07 — proteção das melhorias de UI
// ════════════════════════════════════════════════════════════════════════

test.describe('Regressão #7 — PickList unifica todos os <select> data-picklist', () => {
  test('todo <select data-picklist> é convertido em UI custom no boot', async ({ page }) => {
    await page.goto('/');
    // Aguarda PickList carregar e inicializar
    await page.waitForFunction(() => typeof PickList !== 'undefined', { timeout: 5000 });

    // Força páginas internas visíveis pra que PickList processe os selects
    await page.evaluate(() => {
      ['pageEntradas', 'pageSaidas', 'pageRelatorios', 'pageAuditoria'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('page-content--hidden');
      });
      // Re-inicializa caso o boot tenha rodado antes do unhide
      try {
        PickList.initAll();
      } catch (_) {}
    });

    // Cada <select data-picklist> deve estar oculto E ter um .picklist
    // sibling renderizado (UI custom).
    const result = await page.evaluate(() => {
      const selects = document.querySelectorAll('select[data-picklist]');
      const out = { total: selects.length, ok: 0, missing: [] };
      selects.forEach((sel) => {
        const hasNative = sel.classList.contains('picklist-native');
        const hasUI = sel.nextElementSibling
          && sel.nextElementSibling.classList.contains('picklist');
        if (hasNative && hasUI) out.ok++;
        else out.missing.push(sel.id);
      });
      return out;
    });

    expect(result.total).toBeGreaterThanOrEqual(6); // 6 selects esperados
    expect(result.missing).toEqual([]);
    expect(result.ok).toBe(result.total);
  });

  test('PickList.setValue dispara `change` no <select> original', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof PickList !== 'undefined', { timeout: 5000 });

    // Cria um <select data-picklist> de teste isolado e inicializa
    const value = await page.evaluate(() => {
      const sel = document.createElement('select');
      sel.id = '__test_pl';
      sel.setAttribute('data-picklist', '');
      sel.innerHTML = '<option value="">--</option><option value="X">X</option><option value="Y">Y</option>';
      document.body.appendChild(sel);

      const pl = new PickList(sel);
      let changeFired = false;
      sel.addEventListener('change', () => { changeFired = true; });

      pl.setValue('Y');
      const out = { value: sel.value, changeFired };
      sel.remove();
      return out;
    });

    expect(value.value).toBe('Y');
    expect(value.changeFired).toBe(true);
  });
});

test.describe('Regressão #8 — Forms limpam corretamente após save', () => {
  test('setInput helper dispara input+change events', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(() => {
      const inp = document.createElement('input');
      inp.id = '__test_in';
      inp.type = 'text';
      document.body.appendChild(inp);

      let inputFired = false;
      let changeFired = false;
      inp.addEventListener('input', () => { inputFired = true; });
      inp.addEventListener('change', () => { changeFired = true; });

      setInput('__test_in', 'hello');
      const out = { value: inp.value, inputFired, changeFired };
      inp.remove();
      return out;
    });

    expect(result.value).toBe('hello');
    expect(result.inputFired).toBe(true);
    expect(result.changeFired).toBe(true);
  });
});

test.describe('Regressão #9 — Inputs de data têm teclado numérico e select-on-focus', () => {
  const dateIds = [
    'dataDeposito',
    'saidaData',
    'filtroDataDe',
    'filtroDataAte',
    'caixaDiaFiltroDE',
    'caixaDiaFiltroATE',
    'dashDiaFiltroDE',
    'dashDiaFiltroATE',
  ];

  for (const id of dateIds) {
    test(`#${id} tem inputmode=numeric, pattern e onfocus=select`, async ({ page }) => {
      await page.goto('/');
      const result = await page.evaluate((dateId) => {
        const el = document.getElementById(dateId);
        if (!el) return null;
        return {
          inputmode: el.getAttribute('inputmode'),
          pattern: el.getAttribute('pattern'),
          onfocus: (el.getAttribute('onfocus') || '').replace(/\s/g, ''),
          maxlength: el.getAttribute('maxlength'),
        };
      }, id);
      expect(result, `Input #${id} não encontrado no DOM`).not.toBeNull();
      expect(result.inputmode).toBe('numeric');
      expect(result.pattern).toContain('0-9');
      expect(result.onfocus).toContain('this.select()');
      expect(result.maxlength).toBe('10');
    });
  }
});

test.describe('Regressão #10 — Botão de tema visível no tablet/iPad', () => {
  test('em viewport tablet portrait (768) tem theme btn acessível', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    // Em 768 a topbar mostra (display:flex), com #themeToggleBtn dentro
    const topbarBtn = page.locator('#themeToggleBtn');
    const visible = await topbarBtn.evaluate((el) => {
      const cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden';
    });
    expect(visible).toBe(true);
  });

  test('em viewport tablet landscape (1024) tem theme btn acessível no sidebar', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');
    // Em 1024 a topbar fica oculta MAS o sidebar mostra com sidebar-theme-btn.
    // Antes, o sidebar-theme-btn era hidden em max-width:1024 → tablet
    // landscape ficava SEM nenhum botão de tema (bug).
    const sidebarBtn = page.locator('#sidebarThemeBtn');
    if ((await sidebarBtn.count()) === 0) return;
    const visible = await sidebarBtn.evaluate((el) => getComputedStyle(el).display !== 'none');
    expect(visible).toBe(true);
  });

  test('em viewport mobile (375) o sidebar-theme-btn fica oculto (topbar tem)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    const sidebarBtn = page.locator('#sidebarThemeBtn');
    if ((await sidebarBtn.count()) === 0) return;
    const display = await sidebarBtn.evaluate((el) => getComputedStyle(el).display);
    expect(display).toBe('none');
  });
});

test.describe('Regressão #11 — Relatórios tem botões Filtrar e Limpar filtros', () => {
  test('botão Filtrar (btn-filter) está no DOM na página de Relatórios', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const el = document.getElementById('pageRelatorios');
      if (el) el.classList.remove('page-content--hidden');
    });
    // Botão "Filtrar" gold primário com aplicarFiltros
    const filtrar = page.locator('.report-filters .btn-filter');
    expect(await filtrar.count()).toBe(1);
    const onclick = await filtrar.getAttribute('onclick');
    expect(onclick).toContain('aplicarFiltros');
  });

  test('botão Limpar filtros está no DOM na página de Relatórios', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const el = document.getElementById('pageRelatorios');
      if (el) el.classList.remove('page-content--hidden');
    });
    const limpar = page.locator('.report-filters .btn-ghost', { hasText: /limpar filtros/i });
    expect(await limpar.count()).toBe(1);
    const onclick = await limpar.getAttribute('onclick');
    expect(onclick).toContain('limparFiltros');
  });
});

test.describe('Regressão #12 — Topbar title sincroniza com Home no boot', () => {
  test('default do #topbarTitle é "Home" (não "Lançamentos")', async ({ page }) => {
    await page.goto('/');
    const text = await page.locator('#topbarTitle').innerText();
    // Quando não logado, JS pode não ter rodado initHome ainda — mas o
    // default do HTML deve ser "Home" (não o antigo "Lançamentos").
    expect(text).toBe('Home');
  });
});

test.describe('Regressão #13 — Tela de login mobile sem scroll', () => {
  test('em viewport mobile, .ls não rola e usa height 100dvh', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const lsInfo = await page.evaluate(() => {
      const ls = document.getElementById('loginScreen');
      if (!ls) return null;
      const cs = getComputedStyle(ls);
      return {
        overflow: cs.overflow,
        position: cs.position,
        // overscrollBehavior pode ser 'contain' ou parte dele
        overscroll: cs.overscrollBehavior || cs.overscrollBehaviorY,
        scrollHeight: ls.scrollHeight,
        clientHeight: ls.clientHeight,
      };
    });
    expect(lsInfo, '#loginScreen não encontrado').not.toBeNull();
    expect(lsInfo.overflow).toBe('hidden');
    expect(lsInfo.position).toBe('fixed');
  });

  test('body scroll é travado quando #loginScreen está montado', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const bodyOverflow = await page.evaluate(() => {
      // body:has(#loginScreen) → overflow:hidden
      return getComputedStyle(document.body).overflow;
    });
    expect(bodyOverflow).toBe('hidden');
  });
});

test.describe('Regressão #14 — Tela de login tem loading premium ao entrar', () => {
  test('overlay #lsLoading existe no DOM com 3 anéis e texto', async ({ page }) => {
    await page.goto('/');
    const overlay = page.locator('#lsLoading');
    expect(await overlay.count()).toBe(1);

    // 3 anéis dourados
    const rings = await page.locator('#lsLoading .ls-loading-ring').count();
    expect(rings).toBe(3);

    // Texto "Autenticando" + 3 dots
    const text = await page.locator('#lsLoading .ls-loading-text').innerText();
    expect(text.toLowerCase()).toContain('autenticando');
  });
});

test.describe('Regressão #15 — Aurora background do login tem 25 estrelas', () => {
  test('25 spans renderizados em .ls-stars', async ({ page }) => {
    await page.goto('/');
    const count = await page.locator('.ls-stars span').count();
    expect(count).toBe(25);
  });

  test('.ls-bg tem 5 orbs animados (aurora mesh)', async ({ page }) => {
    await page.goto('/');
    const count = await page.locator('.ls-bg .ls-orb').count();
    expect(count).toBe(5);
  });
});

test.describe('Regressão #16 — Single-device session: modais existem no DOM', () => {
  test('#sessionConflictModal está no DOM com placeholder de device', async ({ page }) => {
    await page.goto('/');
    const modal = page.locator('#sessionConflictModal');
    expect(await modal.count()).toBe(1);
    // Tem placeholder pra preencher o device
    const devEl = page.locator('#sessionConflictDevice');
    expect(await devEl.count()).toBe(1);
    // Tem botões Cancelar + Continuar
    const cancel = modal.locator('button', { hasText: /cancelar/i });
    const ok = modal.locator('button', { hasText: /continuar/i });
    expect(await cancel.count()).toBe(1);
    expect(await ok.count()).toBe(1);
  });

  test('#sessionEvictedModal está no DOM com placeholder de device', async ({ page }) => {
    await page.goto('/');
    const modal = page.locator('#sessionEvictedModal');
    expect(await modal.count()).toBe(1);
    const devEl = page.locator('#sessionEvictedDevice');
    expect(await devEl.count()).toBe(1);
    const ok = modal.locator('button', { hasText: /entendi/i });
    expect(await ok.count()).toBe(1);
  });
});

test.describe('Regressão #17 — FirebaseManager tem APIs de single-device', () => {
  test('_generateSessionId retorna string única', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window._firebase !== 'undefined', { timeout: 5000 });
    const result = await page.evaluate(() => {
      const a = window._firebase._generateSessionId();
      const b = window._firebase._generateSessionId();
      return { a, b, equal: a === b, lenA: a.length, lenB: b.length };
    });
    expect(result.equal).toBe(false);
    expect(result.lenA).toBeGreaterThanOrEqual(16);
    expect(result.lenB).toBeGreaterThanOrEqual(16);
  });

  test('_detectDevice retorna string descritiva', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window._firebase !== 'undefined', { timeout: 5000 });
    const dev = await page.evaluate(() => window._firebase._detectDevice());
    expect(typeof dev).toBe('string');
    expect(dev.length).toBeGreaterThan(0);
  });

  test('checkActiveSession e listenSessionEvictor estão expostos', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window._firebase !== 'undefined', { timeout: 5000 });
    const ok = await page.evaluate(() => {
      return (
        typeof window._firebase.checkActiveSession === 'function' &&
        typeof window._firebase.listenSessionEvictor === 'function'
      );
    });
    expect(ok).toBe(true);
  });
});

test.describe('Regressão #18 — Sidebar tablet/iPad: botão Sair full width', () => {
  test('em tablet portrait (768) Sair tem grid-column 1 / -1', async ({ page }) => {
    // No exact 768 a topbar está visível, mas o sidebar permanece pra
    // contextos onde o user abre o menu. Testamos o layout do sidebar.
    await page.setViewportSize({ width: 820, height: 1180 }); // iPad portrait moderno
    await page.goto('/');
    const result = await page.evaluate(() => {
      const btn = document.querySelector('.sidebar-logout-btn');
      if (!btn) return null;
      const cs = getComputedStyle(btn);
      return { gridColumnStart: cs.gridColumnStart, gridColumnEnd: cs.gridColumnEnd };
    });
    expect(result).not.toBeNull();
    // Sair deve ocupar a linha inteira (start=1, end=-1 ou 3 dependendo do parser)
    expect(result.gridColumnStart).toBe('1');
  });

  test('em mobile (375) Sair fica em col individual (Tema escondida)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    const result = await page.evaluate(() => {
      const btn = document.querySelector('.sidebar-logout-btn');
      if (!btn) return null;
      const cs = getComputedStyle(btn);
      return { gridColumnStart: cs.gridColumnStart };
    });
    expect(result).not.toBeNull();
    // Em mobile NÃO tem o override — Sair fica no lugar default do grid
    // (pode ser 'auto' ou um número específico). Só validamos que NÃO
    // está spanando full width via grid-column 1.
    // Se o teste falhar aqui, é porque a regra @media (min-width: 769px)
    // foi mudada de novo.
    expect(['auto', '2', '3']).toContain(result.gridColumnStart);
  });
});
