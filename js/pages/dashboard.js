
class DashboardPage {
  constructor() {
    this.dashMes    = '';
    this.dashCharts = {};
  }

  init() {
    if (!this.dashMes) {
      const now     = new Date();
      this.dashMes  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    this.render();
  }

  resetPage() {
    const now    = new Date();
    this.dashMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    this.render();
  }

  navegar(delta) {
    const [year, month] = this.dashMes.split('-').map(Number);
    const d = new Date(year, month - 1 + delta, 1);
    this.dashMes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    this.render();
  }

  _loadChartJs() {
    return new Promise((resolve, reject) => {
      if (window.Chart) { resolve(); return; }
      const s   = document.createElement('script');
      s.src     = 'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js';
      s.onload  = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async render() {
    const [year, month] = this.dashMes.split('-').map(Number);
    document.getElementById('dashMesLabel').textContent = `${MESES[month - 1]} ${year}`;

    const mesInicio = `${this.dashMes}-01`;
    const ultimoDia = new Date(year, month, 0).getDate();
    const mesFim    = `${this.dashMes}-${String(ultimoDia).padStart(2, '0')}`;

    const todasEntradas = JSON.parse(localStorage.getItem('ieteb_lancamentos') || '[]');
    const todasSaidas   = JSON.parse(localStorage.getItem('ieteb_saidas')      || '[]');

    const entradas = todasEntradas.filter(i => i.dataDeposito && i.dataDeposito >= mesInicio && i.dataDeposito <= mesFim);
    const saidas   = todasSaidas.filter(i => i.data && i.data >= mesInicio && i.data <= mesFim);

    const totalEntradas = entradas.reduce((s, i) => s + parseBRL(i.valor), 0);
    const totalSaidas   = saidas.reduce((s, i) => s + parseBRL(i.valor), 0);
    const saldoMes      = totalEntradas - totalSaidas;

    document.getElementById('dashTotalEntradas').textContent = `R$ ${formatBRL(totalEntradas)}`;
    document.getElementById('dashTotalSaidas').textContent   = `R$ ${formatBRL(totalSaidas)}`;
    const saldoEl = document.getElementById('dashSaldoMes');
    saldoEl.textContent = `R$ ${formatBRL(saldoMes)}`;
    saldoEl.style.color = saldoMes >= 0 ? '' : 'var(--danger, #e53e3e)';

    const porCurso = {};
    entradas.forEach(i => {
      const cursos = Array.isArray(i.alunos)
        ? i.alunos.map(a => a.curso).filter(Boolean)
        : [i.curso].filter(Boolean);
      cursos.forEach(c => { porCurso[c] = (porCurso[c] || 0) + parseBRL(i.valor) / (cursos.length || 1); });
    });

    const porCategoria = {};
    saidas.forEach(i => {
      const cat = i.categoria || 'Outros';
      porCategoria[cat] = (porCategoria[cat] || 0) + parseBRL(i.valor);
    });

    try {
      await this._loadChartJs();
    } catch (e) {
      console.error('Falha ao carregar Chart.js', e);
      return;
    }

    this._renderChartEntradas(porCurso);
    this._renderChartSaidas(porCategoria);
  }

  _renderChartEntradas(porCurso) {
    const wrap = document.getElementById('wrapEntradasCurso');
    if (this.dashCharts.entradas) { this.dashCharts.entradas.destroy(); delete this.dashCharts.entradas; }

    const labels = Object.keys(porCurso);
    const values = Object.values(porCurso);

    if (!labels.length) {
      wrap.innerHTML = '<div class="dash-empty">Nenhuma entrada neste mês</div>';
      return;
    }
    if (!wrap.querySelector('canvas')) {
      wrap.innerHTML = '<canvas id="chartEntradasCurso"></canvas>';
    }

    const ctx    = document.getElementById('chartEntradasCurso').getContext('2d');
    const colors = labels.map((_, i) => DASH_COLORS[i % DASH_COLORS.length]);

    this.dashCharts.entradas = new Chart(ctx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#fff', hoverOffset: 8 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '60%',
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, padding: 14, font: { size: 12 } } },
          tooltip: { callbacks: { label: ctx => ` R$ ${formatBRL(ctx.parsed)}` } },
        },
      },
    });
  }

  _renderChartSaidas(porCategoria) {
    const wrap = document.getElementById('wrapDespesasCategoria');
    if (this.dashCharts.saidas) { this.dashCharts.saidas.destroy(); delete this.dashCharts.saidas; }

    const labels = Object.keys(porCategoria).sort((a, b) => porCategoria[b] - porCategoria[a]);
    const values = labels.map(l => porCategoria[l]);

    if (!labels.length) {
      wrap.innerHTML = '<div class="dash-empty">Nenhuma despesa neste mês</div>';
      return;
    }
    if (!wrap.querySelector('canvas')) {
      wrap.innerHTML = '<canvas id="chartDespesasCategoria"></canvas>';
    }

    const ctx    = document.getElementById('chartDespesasCategoria').getContext('2d');
    const colors = labels.map((_, i) => DASH_COLORS[i % DASH_COLORS.length]);

    this.dashCharts.saidas = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 4, borderSkipped: false }] },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` R$ ${formatBRL(ctx.parsed.x)}` } },
        },
        scales: {
          x: { grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { callback: v => `R$ ${formatBRL(v)}`, font: { size: 11 } } },
          y: { grid: { display: false }, ticks: { font: { size: 12 } } },
        },
      },
    });
  }
}
