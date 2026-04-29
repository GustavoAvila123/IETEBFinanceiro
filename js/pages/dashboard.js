
class DashboardPage {
  constructor() {
    this.dashMes    = '';
    this.dashCharts = {};
    this._closePickerHandler = null;
  }

  _mesAtualISO() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  init() {
    if (!this.dashMes) this.dashMes = this._mesAtualISO();
    this.render();
  }

  resetPage() {
    this.dashMes = this._mesAtualISO();
    this.render();
  }

  navegar(delta) {
    const [year, month] = this.dashMes.split('-').map(Number);
    const d = new Date(year, month - 1 + delta, 1);
    this.dashMes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    this.fecharPicker();
    this.render();
  }

  // ── Picker mês/ano ────────────────────────────────────────────────────
  togglePicker(evt) {
    if (evt) evt.stopPropagation();
    const picker = document.getElementById('dashMonthPicker');
    const label  = document.getElementById('dashMesLabel');
    if (!picker) return;
    const open = picker.hasAttribute('hidden');
    if (open) {
      this._buildPicker();
      picker.removeAttribute('hidden');
      if (label) label.setAttribute('aria-expanded', 'true');
      this._closePickerHandler = (e) => {
        const wrap = document.querySelector('.dash-month-controls');
        if (wrap && !wrap.contains(e.target)) this.fecharPicker();
      };
      setTimeout(() => document.addEventListener('mousedown', this._closePickerHandler), 0);
    } else {
      this.fecharPicker();
    }
  }

  fecharPicker() {
    const picker = document.getElementById('dashMonthPicker');
    const label  = document.getElementById('dashMesLabel');
    if (picker) picker.setAttribute('hidden', '');
    if (label) label.setAttribute('aria-expanded', 'false');
    if (this._closePickerHandler) {
      document.removeEventListener('mousedown', this._closePickerHandler);
      this._closePickerHandler = null;
    }
  }

  _buildPicker() {
    const [yearAtual, mesAtual] = this.dashMes.split('-').map(Number);
    const hoje = new Date();
    const anoHoje = hoje.getFullYear();
    const anos = [anoHoje, anoHoje - 1, anoHoje - 2]; // 3 últimos, mais recente primeiro

    const anosEl = document.getElementById('dashPickerAnos');
    if (anosEl) {
      anosEl.innerHTML = anos.map(a => `
        <button type="button" class="dash-picker-btn ${a === yearAtual ? 'dash-picker-btn--active' : ''}"
          onclick="selectDashAno(${a})">${a}</button>
      `).join('');
    }

    const mesesEl = document.getElementById('dashPickerMeses');
    if (mesesEl) {
      const abreviados = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
      mesesEl.innerHTML = abreviados.map((nome, i) => {
        const m = i + 1;
        return `<button type="button" class="dash-picker-btn ${m === mesAtual ? 'dash-picker-btn--active' : ''}"
          onclick="selectDashMes(${m})">${nome}</button>`;
      }).join('');
    }
  }

  selectAno(ano) {
    const [, month] = this.dashMes.split('-').map(Number);
    this.dashMes = `${ano}-${String(month).padStart(2, '0')}`;
    this._buildPicker(); // atualiza highlight do ano
    this.render();
  }

  selectMes(mes) {
    const [year] = this.dashMes.split('-').map(Number);
    this.dashMes = `${year}-${String(mes).padStart(2, '0')}`;
    this.fecharPicker();
    this.render();
  }

  limparFiltro() {
    this.dashMes = this._mesAtualISO();
    this.fecharPicker();
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
    const labelText = document.getElementById('dashMesLabelText');
    if (labelText) labelText.textContent = `${MESES[month - 1]} ${year}`;

    // Mostra "Limpar filtro" se o mês selecionado não for o atual
    const clearBtn = document.getElementById('dashClearFilter');
    if (clearBtn) {
      const filtroAtivo = this.dashMes !== this._mesAtualISO();
      if (filtroAtivo) clearBtn.removeAttribute('hidden');
      else clearBtn.setAttribute('hidden', '');
    }

    const mesInicio = `${this.dashMes}-01`;
    const ultimoDia = new Date(year, month, 0).getDate();
    const mesFim    = `${this.dashMes}-${String(ultimoDia).padStart(2, '0')}`;

    const todasEntradas = getEntradasData();
    const todasSaidas   = getSaidasData();

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
