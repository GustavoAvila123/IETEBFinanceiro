class NavigationManager {
  constructor({
    entradaPage,
    saidaPage,
    relatorioPage,
    tesourariaPage,
    dashboardPage,
    auditoriaPage,
    backupPage,
  }) {
    this.entradaPage = entradaPage;
    this.saidaPage = saidaPage;
    this.relatorioPage = relatorioPage;
    this.tesourariaPage = tesourariaPage;
    this.dashboardPage = dashboardPage;
    this.auditoriaPage = auditoriaPage;
    this.backupPage = backupPage;
  }

  initAdminUI() {
    const isAdmin = getCurrentUser().role === 'admin';
    ['sidebarAdminSection', 'navAuditoria', 'navBackup'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = isAdmin ? '' : 'none';
    });
  }

  showPage(page) {
    // Auditoria e Backup são restritos a admin — defesa em
    // profundidade caso alguém tente abrir via console.
    if ((page === 'auditoria' || page === 'backup') && getCurrentUser().role !== 'admin') {
      page = 'home';
    }
    [
      'home',
      'lancamentos',
      'saidas',
      'relatorios',
      'caixa',
      'dashboard',
      'auditoria',
      'backup',
    ].forEach((p) => {
        document
          .getElementById('page' + p.charAt(0).toUpperCase() + p.slice(1))
          .classList.toggle('page-content--hidden', p !== page);
        document
          .getElementById('nav' + p.charAt(0).toUpperCase() + p.slice(1))
          .classList.toggle('nav-item--active', p === page);
      }
    );

    const titles = {
      home: 'Home',
      lancamentos: 'Entradas',
      saidas: 'Saídas',
      relatorios: 'Relatórios',
      caixa: 'Tesouraria',
      dashboard: 'Dashboard',
      auditoria: 'Auditoria',
      backup: 'Backup & Restauração',
    };
    document.getElementById('topbarTitle').textContent = titles[page] || 'IETEB';

    // Fecha o menu ANTES dos resets de página — assim, mesmo se algum
    // resetPage lançar (DOM stale entre versões cacheadas, etc.), o
    // sidebar do PWA não fica preso aberto sobre a tela nova.
    // IMPORTANTE: closeSidebar() pode RESTAURAR o scroll position antigo
    // (quando o sidebar travou o body via modal-open). Então o scrollTo(0,0)
    // PRECISA vir DEPOIS dele, senão a navegação cai numa página já
    // scrolada pra baixo (bug "menu não abre no topo").
    this.closeSidebar();
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    // Página recém-mostrada também vai pro topo (caso tenha scroll interno)
    const activePage = document.getElementById(
      'page' + page.charAt(0).toUpperCase() + page.slice(1)
    );
    if (activePage) activePage.scrollTop = 0;

    try {
      if (page === 'home') this.initHome();
      if (page === 'lancamentos') this.entradaPage.resetPage();
      if (page === 'saidas') this.saidaPage.resetPage();
      if (page === 'relatorios') this.relatorioPage.resetPage();
      if (page === 'caixa') this.tesourariaPage.resetPage();
      if (page === 'dashboard') this.dashboardPage.resetPage();
      if (page === 'auditoria') this.auditoriaPage && this.auditoriaPage.resetPage();
      if (page === 'backup') this.backupPage && this.backupPage.resetPage();
    } catch (e) {
      console.error('[navigation] resetPage falhou:', e);
    }
  }

  initHome() {
    const now = new Date();
    const h = now.getHours();
    const gr = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
    const user = getCurrentUser();
    // Topbar (mobile/tablet) sincronizada com a página atual.
    // Sem isso, fica "Lançamentos" (default do HTML) mesmo na Home.
    const topbarTitle = document.getElementById('topbarTitle');
    if (topbarTitle) topbarTitle.textContent = 'Home';
    document.getElementById('homeGreeting').textContent = `${gr}, ${user.name}!`;
    document.getElementById('homeDate').textContent = now.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const anoMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const { de: ini, ate: fim } = inicioFimDoMes(anoMes);

    const entradas = filtrarEntradasPorPeriodo(getEntradasData(), ini, fim);
    const saidas = filtrarSaidasPorPeriodo(getSaidasData(), ini, fim);

    const totalE = somarValores(entradas);
    const totalS = somarValores(saidas);
    const saldo = totalE - totalS;

    document.getElementById('homeStatEntradas').textContent = `R$ ${formatBRL(totalE)}`;
    document.getElementById('homeStatSaidas').textContent = `R$ ${formatBRL(totalS)}`;
    const saldoEl = document.getElementById('homeStatSaldo');
    saldoEl.textContent = `R$ ${formatBRL(saldo)}`;
    saldoEl.style.color = saldo >= 0 ? '' : 'var(--danger)';
  }

  openSidebar() {
    document.getElementById('sidebar').classList.add('sidebar--open');
    document.getElementById('sidebarOverlay').classList.add('sidebar-overlay--show');
    // No iOS PWA, "overflow: hidden" no body sozinho não trava o scroll
    // do html. Reusa a trava do modal (position: fixed + top negativo)
    // mas só se ainda não estiver travado por um modal — evita quebrar
    // o restore-scroll do ModalManager se sidebar e modal coexistirem.
    if (!document.body.classList.contains('modal-open')) {
      this._sidebarLockedY = window.scrollY || window.pageYOffset || 0;
      document.body.style.top = `-${this._sidebarLockedY}px`;
      document.body.classList.add('modal-open');
      this._sidebarOwnsLock = true;
    }
  }

  closeSidebar() {
    document.getElementById('sidebar').classList.remove('sidebar--open');
    document.getElementById('sidebarOverlay').classList.remove('sidebar-overlay--show');
    if (this._sidebarOwnsLock) {
      document.body.classList.remove('modal-open');
      document.body.style.top = '';
      const y = this._sidebarLockedY;
      this._sidebarLockedY = null;
      this._sidebarOwnsLock = false;
      if (y != null) window.scrollTo(0, y);
    }
  }
}
