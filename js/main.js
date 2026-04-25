
// ── Instâncias ────────────────────────────────────────────────────────────────
const firebase   = new FirebaseManager();
const modal      = new ModalManager();
const ocr        = new OCREntradas(modal);
const entradas   = new EntradaPage(modal, firebase, ocr);
const saidas     = new SaidaPage(modal, firebase);
const relatorios = new RelatorioPage(modal, firebase);
const tesouraria = new TesourariaPage(modal);
const dashboard  = new DashboardPage();
const login      = new LoginPage(modal);

// Injeta referência cruzada (OCR precisa de entradas para selectPayment/switchTab)
ocr.setEntradaPage(entradas);

const nav = new NavigationManager({
  entradaPage:    entradas,
  saidaPage:      saidas,
  relatorioPage:  relatorios,
  tesourariaPage: tesouraria,
  dashboardPage:  dashboard,
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXPOSIÇÃO GLOBAL (necessária para onclick="..." no HTML)
// ═══════════════════════════════════════════════════════════════════════════════

// Navegação
window.showPage      = p => nav.showPage(p);
window.openSidebar   = () => nav.openSidebar();
window.closeSidebar  = () => nav.closeSidebar();

// Login / Logout
window.handleLogin      = e  => login.handleLogin(e);
window.toggleLoginPw    = () => login.toggleLoginPw();
window.openLogoutModal  = () => login.openLogoutModal(nav);
window.closeLogoutModal = () => login.closeLogoutModal();
window.confirmarLogout  = () => login.confirmarLogout();

// Modal genérico / Notificação
window.openModal       = id => modal.open(id);
window.closeModal      = id => modal.close(id);
window.closeNotifModal = () => modal.closeNotif();
window.showToast       = (msg, type) => modal.showToast(msg, type);

// Entradas — abas, payment, upload
window.switchTab           = tab => entradas.switchTab(tab);
window.openChurchDropdown  = () => entradas.openChurchDropdown();
window.filterChurches      = v  => entradas.filterChurches(v);
window.selectChurch        = v  => entradas.selectChurch(v);
window.lockPayment         = () => entradas.lockPayment();
window.unlockPayment       = () => entradas.unlockPayment();
window.selectPayment       = btn => entradas.selectPayment(btn);
window.ajustarFormPorPagamento = t => entradas.ajustarFormPorPagamento(t);
window.onDragOver          = e  => entradas.onDragOver(e);
window.onDragLeave         = () => entradas.onDragLeave();
window.onDrop              = e  => entradas.onDrop(e);
window.onFileSelected      = i  => entradas.onFileSelected(i);
window.removeFile          = () => entradas.removeFile();
window.lerComprovante      = () => entradas.lerComprovante();

// Entradas — alunos
window.addAlunoRow    = ()  => entradas.addAlunoRow();
window.removeAlunoRow = id  => entradas.removeAlunoRow(id);

// Entradas — salvar / limpar
window.salvarLancamento  = () => entradas.salvarLancamento();
window.limparFormulario  = () => entradas.limparFormulario();

// OCR Entradas
window.confirmarOcr = () => ocr.confirmar();
window.closeOcrModal= () => ocr.closeModal();

// Saídas
window.switchTabSaida       = tab => saidas.switchTab(tab);
window.lockPaymentSaida     = () => saidas.lockPayment();
window.unlockPaymentSaida   = () => saidas.unlockPayment();
window.selectPaymentSaida   = btn => saidas.selectPayment(btn);
window.onDragOverSaida      = e  => saidas.onDragOver(e);
window.onDragLeaveSaida     = () => saidas.onDragLeave();
window.onDropSaida          = e  => saidas.onDrop(e);
window.onFileSelectedSaida  = i  => saidas.onFileSelected(i);
window.removeFileSaida      = () => saidas.removeFile();
window.lerNF                = () => saidas.lerNF();
window.confirmarOcrSaida    = () => saidas.confirmarOcr();
window.closeOcrModalSaida   = () => saidas.closeOcrModal();
window.salvarSaida          = () => saidas.salvarSaida();
window.limparSaida          = () => saidas.limparSaida();

// Relatórios
window.onTipoRelatorioChange  = t  => relatorios.onTipoChange(t);
window.carregarRelatorio      = () => relatorios.carregar();
window.onFiltroDeChange       = () => relatorios.onFiltroDeChange();
window.onFiltroAteChange      = () => relatorios.onFiltroAteChange();
window.fecharFiltroDataModal  = () => relatorios.fecharFiltroDataModal();
window.aplicarFiltros         = () => relatorios.aplicarFiltros();
window.limparFiltros          = () => relatorios.limparFiltros();
window.goPage                 = p  => relatorios.goPage(p);
window.exportarPDF            = () => relatorios.exportarPDF();
window.exportarExcel          = () => relatorios.exportarExcel();
window.pedirExclusao          = idx => relatorios.pedirExclusao(idx);
window.confirmarExclusao      = () => relatorios.confirmarExclusao();
window.closeDeleteModal       = () => relatorios.closeDeleteModal();
window.verComprovante         = idx => relatorios.verComprovante(idx);
window.closeImgModal          = () => relatorios.closeImgModal();

// Tesouraria
window.initCaixa          = () => tesouraria.init();
window.caixaMesNavegar    = d  => tesouraria.navegar(d);
window.clearCaixaDia      = () => tesouraria.clearDia();
window.onCaixaFiltroDeBlur  = () => tesouraria.onFiltroDeBlur();
window.onCaixaFiltroAteBlur = () => tesouraria.onFiltroAteBlur();

// Dashboard
window.initDashboard   = () => dashboard.init();
window.dashMesNavegar  = d  => dashboard.navegar(d);

// Atualização manual — exibe overlay fosco até os dados chegarem
window.forceRefresh = () => {
  const overlay = document.getElementById('refreshOverlay');
  const btns = [
    document.getElementById('topbarRefreshBtn'),
    document.getElementById('sidebarRefreshBtn'),
  ].filter(Boolean);
  if (overlay) overlay.classList.remove('refresh-overlay--hidden');
  btns.forEach(b => b.classList.add('refreshing'));
  firebase.forceRefresh(() => {
    if (overlay) overlay.classList.add('refresh-overlay--hidden');
    btns.forEach(b => b.classList.remove('refreshing'));
  });
};

// maskCurrency, onDateInput, onDateBlur, onlyNumbers, clearFieldError
// já são globais (function declarations em helpers.js / format.js) — não precisam de wrapper

// ═══════════════════════════════════════════════════════════════════════════════
// INICIALIZAÇÃO
// ═══════════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  login.checkAuth();
  firebase.init();
  entradas.initAlunosContainer();
  entradas.initValidationListeners();
  saidas.initValidationListeners();

  // Re-renderiza a página ativa ao receber atualização em tempo real do Firestore
  firebase.setDataUpdateCallback(() => {
    const pagesMap = {
      pageRelatorios: () => relatorios.carregar(),
      pageCaixa:      () => tesouraria.render(),
      pageDashboard:  () => dashboard.render(),
      pageHome:       () => nav.initHome(),
    };
    for (const [pageId, fn] of Object.entries(pagesMap)) {
      const el = document.getElementById(pageId);
      if (el && !el.classList.contains('page-content--hidden')) { fn(); break; }
    }
  });

  firebase.load(() => nav.initHome());

  // Atualiza página ativa imediatamente após qualquer save local
  document.addEventListener('ieteb:data-changed', () => {
    const pagesMap = {
      pageRelatorios: () => relatorios.carregar(),
      pageCaixa:      () => tesouraria.render(),
      pageDashboard:  () => dashboard.render(),
      pageHome:       () => nav.initHome(),
    };
    for (const [pageId, fn] of Object.entries(pagesMap)) {
      const el = document.getElementById(pageId);
      if (el && !el.classList.contains('page-content--hidden')) { fn(); break; }
    }
  });

  // Reconecta silenciosamente quando o app volta ao foco (mobile suspende WebSocket)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') firebase.silentRefresh();
  });
  window.addEventListener('pageshow', e => {
    if (e.persisted) firebase.silentRefresh();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.getElementById('churchDropdown').classList.remove('church-dropdown--open');
      modal.close('ocrModal');
      modal.close('ocrModalSaida');
      relatorios.closeImgModal();
      relatorios.closeDeleteModal();
      modal.closeNotif();
      relatorios.fecharFiltroDataModal();
      modal.close('caixaDataModal');
      login.closeLogoutModal();
      nav.closeSidebar();
    }
  });
});
