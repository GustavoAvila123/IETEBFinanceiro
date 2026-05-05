// ── Instâncias ────────────────────────────────────────────────────────────────
const firebase = new FirebaseManager();
window._firebase = firebase; // expõe para login.js usar saveSession/clearSession
const modal = new ModalManager();

// Componentes reutilizáveis
const igrejaDD = new IgrejaDropdown();
const alunosMgr = new AlunosManager();

// OCRs (extração de comprovante / nota fiscal)
const ocrEntradas = new OCREntradas(modal);
const ocrSaidas = new OCRSaidas(modal);

// Pages
const entradas = new EntradaPage(modal, firebase, ocrEntradas, igrejaDD, alunosMgr);
const saidas = new SaidaPage(modal, firebase, ocrSaidas);
const relatorios = new RelatorioPage(modal, firebase);
relatorios.bindAlunoOutsideClose();
const tesouraria = new TesourariaPage(modal);
const dashboard = new DashboardPage(modal);
const monitor = new MonitorPage(firebase);
const login = new LoginPage(modal);

// Referências cruzadas (OCRs precisam da page para selectPayment, switchTab, removeFile)
ocrEntradas.setEntradaPage(entradas);
ocrSaidas.setSaidaPage(saidas);

// Aliases para compat com código antigo que ainda referencia "ocr"
const ocr = ocrEntradas;

