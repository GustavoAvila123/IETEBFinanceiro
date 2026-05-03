
class NavigationManager {
  constructor({ entradaPage, saidaPage, relatorioPage, tesourariaPage, dashboardPage, monitorPage }) {
    this.entradaPage   = entradaPage;
    this.saidaPage     = saidaPage;
    this.relatorioPage = relatorioPage;
    this.tesourariaPage= tesourariaPage;
    this.dashboardPage = dashboardPage;
    this.monitorPage   = monitorPage;
  }

  initAdminUI() {
    const isAdmin = getCurrentUser().role === 'admin';
    ['sidebarAdminSection','navMonitor'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = isAdmin ? '' : 'none';
    });
  }

  showPage(page) {
    // Monitor é restrito a admin — defesa em profundidade caso alguém
    // tente abrir via console (a UI já esconde o link no menu).
    if (page === 'monitor' && getCurrentUser().role !== 'admin') {
      page = 'home';
    }
    ['home','lancamentos','saidas','relatorios','caixa','dashboard','monitor'].forEach(p => {
      document.getElementById('page' + p.charAt(0).toUpperCase() + p.slice(1))
        .classList.toggle('page-content--hidden', p !== page);
      document.getElementById('nav' + p.charAt(0).toUpperCase() + p.slice(1))
        .classList.toggle('nav-item--active', p === page);
    });

    const titles = {
      home: 'Home', lancamentos: 'Entradas', saidas: 'Saídas',
      relatorios: 'Relatórios', caixa: 'Tesouraria', dashboard: 'Dashboard',
      monitor: 'Monitor de Testers',
    };
    document.getElementById('topbarTitle').textContent = titles[page] || 'IETEB';
    window.scrollTo(0, 0);

    if (page === 'home')        this.initHome();
    if (page === 'lancamentos') this.entradaPage.resetPage();
    if (page === 'saidas')      this.saidaPage.resetPage();
    if (page === 'relatorios')  this.relatorioPage.resetPage();
    if (page === 'caixa')       this.tesourariaPage.resetPage();
    if (page === 'dashboard')   this.dashboardPage.resetPage();
    if (page === 'monitor')     this.monitorPage && this.monitorPage.resetPage();
    this.closeSidebar();
  }

  initHome() {
    const now  = new Date();
    const h    = now.getHours();
    const gr   = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
    const user = getCurrentUser();
    document.getElementById('homeGreeting').textContent = `${gr}, ${user.name}!`;
    document.getElementById('homeDate').textContent = now.toLocaleDateString('pt-BR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });

    const anoMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const { de: ini, ate: fim } = inicioFimDoMes(anoMes);

    const entradas = filtrarEntradasPorPeriodo(getEntradasData(), ini, fim);
    const saidas   = filtrarSaidasPorPeriodo  (getSaidasData(),   ini, fim);

    const totalE = somarValores(entradas);
    const totalS = somarValores(saidas);
    const saldo  = totalE - totalS;

    document.getElementById('homeStatEntradas').textContent = `R$ ${formatBRL(totalE)}`;
    document.getElementById('homeStatSaidas').textContent   = `R$ ${formatBRL(totalS)}`;
    const saldoEl = document.getElementById('homeStatSaldo');
    saldoEl.textContent = `R$ ${formatBRL(saldo)}`;
    saldoEl.style.color = saldo >= 0 ? '' : 'var(--danger)';
  }

  openSidebar() {
    document.getElementById('sidebar').classList.add('sidebar--open');
    document.getElementById('sidebarOverlay').classList.add('sidebar-overlay--show');
    document.body.style.overflow = 'hidden';
  }

  closeSidebar() {
    document.getElementById('sidebar').classList.remove('sidebar--open');
    document.getElementById('sidebarOverlay').classList.remove('sidebar-overlay--show');
    document.body.style.overflow = '';
  }
}
