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

    // 5 selects data-picklist esperados. Era 6 até 2026-07-08, quando o
    // filtro de Pagamento (relatórios) virou multi-seleção (checkboxes) e
    // deixou de ser um <select data-picklist>.
    expect(result.total).toBeGreaterThanOrEqual(5);
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

test.describe('Regressão #27 — Filtro de Pagamento (relatórios) é multi-seleção', () => {
  // 2026-07-08: o filtro de Pagamento virou checkboxes (marca 1+ formas,
  // ex.: Débito + Crédito). Protege a existência do multi-select, dos 4
  // checkboxes com os valores canônicos e da fiação de eventos.
  test('multi-select existe com trigger e 4 checkboxes (Pix/Débito/Crédito/Dinheiro)', async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const el = document.getElementById('pageRelatorios');
      if (el) el.classList.remove('page-content--hidden');
    });

    const wrap = page.locator('#filtroPagamentoWrap');
    expect(await wrap.count()).toBe(1);

    const trigger = page.locator('#filtroPagamentoTrigger');
    expect(await trigger.count()).toBe(1);
    expect(await trigger.getAttribute('onclick')).toContain('toggleFiltroPagamento');

    const values = await page.$$eval(
      '#filtroPagamentoPanel input[type="checkbox"]',
      (els) => els.map((e) => e.value)
    );
    expect(values).toEqual(['Pix', 'Débito', 'Crédito', 'Dinheiro']);
  });

  test('marcar Débito + Crédito atualiza o rótulo para "2 selecionados"', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.onFiltroPagamentoChange === 'function', {
      timeout: 5000,
    });
    await page.evaluate(() => {
      // Remove o login screen (sem sessão ele cobre a tela e intercepta
      // cliques — mesmo padrão da Regressão #21).
      const ls = document.getElementById('loginScreen');
      if (ls) ls.remove();
      const el = document.getElementById('pageRelatorios');
      if (el) el.classList.remove('page-content--hidden');
      // #reportFilters nasce com display:none (só aparece após escolher o
      // tipo). Revela pra que o multi-select seja clicável no teste.
      const rf = document.getElementById('reportFilters');
      if (rf) rf.style.display = '';
    });

    const label = page.locator('#filtroPagamentoLabel');
    expect((await label.innerText()).trim()).toBe('Todos');

    // Abre o painel e clica nas LINHAS (o checkbox nativo é escondido de
    // propósito; o usuário clica no rótulo). Clicar no <label> alterna o
    // checkbox e dispara onFiltroPagamentoChange → atualiza o rótulo.
    await page.click('#filtroPagamentoTrigger');
    await page.click('#filtroPagamentoPanel label.picklist-check-row:has(input[value="Débito"])');
    await page.click('#filtroPagamentoPanel label.picklist-check-row:has(input[value="Crédito"])');

    expect((await label.innerText()).trim()).toBe('2 selecionados');

    // Marcar todas volta a "Todos" (todas marcadas = sem filtro)
    await page.click('#filtroPagamentoPanel label.picklist-check-row:has(input[value="Pix"])');
    await page.click('#filtroPagamentoPanel label.picklist-check-row:has(input[value="Dinheiro"])');
    expect((await label.innerText()).trim()).toBe('Todos');
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
  test('overlay #lsLoading existe com mandala IETEB (logo + halo + sonar + 3 órbitas)', async ({
    page,
  }) => {
    await page.goto('/');
    const overlay = page.locator('#lsLoading');
    expect(await overlay.count()).toBe(1);

    // Mandala = container .ls-loading-coin
    expect(await page.locator('#lsLoading .ls-loading-coin').count()).toBe(1);

    // Logo IETEB no centro (.ls-coin-logo)
    const coinImg = page.locator('#lsLoading .ls-coin-logo');
    expect(await coinImg.count()).toBe(1);
    const src = await coinImg.getAttribute('src');
    expect(src).toMatch(/logo-ieteb/i);

    // Halo dourado pulsante
    expect(await page.locator('#lsLoading .ls-coin-halo').count()).toBe(1);

    // 3 ondas sonoras
    expect(await page.locator('#lsLoading .ls-coin-sonar').count()).toBe(3);

    // 3 órbitas 3D com partículas
    expect(await page.locator('#lsLoading .ls-coin-orbit').count()).toBe(3);

    // Texto "Autenticando" + 3 dots — usa textContent porque innerText
    // retorna vazio em elemento com display:none (overlay default).
    const text = await page.locator('#lsLoading .ls-loading-text').evaluate(
      (el) => el.textContent || ''
    );
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

test.describe('Regressão #19 — iPad mantém sidebar FIXO (igual desktop), só mobile usa overlay', () => {
  test('em iPad portrait (820x1180), sidebar fixo e topbar OCULTA', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.goto('/');
    // topbar oculta (só aparece em mobile)
    const topbarDisplay = await page.locator('.topbar').evaluate(
      (el) => getComputedStyle(el).display
    );
    expect(topbarDisplay).toBe('none');
    // sidebar em posição natural (transform: none)
    const sidebarTransform = await page.locator('.sidebar').evaluate(
      (el) => getComputedStyle(el).transform
    );
    expect(sidebarTransform).toBe('none');
  });

  test('em iPad landscape (1024x768), sidebar fixo e topbar OCULTA', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');
    const topbarDisplay = await page.locator('.topbar').evaluate(
      (el) => getComputedStyle(el).display
    );
    expect(topbarDisplay).toBe('none');
  });

  test('em mobile (375), sidebar oculto (translateX -100%) e topbar VISÍVEL', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    const topbarVisible = await page.locator('.topbar').evaluate(
      (el) => getComputedStyle(el).display !== 'none'
    );
    expect(topbarVisible).toBe(true);
    // Sidebar fora da tela (translateX -100%)
    const sidebarTransform = await page.locator('.sidebar').evaluate(
      (el) => getComputedStyle(el).transform
    );
    expect(sidebarTransform).not.toBe('none');
  });

  test('em iPad, theme btn está no SIDEBAR (não no topbar — topbar oculta)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');
    // sidebar theme btn visível
    const sidebarThemeVisible = await page.locator('#sidebarThemeBtn').evaluate(
      (el) => getComputedStyle(el).display !== 'none'
    );
    expect(sidebarThemeVisible).toBe(true);
  });

  test('em mobile, theme btn está no TOPBAR (sidebar oculto)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    const topbarThemeVisible = await page.locator('#themeToggleBtn').evaluate(
      (el) => getComputedStyle(el).display !== 'none'
    );
    expect(topbarThemeVisible).toBe(true);
    const sidebarThemeDisplay = await page.locator('#sidebarThemeBtn').evaluate(
      (el) => getComputedStyle(el).display
    );
    expect(sidebarThemeDisplay).toBe('none');
  });
});