const nav = new NavigationManager({
  entradaPage: entradas,
  saidaPage: saidas,
  relatorioPage: relatorios,
  tesourariaPage: tesouraria,
  dashboardPage: dashboard,
  monitorPage: monitor,
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXPOSIÇÃO GLOBAL (necessária para onclick="..." no HTML)
// ═══════════════════════════════════════════════════════════════════════════════

// Navegação
window.showPage = (p) => nav.showPage(p);
window.openSidebar = () => nav.openSidebar();
window.closeSidebar = () => nav.closeSidebar();

// Login / Logout
window.handleLogin = (e) => login.handleLogin(e);
window.toggleLoginPw = () => login.toggleLoginPw();
window.openLogoutModal = () => login.openLogoutModal(nav);
window.closeLogoutModal = () => login.closeLogoutModal();
window.confirmarLogout = () => login.confirmarLogout();
window.continuarLogado = () => login.continuarLogado();
window.logoutAgora = () => login.logoutAgora();

// Modal genérico / Notificação
window.openModal = (id) => modal.open(id);
window.closeModal = (id) => modal.close(id);
window.closeNotifModal = () => modal.closeNotif();
window.showToast = (msg, type) => modal.showToast(msg, type);

// Modal "Processando/Sucesso" (export PDF/Excel)
window.showProcess = (titulo, descricao) => {
  const wrap = document.querySelector('#processModal .process-modal-wrap');
  if (wrap) wrap.classList.remove('process-modal-wrap--success');
  const t = document.getElementById('processModalTitle');
  const d = document.getElementById('processModalDesc');
  if (t) t.textContent = titulo || 'Preparando...';
  if (d) d.textContent = descricao || 'Aguarde um instante.';
  modal.open('processModal');
};

window.showProcessSuccess = (titulo, descricao, autoCloseMs = 1500) => {
  const wrap = document.querySelector('#processModal .process-modal-wrap');
  if (wrap) wrap.classList.add('process-modal-wrap--success');
  const t = document.getElementById('processModalTitle');
  const d = document.getElementById('processModalDesc');
  if (t) t.textContent = titulo || 'Concluído!';
  if (d) d.textContent = descricao || '';
  if (autoCloseMs > 0) {
    if (window._processCloseTimer) clearTimeout(window._processCloseTimer);
    window._processCloseTimer = setTimeout(() => modal.close('processModal'), autoCloseMs);
  }
};

window.closeProcess = () => {
  if (window._processCloseTimer) {
    clearTimeout(window._processCloseTimer);
    window._processCloseTimer = null;
  }
  modal.close('processModal');
};

// Modal "Revisar campos obrigatórios" (Entradas/Saídas)
window.revisarFormulario = () => {
  modal.close('reviewFormModal');
  const alvo = window._reviewTarget;
  const target = alvo === 'saidas' ? saidas : entradas;
  if (target && typeof target.switchTab === 'function') target.switchTab('manual');

  // Foca o primeiro campo com erro depois da troca de aba
  setTimeout(() => {
    const errEl = document.querySelector(
      (alvo === 'saidas' ? '#panelSaidaManual' : '#panelManual') + ' .field-error:not(:empty)'
    );
    if (!errEl) return;
    const grupo = errEl.closest('.form-group') || errEl.parentElement;
    const input =
      grupo && grupo.querySelector('input, select, textarea, .select-search-wrap input');
    if (input) {
      try {
        input.focus({ preventScroll: true });
      } catch (_) {
        input.focus();
      }
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (errEl.scrollIntoView) {
      errEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 80);
};

// Entradas — abas, payment, upload
window.switchTab = (tab) => entradas.switchTab(tab);
window.openChurchDropdown = () => entradas.openChurchDropdown();
window.filterChurches = (v) => entradas.filterChurches(v);
window.selectChurch = (v) => entradas.selectChurch(v);
window.lockPayment = () => entradas.lockPayment();
window.unlockPayment = () => entradas.unlockPayment();
window.selectPayment = (btn) => entradas.selectPayment(btn);
window.ajustarFormPorPagamento = (t) => entradas.ajustarFormPorPagamento(t);
window.onDragOver = (e) => entradas.onDragOver(e);
window.onDragLeave = () => entradas.onDragLeave();
window.onDrop = (e) => entradas.onDrop(e);
window.onFileSelected = (i) => entradas.onFileSelected(i);
window.removeFile = () => entradas.removeFile();
window.lerComprovante = () => entradas.lerComprovante();

// Entradas — alunos
window.addAlunoRow = () => entradas.addAlunoRow();
window.removeAlunoRow = (id) => entradas.removeAlunoRow(id);

// Entradas — salvar / limpar
window.salvarLancamento = () => entradas.salvarLancamento();
window.limparFormulario = () => entradas.limparFormulario();

// OCR Entradas
window.confirmarOcr = () => ocr.confirmar();
window.closeOcrModal = () => ocr.closeModal();

// Saídas
window.switchTabSaida = (tab) => saidas.switchTab(tab);
window.lockPaymentSaida = () => saidas.lockPayment();
window.unlockPaymentSaida = () => saidas.unlockPayment();
window.selectPaymentSaida = (btn) => saidas.selectPayment(btn);
window.onDragOverSaida = (e) => saidas.onDragOver(e);
window.onDragLeaveSaida = () => saidas.onDragLeave();
window.onDropSaida = (e) => saidas.onDrop(e);
window.onFileSelectedSaida = (i) => saidas.onFileSelected(i);
window.removeFileSaida = () => saidas.removeFile();
window.lerNF = () => saidas.lerNF();
window.confirmarOcrSaida = () => saidas.confirmarOcr();
window.closeOcrModalSaida = () => saidas.closeOcrModal();
window.closeOcrDadosModal = () => saidas.closeOcrDadosModal();
window.salvarSaida = () => saidas.salvarSaida();
window.limparSaida = () => saidas.limparSaida();

// Relatórios
window.onTipoRelatorioChange = (t) => relatorios.onTipoChange(t);
window.carregarRelatorio = () => relatorios.carregar();
window.onFiltroDeChange = () => relatorios.onFiltroDeChange();
window.onFiltroAteChange = () => relatorios.onFiltroAteChange();
window.fecharFiltroDataModal = () => relatorios.fecharFiltroDataModal();
window.aplicarFiltros = () => relatorios.aplicarFiltros();
window.limparFiltros = () => relatorios.limparFiltros();
window.onFiltroAlunoFocus = () => relatorios.onFiltroAlunoFocus();
window.onFiltroAlunoInput = () => relatorios.onFiltroAlunoInput();
window.onFiltroAlunoClear = () => relatorios.onFiltroAlunoClear();
window.selectAluno = (el) => relatorios.selectAluno(el);
window.goPage = (p) => relatorios.goPage(p);
window.exportarPDF = () => relatorios.exportarPDF();
window.exportarExcel = () => relatorios.exportarExcel();
window.pedirExclusao = (idx) => relatorios.pedirExclusao(idx);
window.confirmarExclusao = () => relatorios.confirmarExclusao();
window.closeDeleteModal = () => relatorios.closeDeleteModal();
window.verComprovante = (idx) => relatorios.verComprovante(idx);
window.closeImgModal = () => relatorios.closeImgModal();
window.zoomImg = (delta) => relatorios.zoomImg(delta);

// Tesouraria
window.initCaixa = () => tesouraria.init();
window.caixaMesNavegar = (d) => tesouraria.navegar(d);
window.clearCaixaDia = () => tesouraria.clearDia();
window.aplicarCaixaFiltro = () => tesouraria.aplicarFiltro();
window.onCaixaFiltroDeBlur = () => tesouraria.onFiltroDeBlur();
window.onCaixaFiltroAteBlur = () => tesouraria.onFiltroAteBlur();
window.fecharCaixaDataModal = () => {
  modal.close('caixaDataModal');
  const ate = document.getElementById('caixaDiaFiltroATE');
  if (ate) ate.focus();
};

// Dashboard
window.initDashboard = () => dashboard.init();
window.dashMesNavegar = (d) => dashboard.navegar(d);
window.toggleDashMonthPicker = (e) => dashboard.togglePicker(e);
window.selectDashAno = (a) => dashboard.selectAno(a);
window.selectDashMes = (m) => dashboard.selectMes(m);
window.limparDashFiltro = () => dashboard.limparFiltro();
window.aplicarDashFiltroDatas = () => dashboard.aplicarFiltroDatas();
window.onDashFiltroDeBlur = () => dashboard.onFiltroDeBlur();
window.onDashFiltroAteBlur = () => dashboard.onFiltroAteBlur();
window.fecharDashDataModal = () => {
  modal.close('dashDataModal');
  const ate = document.getElementById('dashDiaFiltroATE');
  if (ate) ate.focus();
};

// Monitor (admin only)
window.reloadMonitor = () => monitor.render();

// Atualização manual — exibe overlay fosco até os dados chegarem
window.forceRefresh = () => {
  const overlay = document.getElementById('refreshOverlay');
  const btns = [
    document.getElementById('topbarRefreshBtn'),
    document.getElementById('sidebarRefreshBtn'),
  ].filter(Boolean);
  if (overlay) overlay.classList.remove('refresh-overlay--hidden');
  btns.forEach((b) => b.classList.add('refreshing'));
  firebase.forceRefresh(() => {
    if (overlay) overlay.classList.add('refresh-overlay--hidden');
    btns.forEach((b) => b.classList.remove('refreshing'));
  });
};

// maskCurrency, onDateInput, onDateBlur, onlyNumbers, clearFieldError
// já são globais (function declarations em helpers.js / format.js) — não precisam de wrapper

// ═══════════════════════════════════════════════════════════════════════════════
// INICIALIZAÇÃO
// ═══════════════════════════════════════════════════════════════════════════════
// ── Bloqueia zoom no mobile (iOS ignora user-scalable=no, então
// também precisamos preventDefault nos eventos de gesto e no double-tap).
(function preventMobileZoom() {
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((evt) => {
    document.addEventListener(evt, (e) => e.preventDefault(), { passive: false });
  });
  let lastTouchEnd = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) e.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false }
  );
  // Pinch via wheel + ctrl (trackpad) também
  document.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey) e.preventDefault();
    },
    { passive: false }
  );
})();

