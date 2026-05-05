// IETEB Financeiro — Onboarding tour
//
// Tour guiado de primeiro uso. Sem dependência externa (sem driver.js
// ou shepherd) — leve e bate com a identidade visual do app.
//
// Aciona automaticamente uma única vez por usuário (chave de sessão
// em localStorage). Pode ser re-executado via window.onboarding.start().
//
// Estrutura: array de steps com {target, title, body, placement}.
// Highlight do alvo via clip-path inverso no overlay; tooltip
// posicionado relativo ao alvo. Setas e contagem (1/4) embaixo.

(function () {
  'use strict';

  const STORAGE_KEY = 'ieteb_onboarding_done_v1';

  const STEPS = [
    {
      target: '.topbar-menu-btn',
      title: 'Bem-vindo ao IETEB Financeiro!',
      body: 'Aqui no menu você acessa Entradas, Saídas, Relatórios, Tesouraria e Dashboard.',
      placement: 'bottom-start',
    },
    {
      target: '#themeToggleBtn',
      title: 'Tema claro ou escuro',
      body: 'Use este botão para alternar entre tema claro e escuro. A preferência fica salva.',
      placement: 'bottom-end',
    },
    {
      target: '.home-modules',
      title: 'Atalhos rápidos',
      body: 'Os módulos da Home dão acesso direto ao que você precisa. Cada um abre a tela específica.',
      placement: 'top',
    },
    {
      target: '.home-stats',
      title: 'Saldos do mês',
      body: 'Aqui você acompanha entradas, saídas e saldo do mês corrente em tempo real.',
      placement: 'top',
    },
    {
      target: 'body',
      title: 'Pronto pra começar!',
      body: 'Pressione <kbd>?</kbd> a qualquer momento pra ver os atalhos de teclado. Bom trabalho!',
      placement: 'center',
    },
  ];

  let currentIdx = 0;
  let overlayEl = null;
  let tipEl = null;

  function isDone() {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  function markDone() {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch (_) {}
  }

  function getRect(selector) {
    if (selector === 'body') return null; // step central
    const el = document.querySelector(selector);
    if (!el) return null;
    return el.getBoundingClientRect();
  }

  function computeTipPos(rect, placement) {
    if (!rect) {
      // Centralizado na tela
      return { left: '50%', top: '50%', translate: '-50%, -50%' };
    }
    const m = 14; // margin do tooltip ao alvo
    switch (placement) {
      case 'bottom-start':
        return { left: `${rect.left}px`, top: `${rect.bottom + m}px`, translate: '0, 0' };
      case 'bottom-end':
        return { left: `${rect.right}px`, top: `${rect.bottom + m}px`, translate: '-100%, 0' };
      case 'bottom':
        return {
          left: `${rect.left + rect.width / 2}px`,
          top: `${rect.bottom + m}px`,
          translate: '-50%, 0',
        };
      case 'top':
        return {
          left: `${rect.left + rect.width / 2}px`,
          top: `${rect.top - m}px`,
          translate: '-50%, -100%',
        };
      case 'right':
        return {
          left: `${rect.right + m}px`,
          top: `${rect.top + rect.height / 2}px`,
          translate: '0, -50%',
        };
      case 'left':
        return {
          left: `${rect.left - m}px`,
          top: `${rect.top + rect.height / 2}px`,
          translate: '-100%, -50%',
        };
      default:
        return {
          left: `${rect.left + rect.width / 2}px`,
          top: `${rect.bottom + m}px`,
          translate: '-50%, 0',
        };
    }
  }

  function makeSpotlightSvgClip(rect) {
    if (!rect) return '';
    // Cria um clip-path que cobre tudo MENOS o retângulo do alvo (com padding)
    const pad = 8;
    const r = 10; // border-radius do recorte
    const x = Math.max(0, rect.left - pad);
    const y = Math.max(0, rect.top - pad);
    const w = rect.width + pad * 2;
    const h = rect.height + pad * 2;
    return `polygon(
      0 0, 100% 0, 100% 100%, 0 100%, 0 0,
      ${x}px ${y + r}px,
      ${x}px ${y + h - r}px,
      ${x + r}px ${y + h}px,
      ${x + w - r}px ${y + h}px,
      ${x + w}px ${y + h - r}px,
      ${x + w}px ${y + r}px,
      ${x + w - r}px ${y}px,
      ${x + r}px ${y}px,
      ${x}px ${y + r}px,
      0 0
    )`;
  }

  function render() {
    const step = STEPS[currentIdx];
    if (!step) return finish();

    // Se o alvo não existe (tela muda durante o tour), pula
    let rect = null;
    if (step.target !== 'body') {
      rect = getRect(step.target);
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        currentIdx++;
        return render();
      }
    }

    if (!overlayEl) buildDom();

    // Atualiza spotlight
    overlayEl.style.clipPath = step.target === 'body' ? 'none' : makeSpotlightSvgClip(rect);

    // Atualiza tooltip
    const pos = computeTipPos(rect, step.placement);
    tipEl.style.left = pos.left;
    tipEl.style.top = pos.top;
    tipEl.style.transform = `translate(${pos.translate})`;
    tipEl.querySelector('.onboarding-title').textContent = step.title;
    tipEl.querySelector('.onboarding-body').innerHTML = step.body;
    tipEl.querySelector('.onboarding-count').textContent =
      `${currentIdx + 1} / ${STEPS.length}`;

    // Botão de "Voltar" some no primeiro step
    const prev = tipEl.querySelector('.onboarding-prev');
    prev.style.visibility = currentIdx === 0 ? 'hidden' : '';
    // Botão de "Próximo" vira "Concluir" no último
    const next = tipEl.querySelector('.onboarding-next');
    next.textContent = currentIdx === STEPS.length - 1 ? 'Concluir' : 'Próximo →';
  }

  function buildDom() {
    overlayEl = document.createElement('div');
    overlayEl.className = 'onboarding-overlay';
    overlayEl.id = 'onboardingOverlay';
    overlayEl.addEventListener('click', (e) => {
      if (e.target === overlayEl) finish(); // click fora do tooltip fecha
    });

    tipEl = document.createElement('div');
    tipEl.className = 'onboarding-tip';
    tipEl.innerHTML = `
      <div class="onboarding-header">
        <span class="onboarding-count">1 / ${STEPS.length}</span>
        <button class="onboarding-skip" type="button" aria-label="Pular tour">Pular</button>
      </div>
      <h3 class="onboarding-title"></h3>
      <p class="onboarding-body"></p>
      <div class="onboarding-actions">
        <button class="onboarding-prev" type="button">← Voltar</button>
        <button class="onboarding-next" type="button">Próximo →</button>
      </div>
    `;
    document.body.appendChild(overlayEl);
    document.body.appendChild(tipEl);

    tipEl.querySelector('.onboarding-skip').addEventListener('click', finish);
    tipEl.querySelector('.onboarding-prev').addEventListener('click', prev);
    tipEl.querySelector('.onboarding-next').addEventListener('click', next);

    document.addEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (!overlayEl) return;
    if (e.key === 'Escape') finish();
    else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
    else if (e.key === 'ArrowLeft') prev();
  }

  function next() {
    if (currentIdx >= STEPS.length - 1) return finish();
    currentIdx++;
    render();
  }

  function prev() {
    if (currentIdx <= 0) return;
    currentIdx--;
    render();
  }

  function finish() {
    markDone();
    document.removeEventListener('keydown', onKey);
    if (overlayEl) overlayEl.remove();
    if (tipEl) tipEl.remove();
    overlayEl = tipEl = null;
    currentIdx = 0;
  }

  function start(force) {
    if (!force && isDone()) return;
    currentIdx = 0;
    render();
  }

  // Inicia automaticamente se: (1) usuário ainda não viu, (2) está
  // na home (não num formulário), (3) splash já saiu.
  function autoStart() {
    if (isDone()) return;
    const splash = document.getElementById('appBootSplash');
    if (splash && getComputedStyle(splash).display !== 'none') {
      // Espera o splash sumir
      const obs = new MutationObserver(() => {
        if (getComputedStyle(splash).display === 'none') {
          obs.disconnect();
          setTimeout(autoStart, 300);
        }
      });
      obs.observe(splash, { attributes: true, attributeFilter: ['style', 'class'] });
      return;
    }
    // Se a Home não está visível (login na frente), aguarda evento
    const home = document.getElementById('pageHome');
    if (!home || home.classList.contains('page-content--hidden')) {
      setTimeout(autoStart, 800);
      return;
    }
    setTimeout(() => start(false), 600);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoStart);
  } else {
    autoStart();
  }

  window.onboarding = { start, finish, isDone };
})();