test.describe('Regressão #20 — Single-device: visibilitychange revalida sessão', () => {
  test('listenSessionEvictor pode ser anexado e desanexado sem erro', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window._firebase !== 'undefined', { timeout: 5000 });
    const ok = await page.evaluate(() => {
      try {
        const unsub = window._firebase.listenSessionEvictor(
          '__test_legacy',
          'sid-x',
          () => {}
        );
        if (typeof unsub !== 'function') return false;
        unsub();
        return true;
      } catch (_) {
        return false;
      }
    });
    expect(ok).toBe(true);
  });

  test('checkActiveSession aceita sessão legacy (sem sessionId)', async ({ page }) => {
    // Valida que NÃO existe mais o `if (!data.sessionId) return null` que
    // fazia sessões pré-feature serem ignoradas. Testamos o método
    // fazendo proxy via mock — não precisa de Firestore real.
    await page.goto('/');
    await page.waitForFunction(() => typeof window._firebase !== 'undefined', { timeout: 5000 });
    const result = await page.evaluate(() => {
      const fb = window._firebase;
      // Simula um doc legacy: active=true, lastHb recente, sem sessionId
      const fakeSnap = {
        exists: true,
        data: () => ({
          active: true,
          lastHeartbeatMs: Date.now() - 60000, // 1min atrás
          device: 'iPad',
          lastSeen: new Date().toISOString(),
          // sem sessionId!
        }),
      };
      // Hijack do _db.collection().doc().get() pra retornar nosso fake
      const origDb = fb._db;
      fb._db = {
        collection: () => ({
          doc: () => ({ get: async () => fakeSnap }),
        }),
      };
      return fb
        .checkActiveSession('any-legacy')
        .then((res) => {
          fb._db = origDb;
          return res;
        })
        .catch((e) => {
          fb._db = origDb;
          throw e;
        });
    });
    // Sessão legacy DEVE ser detectada (não retornar null)
    expect(result).not.toBeNull();
    expect(result.device).toBe('iPad');
    expect(result.sessionId).toBeNull();
  });
});