// ── PWA: registra Service Worker e captura prompt de instalação ──────
//
// Service Worker dá cache offline básico. Só registra em HTTPS (ou
// localhost) — file:// e http:// não suportam.
//
// O evento beforeinstallprompt é disparado pelo Chrome/Edge quando o
// app é "instalável". Guardamos para mostrar o banner quando o usuário
// estiver autenticado.
window._pwaInstallPrompt = null;

if (
  'serviceWorker' in navigator &&
  (location.protocol === 'https:' || location.hostname === 'localhost')
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* falha silenciosa */
    });
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window._pwaInstallPrompt = e;
  // Banner é exibido depois (no checkAuth completed) se usuário não dispensou
  if (typeof window._tryShowInstallBanner === 'function') window._tryShowInstallBanner();
});

window.addEventListener('appinstalled', () => {
  window._pwaInstallPrompt = null;
  try {
    localStorage.setItem('ieteb_pwa_installed', '1');
  } catch (_) {}
  const banner = document.getElementById('pwaInstallBanner');
  if (banner) banner.remove();
});

// Mostra o banner de instalação se: (a) está em mobile/tablet,
// (b) usuário não dispensou nem instalou, (c) já está autenticado.
window._tryShowInstallBanner = function () {
  // Já instalado (rodando em standalone) ou usuário dispensou?
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isStandalone) return;

  let dispensado = false;
  try {
    dispensado =
      localStorage.getItem('ieteb_pwa_dispensed') === '1' ||
      localStorage.getItem('ieteb_pwa_installed') === '1';
  } catch (_) {}
  if (dispensado) return;

  // Precisa estar autenticado pra não atrapalhar o login
  if (sessionStorage.getItem('ieteb_auth') !== '1') return;

  // Não mostra se já existe
  if (document.getElementById('pwaInstallBanner')) return;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const podeInstalarAndroid = !!window._pwaInstallPrompt;

  // Em Android sem o prompt disponível, não tem como instalar via banner
  if (!isIOS && !podeInstalarAndroid) return;

  const banner = document.createElement('div');
  banner.id = 'pwaInstallBanner';
  banner.className = 'pwa-install-banner';
  banner.innerHTML = `
    <div class="pwa-install-icon">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    </div>
    <div class="pwa-install-text">
      <strong>Instalar IETEB Financeiro</strong>
      <span>${
        isIOS
          ? 'Toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.'
          : 'Tenha o app na sua tela inicial — abre como um aplicativo nativo.'
      }</span>
    </div>
    <div class="pwa-install-actions">
      ${isIOS ? '' : '<button class="pwa-install-btn pwa-install-btn--apply" id="pwaInstallApply">Instalar</button>'}
      <button class="pwa-install-btn pwa-install-btn--dismiss" id="pwaInstallDismiss" title="Dispensar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>`;
  document.body.appendChild(banner);

  document.getElementById('pwaInstallDismiss').addEventListener('click', () => {
    try {
      localStorage.setItem('ieteb_pwa_dispensed', '1');
    } catch (_) {}
    banner.remove();
  });

  const applyBtn = document.getElementById('pwaInstallApply');
  if (applyBtn) {
    applyBtn.addEventListener('click', async () => {
      const prompt = window._pwaInstallPrompt;
      if (!prompt) return;
      try {
        prompt.prompt();
        const { outcome } = await prompt.userChoice;
        if (outcome === 'accepted') {
          banner.remove();
        } else {
          try {
            localStorage.setItem('ieteb_pwa_dispensed', '1');
          } catch (_) {}
          banner.remove();
        }
      } catch (_) {
        /* user fechou modal */
      }
      window._pwaInstallPrompt = null;
    });
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  firebase.init();

  // Aguarda restauração de sessão (Firebase Auth persistido) antes de
  // carregar dados/UI. Se autenticado, login.checkAuth() esconde a tela de
  // login. Se não, o login screen permanece e nada de Firestore é assinado.
  const authed = await login.checkAuth();

  // Remove o splash de boot que cobria a tela enquanto Auth restaurava.
  const splash = document.getElementById('appBootSplash');
  if (splash) {
    splash.classList.add('boot-splash--exit');
    setTimeout(() => splash.remove(), 400);
  }

  entradas.initAlunosContainer();
  entradas.initValidationListeners();
  saidas.initValidationListeners();

  if (!authed) return; // sem sessão: para por aqui, espera o user logar

  nav.initAdminUI();

  // Banner "Instalar IETEB" — após autenticação, em mobile, se ainda não
  // dispensado/instalado. Aguarda 2s para não brigar com o splash.
  setTimeout(() => {
    if (typeof window._tryShowInstallBanner === 'function') window._tryShowInstallBanner();
  }, 2000);

  // Re-renderiza a página ativa ao receber atualização em tempo real do Firestore
  firebase.setDataUpdateCallback(() => {
    const pagesMap = {
      pageRelatorios: () => relatorios.carregar(),
      pageCaixa: () => tesouraria.render(),
      pageDashboard: () => dashboard.render(),
      pageHome: () => nav.initHome(),
    };
    for (const [pageId, fn] of Object.entries(pagesMap)) {
      const el = document.getElementById(pageId);
      if (el && !el.classList.contains('page-content--hidden')) {
        fn();
        break;
      }
    }
  });

  firebase.load(() => nav.initHome());

  // Atualiza página ativa imediatamente após qualquer save local
  document.addEventListener('ietebDataChanged', () => {
    const pagesMap = {
      pageRelatorios: () => relatorios.carregar(),
      pageCaixa: () => tesouraria.render(),
      pageDashboard: () => dashboard.render(),
      pageHome: () => nav.initHome(),
    };
    for (const [pageId, fn] of Object.entries(pagesMap)) {
      const el = document.getElementById(pageId);
      if (el && !el.classList.contains('page-content--hidden')) {
        fn();
        break;
      }
    }
  });

  // Topbar ganha sombra ao rolar (apenas mobile, onde a topbar é visível)
  const topbarEl = document.querySelector('.topbar');
  if (topbarEl) {
    let ticking = false;
    const updateTopbarShadow = () => {
      topbarEl.classList.toggle('topbar--scrolled', window.scrollY > 8);
      ticking = false;
    };
    window.addEventListener(
      'scroll',
      () => {
        if (!ticking) {
          requestAnimationFrame(updateTopbarShadow);
          ticking = true;
        }
      },
      { passive: true }
    );
    updateTopbarShadow();
  }

  // Sidebar: swipe-to-close (drag para a esquerda)
  const sidebarEl = document.getElementById('sidebar');
  if (sidebarEl) {
    let startX = 0,
      startY = 0,
      dragging = false,
      deltaX = 0;

    sidebarEl.addEventListener(
      'touchstart',
      (e) => {
        if (!sidebarEl.classList.contains('sidebar--open')) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        dragging = true;
        deltaX = 0;
        sidebarEl.style.transition = 'none';
      },
      { passive: true }
    );

    sidebarEl.addEventListener(
      'touchmove',
      (e) => {
        if (!dragging) return;
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;
        // Só ativa se for gesto predominantemente horizontal pra esquerda
        if (Math.abs(dx) < Math.abs(dy)) return;
        if (dx < 0) {
          deltaX = dx;
          sidebarEl.style.transform = `translateX(${dx}px)`;
        }
      },
      { passive: true }
    );

    sidebarEl.addEventListener('touchend', () => {
      if (!dragging) return;
      dragging = false;
      sidebarEl.style.transition = '';
      sidebarEl.style.transform = '';
      // Se arrastou mais de 80px pra esquerda, fecha
      if (deltaX < -80) nav.closeSidebar();
    });
  }

  // Reconecta silenciosamente quando o app volta ao foco (mobile suspende WebSocket)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') firebase.silentRefresh();
  });
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) firebase.silentRefresh();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.getElementById('churchDropdown').classList.remove('church-dropdown--open');
      modal.close('ocrModal');
      modal.close('ocrModalSaida');
      relatorios.closeImgModal();
      relatorios.closeDeleteModal();
      modal.closeNotif();
      relatorios.fecharFiltroDataModal();
      modal.close('caixaDataModal');
      modal.close('dashDataModal');
      modal.close('reviewFormModal');
      modal.close('processModal');
      login.closeLogoutModal();
      nav.closeSidebar();
    }
  });
});
