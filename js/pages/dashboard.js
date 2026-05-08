class DashboardPage {
  constructor(modal) {
    this.modal = modal;
    this.dashMes = '';
    this.dashCharts = {};
    this._closePickerHandler = null;
    this.filtroAplicado = false;
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
    this.filtroAplicado = false;
    const deEl = document.getElementById('dashDiaFiltroDE');
    const ateEl = document.getElementById('dashDiaFiltroATE');
    if (deEl) deEl.value = '';
    if (ateEl) ateEl.value = '';
    this.render();
  }

  navegar(delta) {
    const [year, month] = this.dashMes.split('-').map(Number);
    const d = new Date(year, month - 1 + delta, 1);
    this.dashMes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    // Navegar mês desativa o filtro de datas (que era específico de período)
    this.filtroAplicado = false;
    const deEl = document.getElementById('dashDiaFiltroDE');
    const ateEl = document.getElementById('dashDiaFiltroATE');
    if (deEl) deEl.value = '';
    if (ateEl) ateEl.value = '';
    this.fecharPicker();
    this.render();
  }

  // ── Filtro de datas (período personalizado) ──────────────────────────
  aplicarFiltroDatas() {
    const deEl = document.getElementById('dashDiaFiltroDE');
    const ateEl = document.getElementById('dashDiaFiltroATE');
    if (!deEl.value && !ateEl.value) return;
    if (deEl.value && ateEl.value && dateInputToISO(ateEl.value) < dateInputToISO(deEl.value)) {
      ateEl.value = '';
      this.modal.open('dashDataModal');
      return;
    }
    this.filtroAplicado = true;
    this.fecharPicker();
    this.render();
  }

  onFiltroDeBlur() {
    const deEl = document.getElementById('dashDiaFiltroDE');
    const ateEl = document.getElementById('dashDiaFiltroATE');
    if (deEl.value && ateEl.value && dateInputToISO(ateEl.value) < dateInputToISO(deEl.value)) {
      ateEl.value = '';
      this.modal.open('dashDataModal');
    }
  }

  onFiltroAteBlur() {
    const deEl = document.getElementById('dashDiaFiltroDE');
    const ateEl = document.getElementById('dashDiaFiltroATE');
    if (deEl.value && ateEl.value && dateInputToISO(ateEl.value) < dateInputToISO(deEl.value)) {
      ateEl.value = '';
      this.modal.open('dashDataModal');
    }
  }

  // ── Picker mês/ano ────────────────────────────────────────────────────
  togglePicker(evt) {
    if (evt) evt.stopPropagation();
    const picker = document.getElementById('dashMonthPicker');
    const label = document.getElementById('dashMesLabel');
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
    const label = document.getElementById('dashMesLabel');
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
    const anos = [anoHoje - 2, anoHoje - 1, anoHoje]; // 3 últimos, ordem ascendente

    const anosEl = document.getElementById('dashPickerAnos');
    if (anosEl) {
      anosEl.innerHTML = anos
        .map(
          (a) => `
        <button type="button" class="dash-picker-btn ${a === yearAtual ? 'dash-picker-btn--active' : ''}"
          onclick="selectDashAno(${a})">${a}</button>
      `
        )
        .join('');
    }

    const mesesEl = document.getElementById('dashPickerMeses');
    if (mesesEl) {
      const abreviados = [
        'Jan',
        'Fev',
        'Mar',
        'Abr',
        'Mai',
        'Jun',
        'Jul',
        'Ago',
        'Set',
        'Out',
        'Nov',
        'Dez',
      ];
      mesesEl.innerHTML = abreviados
        .map((nome, i) => {
          const m = i + 1;
          return `<button type="button" class="dash-picker-btn ${m === mesAtual ? 'dash-picker-btn--active' : ''}"
          onclick="selectDashMes(${m})">${nome}</button>`;
        })
        .join('');
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
    this.filtroAplicado = false;
    const deEl = document.getElementById('dashDiaFiltroDE');
    const ateEl = document.getElementById('dashDiaFiltroATE');
    if (deEl) deEl.value = '';
    if (ateEl) ateEl.value = '';
    this.fecharPicker();
    this.render();
  }

  _loadChartJs() {
    return new Promise((resolve, reject) => {
      if (window.Chart) {
        resolve();
        return;
      }
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async render() {
    const [year, month] = this.dashMes.split('-').map(Number);
    const labelText = document.getElementById('dashMesLabelText');
    if (labelText) labelText.textContent = `${MESES[month - 1]} ${year}`;

    // Período: se o usuário aplicou filtro de datas, usa De/Até; caso
    // contrário, usa o mês selecionado (comportamento original).
    const deEl = document.getElementById('dashDiaFiltroDE');
    const ateEl = document.getElementById('dashDiaFiltroATE');
    const deISO = deEl && deEl.value.length === 10 ? dateInputToISO(deEl.value) : '';
    const ateISO = ateEl && ateEl.value.length === 10 ? dateInputToISO(ateEl.value) : '';

    let periodoDe, periodoAte;
    if (this.filtroAplicado && (deISO || ateISO)) {
      periodoDe = deISO || '0000-01-01';
      periodoAte = ateISO || '9999-12-31';
    } else {
      const r = inicioFimDoMes(this.dashMes);
      periodoDe = r.de;
      periodoAte = r.ate;
    }

    // Quando o filtro de datas está ativo, esmaece a navegação de mês
    const monthControls = document.querySelector('.dash-month-controls');
    if (monthControls)
      {monthControls.classList.toggle('caixa-month-controls--inactive', this.filtroAplicado);}

    // Botão "Limpar filtro" sempre visível — mesmo padrão da Tesouraria.
    // Click sem nada filtrado é no-op (limparFiltro reseta pro estado base).
    const clearBtn = document.getElementById('dashClearFilter');
    if (clearBtn) clearBtn.removeAttribute('hidden');

    const entradas = filtrarEntradasPorPeriodo(getEntradasData(), periodoDe, periodoAte);
    const saidas = filtrarSaidasPorPeriodo(getSaidasData(), periodoDe, periodoAte);

    const totalEntradas = somarValores(entradas);
    const totalSaidas = somarValores(saidas);
    const saldoMes = totalEntradas - totalSaidas;

    document.getElementById('dashTotalEntradas').textContent = `R$ ${formatBRL(totalEntradas)}`;
    document.getElementById('dashTotalSaidas').textContent = `R$ ${formatBRL(totalSaidas)}`;
    const saldoEl = document.getElementById('dashSaldoMes');
    saldoEl.textContent = `R$ ${formatBRL(saldoMes)}`;
    saldoEl.style.color = saldoMes >= 0 ? '' : 'var(--danger, #e53e3e)';

    const porCurso = agruparEntradasPorCurso(entradas);
    const porCategoria = agruparSaidasPorCategoria(saidas);

    try {
      await this._loadChartJs();
    } catch (e) {
      console.error('Falha ao carregar Chart.js', e);
      return;
    }

    this._renderChartEntradas(porCurso);
    this._renderChartSaidas(porCategoria);
  }

  /**
   * Renderiza o gráfico de entradas como FUNIL (em vez de doughnut Chart.js).
   * O curso com maior valor fica no topo (estágio mais largo), os demais
   * descem ordenados — se outro curso ultrapassar em valor depois de um
   * lançamento, ele migra automaticamente pro topo na próxima atualização
   * (que já é disparada por setDataUpdateCallback / ietebDataChanged).
   *
   * Aceita até 4 cursos no funil (limite visual prático). Se houver mais,
   * mostra os 4 maiores e o restante fica fora — o doughnut antigo
   * mostrava todos juntos numa pizza, mas o funil prioriza ranking visual.
   */
  _renderChartEntradas(porCurso) {
    const wrap = document.getElementById('wrapEntradasCurso');
    const legendEl = document.getElementById('legendEntradasCurso');
    // Limpa instância anterior do Chart.js (se houver — ex.: deploy
    // antigo que ainda criou um doughnut na primeira render)
    if (this.dashCharts.entradas) {
      try {
        this.dashCharts.entradas.destroy();
      } catch (_) {}
      delete this.dashCharts.entradas;
    }

    const items = Object.entries(porCurso || {})
      .map(([label, value]) => ({ label, value: Number(value) || 0 }))
      .filter((it) => it.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 4);

    if (!items.length) {
      wrap.innerHTML = '<div class="dash-empty">Nenhuma entrada neste mês</div>';
      if (legendEl) {
        legendEl.innerHTML = '';
        legendEl.classList.remove('dash-chart-legend--funnel');
      }
      return;
    }

    const total = items.reduce((s, it) => s + it.value, 0);
    wrap.innerHTML = this._buildFunnelEntradasSVG(items);
    if (legendEl) {
      legendEl.classList.add('dash-chart-legend--funnel');
      legendEl.innerHTML = this._buildFunnelEntradasMetrics(items, total);
    }
  }

  _buildFunnelEntradasSVG(items) {
    const W = 320;
    const H = 280;
    const stageH = H / items.length;
    const maxW = W - 24;
    // Cada estágio fica progressivamente mais estreito. O ratio aqui
    // controla o "afunilamento": ratio menor → bocal mais reto;
    // ratio maior → funil mais agressivo.
    const shrinkPerStage = items.length > 1 ? maxW * 0.16 : 0;
    const cx = W / 2;

    const stages = items
      .map((item, i) => {
        const y0 = i * stageH;
        const y1 = (i + 1) * stageH;
        const w0 = maxW - i * shrinkPerStage;
        const w1 = maxW - (i + 1) * shrinkPerStage;
        const path = [
          `M${cx - w0 / 2},${y0}`,
          `L${cx + w0 / 2},${y0}`,
          `L${cx + w1 / 2},${y1}`,
          `L${cx - w1 / 2},${y1}`,
          'Z',
        ].join(' ');
        // Opacidade decrescente — dá efeito de profundidade nos estágios
        const opacity = (1 - i * 0.12).toFixed(2);
        const labelY = y0 + stageH / 2 - 8;
        const valueY = y0 + stageH / 2 + 12;
        return `
          <path d="${path}" fill="url(#funilGrad)" opacity="${opacity}"
                stroke="rgba(255,255,255,0.08)" stroke-width="0.5" />
          <text x="${cx}" y="${labelY}" class="funnel-label">${escHtml(item.label)}</text>
          <text x="${cx}" y="${valueY}" class="funnel-value">R$ ${formatBRL(item.value)}</text>
        `;
      })
      .join('');

    return `
      <svg class="funnel-svg" viewBox="0 0 ${W} ${H}"
           xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
           role="img" aria-label="Funil de entradas por curso (maior valor no topo)">
        <defs>
          <linearGradient id="funilGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stop-color="#5fa1ff" />
            <stop offset="50%" stop-color="#2563eb" />
            <stop offset="100%" stop-color="#1e3a8a" />
          </linearGradient>
        </defs>
        ${stages}
      </svg>
    `;
  }

  _buildFunnelEntradasMetrics(items, total) {
    return items
      .map((item, i) => {
        const pct = total > 0 ? (item.value / total) * 100 : 0;
        const rank = i + 1;
        return `
          <li class="funnel-metric-item">
            <span class="funnel-metric-rank">#${rank}</span>
            <div class="funnel-metric-body">
              <span class="funnel-metric-label">${escHtml(item.label)}</span>
              <span class="funnel-metric-value">${pct.toFixed(2)}% do total</span>
            </div>
          </li>
        `;
      })
      .join('');
  }

  _renderChartSaidas(porCategoria) {
    const wrap = document.getElementById('wrapDespesasCategoria');
    const legendEl = document.getElementById('legendDespesasCategoria');
    if (this.dashCharts.saidas) {
      this.dashCharts.saidas.destroy();
      delete this.dashCharts.saidas;
    }

    const labels = Object.keys(porCategoria).sort((a, b) => porCategoria[b] - porCategoria[a]);
    const values = labels.map((l) => porCategoria[l]);

    if (!labels.length) {
      wrap.innerHTML = '<div class="dash-empty">Nenhuma despesa neste mês</div>';
      if (legendEl) legendEl.innerHTML = '';
      return;
    }
    if (!wrap.querySelector('canvas')) {
      wrap.innerHTML = '<canvas id="chartDespesasCategoria"></canvas>';
    }

    const ctx = document.getElementById('chartDespesasCategoria').getContext('2d');
    const colors = labels.map((_, i) => DASH_COLORS[i % DASH_COLORS.length]);

    this.dashCharts.saidas = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { data: values, backgroundColor: colors.slice(), borderRadius: 4, borderSkipped: false },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ` R$ ${formatBRL(ctx.parsed.x)}` } },
        },
        scales: {
          x: {
            grid: { color: 'rgba(0,0,0,0.06)' },
            ticks: { callback: (v) => `R$ ${formatBRL(v)}`, font: { size: 11 } },
          },
          y: { grid: { display: false }, ticks: { font: { size: 12 } } },
        },
        onClick: (_e, els, chart) => this._onChartSliceClick('saidas', chart, els),
      },
    });
    this.dashCharts.saidas._origColors = colors.slice();

    this._buildLegend('saidas', legendEl, labels, values, colors);
  }

  // ── Legenda custom ────────────────────────────────────────────────────
  _buildLegend(key, listEl, labels, values, colors) {
    if (!listEl) return;
    const total = values.reduce((a, b) => a + b, 0) || 1;
    listEl.innerHTML = labels
      .map((label, i) => {
        const pct = (values[i] / total) * 100;
        return `
        <li class="dash-legend-item" data-chart="${key}" data-index="${i}">
          <span class="dash-legend-dot" style="background:${colors[i]}"></span>
          <span class="dash-legend-info">
            <span class="dash-legend-name" title="${escHtml(label)}">${escHtml(label)}</span>
            <span class="dash-legend-value">R$ <strong>${formatBRL(values[i])}</strong></span>
          </span>
          <span class="dash-legend-pct">${pct.toFixed(1).replace('.', ',')}%</span>
        </li>`;
      })
      .join('');

    // Hover na legenda destaca o gomo. Click alterna o destaque persistente.
    listEl.querySelectorAll('.dash-legend-item').forEach((el) => {
      el.addEventListener('mouseenter', () =>
        this._highlight(key, Number(el.dataset.index), false)
      );
      el.addEventListener('mouseleave', () => this._restoreHover(key));
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(el.dataset.index);
        const cur = this._activeIndex && this._activeIndex[key];
        if (cur === idx) this._clearActive(key);
        else this._highlight(key, idx, true);
      });
    });

    // Click fora limpa o destaque persistente
    if (!this._outsideHandler) {
      this._outsideHandler = (e) => {
        const cards = document.querySelectorAll('.dash-chart-card');
        let dentro = false;
        cards.forEach((c) => {
          if (c.contains(e.target)) dentro = true;
        });
        if (!dentro) {
          this._clearActive('entradas');
          this._clearActive('saidas');
        }
      };
      document.addEventListener('click', this._outsideHandler);
    }
  }

  _onChartSliceClick(key, _chart, els) {
    if (!els || !els.length) return;
    const idx = els[0].index;
    const cur = this._activeIndex && this._activeIndex[key];
    if (cur === idx) this._clearActive(key);
    else this._highlight(key, idx, true);
  }

  _highlight(key, idx, persistente) {
    if (!this._activeIndex) this._activeIndex = {};
    if (persistente) this._activeIndex[key] = idx;
    this._applyHighlight(key, idx);
    this._syncLegendActive(key, idx);
  }

  _restoreHover(key) {
    const idx = this._activeIndex && this._activeIndex[key];
    if (idx == null) {
      this._applyHighlight(key, null);
      this._syncLegendActive(key, null);
    } else {
      this._applyHighlight(key, idx);
      this._syncLegendActive(key, idx);
    }
  }

  _clearActive(key) {
    if (this._activeIndex) delete this._activeIndex[key];
    this._applyHighlight(key, null);
    this._syncLegendActive(key, null);
  }

  _applyHighlight(key, idx) {
    const chart = key === 'entradas' ? this.dashCharts.entradas : this.dashCharts.saidas;
    if (!chart) return;
    const ds = chart.data.datasets[0];
    const orig = chart._origColors || [];

    if (idx == null) {
      // Restaura: remove offset, restaura cores cheias.
      if (chart.config.type === 'doughnut') {
        ds.offset = ds.data.map(() => 0);
        ds.borderWidth = 2;
      }
      ds.backgroundColor = orig.slice();
      chart.setActiveElements([]);
    } else {
      // Destaca: o gomo selecionado salta mais e fica em cor cheia,
      // os demais ficam atenuados (alpha baixo) para reforçar o foco.
      if (chart.config.type === 'doughnut') {
        ds.offset = ds.data.map((_, i) => (i === idx ? 28 : 0));
        ds.borderWidth = ds.data.map((_, i) => (i === idx ? 3 : 2));
      }
      ds.backgroundColor = orig.map((c, i) => (i === idx ? c : this._dimColor(c, 0.18)));
      chart.setActiveElements([{ datasetIndex: 0, index: idx }]);
    }
    chart.update();
  }

  // Converte um hex (#RRGGBB) em rgba com a opacidade dada.
  _dimColor(hex, alpha) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return hex;
    const r = parseInt(m[1].slice(0, 2), 16);
    const g = parseInt(m[1].slice(2, 4), 16);
    const b = parseInt(m[1].slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  _syncLegendActive(key, idx) {
    const listId = key === 'entradas' ? 'legendEntradasCurso' : 'legendDespesasCategoria';
    const list = document.getElementById(listId);
    if (!list) return;
    list.querySelectorAll('.dash-legend-item').forEach((el) => {
      const i = Number(el.dataset.index);
      el.classList.toggle('dash-legend-item--active', i === idx);
    });
  }
}