test.describe('Regressão #21 — Navigation sempre faz scroll-to-top', () => {
  test('showPage rola scroll pra 0 mesmo após page scrollada', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      // Remove o #loginScreen — sem isso, o seletor :has() em body
      // mantém overflow:hidden e window.scrollTo não rola.
      const ls = document.getElementById('loginScreen');
      if (ls) ls.remove();

      // Torna a Home longa o suficiente pra scroll real acontecer
      const home = document.getElementById('pageHome');
      if (home) {
        home.classList.remove('page-content--hidden');
        home.style.minHeight = '3000px';
      }
      const entradas = document.getElementById('pageEntradas');
      if (entradas) entradas.classList.remove('page-content--hidden');
      // Scrolla pra meio da página
      window.scrollTo(0, 1500);
    });

    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(0);

    await page.evaluate(() => {
      if (typeof window.showPage === 'function') {
        window.showPage('entradas');
      }
    });

    const after = await page.evaluate(() => window.scrollY);
    // Após showPage, scroll DEVE estar em 0
    expect(after).toBe(0);
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

test.describe('Regressão #22 — sessionConflictModal precisa ficar ACIMA do loginScreen', () => {
  // Bug histórico: .ls (loginScreen) tinha z-index 9999 enquanto
  // .modal-overlay tinha z-index 500. Modal abria atrás do login screen,
  // invisível pro usuário, e o login travava esperando um clique que
  // o usuário não conseguia dar. Esses testes garantem que isso não
  // volte a acontecer.

  test('z-index do #sessionConflictModal > z-index do #loginScreen', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
      const conflict = document.getElementById('sessionConflictModal');
      const login = document.getElementById('loginScreen');
      if (!conflict || !login) return null;
      // Força o modal visível pra que getComputedStyle retorne o z-index
      // efetivo (em alguns navegadores, display:none zera computed values
      // dependentes de stacking context — mas z-index sempre é serializado).
      const conflictZ = parseInt(getComputedStyle(conflict).zIndex, 10) || 0;
      const loginZ = parseInt(getComputedStyle(login).zIndex, 10) || 0;
      return { conflictZ, loginZ };
    });
    expect(result, 'modais ou loginScreen não existem no DOM').not.toBeNull();
    expect(result.conflictZ).toBeGreaterThan(result.loginZ);
  });

  test('z-index do #sessionEvictedModal > z-index do #loginScreen', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
      const evicted = document.getElementById('sessionEvictedModal');
      const login = document.getElementById('loginScreen');
      if (!evicted || !login) return null;
      const evictedZ = parseInt(getComputedStyle(evicted).zIndex, 10) || 0;
      const loginZ = parseInt(getComputedStyle(login).zIndex, 10) || 0;
      return { evictedZ, loginZ };
    });
    expect(result).not.toBeNull();
    expect(result.evictedZ).toBeGreaterThan(result.loginZ);
  });

  test('forçar modal visível: realmente aparece em cima do login', async ({ page }) => {
    await page.goto('/');
    // Simula a chamada de _askSessionConflict (mostra o modal)
    await page.evaluate(() => {
      const m = document.getElementById('sessionConflictModal');
      if (m) m.style.display = 'flex';
    });
    // Encontra o elemento topo no centro da tela — deve ser o modal
    // ou descendente dele, NÃO o loginScreen.
    const topElementId = await page.evaluate(() => {
      const w = window.innerWidth / 2;
      const h = window.innerHeight / 2;
      let el = document.elementFromPoint(w, h);
      while (el && !el.id) el = el.parentElement;
      return el ? el.id : null;
    });
    // Pode ser sessionConflictModal direto ou um descendente que tem
    // id (improvável). Validamos que NÃO é loginScreen no topo.
    expect(topElementId).not.toBe('loginScreen');
  });
});

test.describe('Regressão #23 — Helpers de sessionId redundância localStorage+sessionStorage', () => {
  test('getSessionId/setSessionId/clearSessionId expostos globalmente', async ({ page }) => {
    await page.goto('/');
    const ok = await page.evaluate(() => {
      return (
        typeof getSessionId === 'function' &&
        typeof setSessionId === 'function' &&
        typeof clearSessionId === 'function'
      );
    });
    expect(ok).toBe(true);
  });

  test('setSessionId grava em localStorage E sessionStorage', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
      try {
        localStorage.removeItem('ieteb_session_id');
        sessionStorage.removeItem('ieteb_session_id');
      } catch (_) {}
      setSessionId('test-sid-123');
      return {
        local: localStorage.getItem('ieteb_session_id'),
        session: sessionStorage.getItem('ieteb_session_id'),
      };
    });
    expect(result.local).toBe('test-sid-123');
    expect(result.session).toBe('test-sid-123');
  });

  test('getSessionId retorna do localStorage primeiro, fallback sessionStorage', async ({
    page,
  }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
      // Limpa
      localStorage.removeItem('ieteb_session_id');
      sessionStorage.removeItem('ieteb_session_id');
      const empty = getSessionId();

      // Só sessionStorage
      sessionStorage.setItem('ieteb_session_id', 'from-session');
      const sessionOnly = getSessionId();

      // localStorage também — deve ganhar
      localStorage.setItem('ieteb_session_id', 'from-local');
      const bothSet = getSessionId();

      return { empty, sessionOnly, bothSet };
    });
    expect(result.empty).toBeNull();
    expect(result.sessionOnly).toBe('from-session');
    expect(result.bothSet).toBe('from-local');
  });

  test('clearSessionId limpa de ambos storages', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(() => {
      setSessionId('to-be-cleared');
      clearSessionId();
      return {
        local: localStorage.getItem('ieteb_session_id'),
        session: sessionStorage.getItem('ieteb_session_id'),
      };
    });
    expect(result.local).toBeNull();
    expect(result.session).toBeNull();
  });
});

test.describe('Regressão #24 — saveSession resiliente a /Users incompleto', () => {
  // Bug: se /Users/{uid} estava sem name ou role, profile.name/role vinha
  // undefined. saveSession passava isso pro Firestore.update(), que rejeita
  // "Unsupported field value: undefined" → write não acontecia → boot
  // detectava mismatch e evictava o usuário recém-logado.
  // Fix: filtrar undefined → empty string.

  test('saveSession aceita user com name=undefined sem lançar', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window._firebase !== 'undefined', {
      timeout: 5000,
    });
    const result = await page.evaluate(async () => {
      const fb = window._firebase;
      // Hijack do _db pra capturar o que seria gravado
      const origDb = fb._db;
      let captured = null;
      fb._db = {
        collection: () => ({
          doc: () => ({
            get: async () => ({ exists: false }),
            set: async (data) => {
              captured = data;
            },
            update: async (data) => {
              captured = data;
            },
          }),
        }),
      };
      try {
        await fb.saveSession(
          { id: 'tester1', name: undefined, role: undefined },
          'sid-x'
        );
      } finally {
        fb._db = origDb;
      }
      return captured;
    });
    expect(result, 'saveSession deve ter capturado uma escrita').not.toBeNull();
    // Os campos vieram saneados pra string vazia (não undefined)
    expect(result.name).toBe('');
    expect(result.role).toBe('');
    // Mas userId, sessionId e device foram preservados
    expect(result.userId).toBe('tester1');
    expect(result.sessionId).toBe('sid-x');
    expect(typeof result.device).toBe('string');
  });

  test('saveSession aceita user com name=null sem lançar', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window._firebase !== 'undefined', {
      timeout: 5000,
    });
    const result = await page.evaluate(async () => {
      const fb = window._firebase;
      const origDb = fb._db;
      let captured = null;
      fb._db = {
        collection: () => ({
          doc: () => ({
            get: async () => ({ exists: false }),
            set: async (data) => {
              captured = data;
            },
            update: async (data) => {
              captured = data;
            },
          }),
        }),
      };
      try {
        await fb.saveSession({ id: 'tester1', name: null, role: null }, 'sid-y');
      } finally {
        fb._db = origDb;
      }
      return captured;
    });
    expect(result.name).toBe('');
    expect(result.role).toBe('');
  });

  test('saveSession PRESERVA name/role válidos', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window._firebase !== 'undefined', {
      timeout: 5000,
    });
    const result = await page.evaluate(async () => {
      const fb = window._firebase;
      const origDb = fb._db;
      let captured = null;
      fb._db = {
        collection: () => ({
          doc: () => ({
            get: async () => ({ exists: false }),
            set: async (data) => {
              captured = data;
            },
            update: async (data) => {
              captured = data;
            },
          }),
        }),
      };
      try {
        await fb.saveSession(
          { id: 'avila', name: 'Gustavo Ávila', role: 'admin' },
          'sid-z'
        );
      } finally {
        fb._db = origDb;
      }
      return captured;
    });
    expect(result.name).toBe('Gustavo Ávila');
    expect(result.role).toBe('admin');
  });
});

test.describe('Regressão #25 — _subscribe usa .where() pra testers (rules)', () => {
  // Bug: subscribing à collection inteira /Entradas falhava com
  // "Missing or insufficient permissions" pra testers (rules só
  // permitem ler docs próprios). Fix: aplicar .where('userId', '==',
  // legacyId) automaticamente quando o user atual é tester.

  test('_subscribe aplica where() quando user é tester', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window._firebase !== 'undefined', {
      timeout: 5000,
    });
    const result = await page.evaluate(() => {
      const fb = window._firebase;
      // Stub _currentUser pra simular tester logado
      fb._currentUser = { legacyId: 'tester1', name: 'X', role: 'tester' };
      // Hijack _db pra capturar a query construída
      const origDb = fb._db;
      let whereCalled = false;
      let whereArgs = null;
      fb._db = {
        collection: () => ({
          where: (field, op, val) => {
            whereCalled = true;
            whereArgs = { field, op, val };
            return { onSnapshot: () => () => {} };
          },
          onSnapshot: () => () => {},
        }),
      };
      try {
        fb._subscribe('Entradas', 'ieteb_lancamentos', () => {});
      } finally {
        fb._db = origDb;
        fb._currentUser = null;
      }
      return { whereCalled, whereArgs };
    });
    expect(result.whereCalled).toBe(true);
    expect(result.whereArgs).toEqual({ field: 'userId', op: '==', val: 'tester1' });
  });

  test('_subscribe NÃO aplica where() quando user é admin', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window._firebase !== 'undefined', {
      timeout: 5000,
    });
    const result = await page.evaluate(() => {
      const fb = window._firebase;
      fb._currentUser = { legacyId: 'avila', name: 'Y', role: 'admin' };
      const origDb = fb._db;
      let whereCalled = false;
      fb._db = {
        collection: () => ({
          where: () => {
            whereCalled = true;
            return { onSnapshot: () => () => {} };
          },
          onSnapshot: () => () => {},
        }),
      };
      try {
        fb._subscribe('Entradas', 'ieteb_lancamentos', () => {});
      } finally {
        fb._db = origDb;
        fb._currentUser = null;
      }
      return whereCalled;
    });
    expect(result).toBe(false);
  });
});

test.describe('Regressão #26 — Service Worker CACHE_VERSION atualizado', () => {
  // Garante que o CACHE_VERSION no sw.js bumpou. Sem isso, devices
  // com SW velho continuam servindo código antigo mesmo após deploy
  // (foi o que causou "logou no desktop, não loga no mobile").

  test('CACHE_VERSION é v6 ou superior, com data 2026-05-07 ou superior', async ({
    page,
    request,
  }) => {
    // Usa o request fixture do Playwright (fetch direto do contexto do
    // navegador), não fetch dentro de evaluate — alguns servers locais
    // bloqueiam fetch SW resources via window.fetch por CSP/CORS.
    await page.goto('/');
    const baseURL = page.url().replace(/[#?].*$/, '').replace(/\/$/, '');
    const r = await request.get(baseURL + '/sw.js');
    expect(r.ok(), 'sw.js deve ser servido pelo http server').toBe(true);
    const swText = await r.text();
    // Procura linha tipo: const CACHE_VERSION = 'ieteb-vN-YYYYMMDD'
    const match = swText.match(/CACHE_VERSION\s*=\s*['"]ieteb-v(\d+)-(\d{8})['"]/);
    expect(match, 'CACHE_VERSION com formato esperado').not.toBeNull();
    const version = parseInt(match[1], 10);
    const date = match[2];
    expect(version).toBeGreaterThanOrEqual(6);
    expect(date >= '20260507').toBe(true);
  });
});
