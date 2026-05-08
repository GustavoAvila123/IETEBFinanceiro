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
      this._attachFunnelLegendClicks(legendEl, wrap);
    }
  }

  /**
   * Quando o usuário clica num item da legenda, o estágio correspondente
   * salta + os outros desfocam (modo "foco"). Clicar de novo no mesmo
   * item OU clicar fora do funil/legenda volta ao normal.
   * Re-attach a cada render porque o conteúdo do legendEl é reescrito.
   */
  _attachFunnelLegendClicks(legendEl, wrap) {
    // Garante que um listener de "outside-click" remanescente de uma
    // render anterior seja descartado antes de reanexar tudo
    this._funnelClearSelection(legendEl, wrap);

    legendEl.onclick = (e) => {
      const item = e.target.closest('.funnel-metric-item');
      if (!item) return;
      const idx = Number(item.dataset.idx);
      if (Number.isNaN(idx)) return;
      const svg = wrap.querySelector('.funnel-svg');
      const stage = wrap.querySelector(`g.funnel-stage[data-idx="${idx}"]`);
      if (!stage) return;

      const wasActive = item.classList.contains('funnel-metric-item--active');
      // Sempre limpa o estado anterior (toggle off ou troca de seleção)
      this._funnelClearSelection(legendEl, wrap);
      if (wasActive) return; // segundo clique no mesmo item → desliga

      item.classList.add('funnel-metric-item--active');
      stage.classList.add('funnel-stage--selected');
      if (svg) svg.classList.add('funnel-svg--has-selected');

      // Bounce do estágio selecionado
      stage.classList.remove('funnel-stage--bounce');
      void stage.getBoundingClientRect();
      stage.classList.add('funnel-stage--bounce');
      setTimeout(() => stage.classList.remove('funnel-stage--bounce'), 700);

      // Outside-click: deseleciona ao clicar fora do gráfico/legenda.
      // setTimeout(...,0) evita que o próprio click que abriu a seleção
      // já dispare o handler de fechamento no mesmo tick.
      this._funnelOutsideHandler = (ev) => {
        if (!legendEl.contains(ev.target) && !wrap.contains(ev.target)) {
          this._funnelClearSelection(legendEl, wrap);
        }
      };
      setTimeout(
        () => document.addEventListener('click', this._funnelOutsideHandler),
        0,
      );
    };
  }

  _funnelClearSelection(legendEl, wrap) {
    if (legendEl) {
      legendEl
        .querySelectorAll('.funnel-metric-item--active')
        .forEach((el) => el.classList.remove('funnel-metric-item--active'));
    }
    if (wrap) {
      const svg = wrap.querySelector('.funnel-svg');
      if (svg) svg.classList.remove('funnel-svg--has-selected');
      wrap
        .querySelectorAll('.funnel-stage--selected')
        .forEach((el) => el.classList.remove('funnel-stage--selected'));
    }
    if (this._funnelOutsideHandler) {
      document.removeEventListener('click', this._funnelOutsideHandler);
      this._funnelOutsideHandler = null;
    }
  }

  /**
   * Funil 3D PREMIUM — discos coloridos empilhados estilo "torre de
   * discos com gap visível" (referência: funil corporativo clássico),
   * adaptado pro tema dark+gold do app. Cada disco é uma cápsula 3D
   * completa: face superior elíptica iluminada (top), corpo cilíndrico
   * com gradient horizontal (lateral), borda inferior escura (sombra),
   * e gap real entre discos pra reforçar a separação 3D.
   *
   * Inovações:
   * - Numeração gigante translúcida atrás do label (marca d'água)
   * - Reflexo fantasma do funil no "chão" (mirror com fade)
   * - Paleta gold (#1) → azul royal → azul médio → azul escuro
   * - Halo neon azul ao redor + sombra do chão borrada
   */
  _buildFunnelEntradasSVG(items) {
    const W = 400;
    const H = 410;
    const cx = W / 2;
    const topW = 340;          // boca larga (#1)
    const bottomW = 130;       // base estreita do último disco (cabe texto)
    const padTop = 26;
    const padBottom = 88;      // espaço pro bocal + sombra + reflexo
    const gap = 7;             // GAP REAL entre discos (separação visual)
    const totalGap = gap * (items.length - 1);
    const bodyH = H - padTop - padBottom;
    const discH = (bodyH - totalGap) / items.length;
    const ellipseRy = 16;      // achatamento da elipse-rim
    const SAMPLES = 14;

    // Easing power 1.4: afunila lento no topo, acelera no fim — parecido
    // com cone real (não vaso). Mais "funil corporativo" que "garrafa".
    const ease = (t) => Math.pow(Math.max(0, Math.min(1, t)), 1.4);
    const widthAtT = (t) => topW - (topW - bottomW) * ease(t);
    const ryAtT = (t) => (widthAtT(t) / topW) * ellipseRy;

    // Path do CORPO CILÍNDRICO de um disco (lateral) — arco no topo +
    // arco na base + laterais curvas amostradas
    const discBodyPath = (yTop, yBottom, wTop, wBottom, ryTop, ryBottom) => {
      const parts = [`M${cx - wTop / 2},${yTop}`];
      // Lado esquerdo descendo
      parts.push(`L${cx - wBottom / 2},${yBottom}`);
      // Arco da base (rim de baixo)
      parts.push(`A${wBottom / 2},${ryBottom} 0 0 0 ${cx + wBottom / 2},${yBottom}`);
      // Lado direito subindo
      parts.push(`L${cx + wTop / 2},${yTop}`);
      // Arco do topo (de volta) — half-ellipse na frente
      parts.push(`A${wTop / 2},${ryTop} 0 0 1 ${cx - wTop / 2},${yTop}`);
      parts.push('Z');
      return parts.join(' ');
    };

    // 4 paletas premium: GOLD (líder #1) → AZUL ROYAL → AZUL MÉDIO → AZUL ESCURO
    // Cada uma tem: top (face superior elíptica) e body (lateral cilíndrica)
    const palettes = [
      {
        name: 'gold',
        topStops: ['#fff5c8', '#f0d061', '#a87a18'],
        bodyStops: ['#3d2c08', '#a87f1e', '#f5d97a', '#a87f1e', '#2a1d05'],
        rimDark: '#1a1305',
      },
      {
        name: 'royal',
        topStops: ['#dfeaff', '#7eb1f5', '#1f4488'],
        bodyStops: ['#0d2354', '#3e74cc', '#9ec6ff', '#3e74cc', '#091e4a'],
        rimDark: '#04102a',
      },
      {
        name: 'medium',
        topStops: ['#cfdcf5', '#5a8bd5', '#1a3a7c'],
        bodyStops: ['#06173a', '#244e9c', '#7ba6e3', '#244e9c', '#04102a'],
        rimDark: '#020812',
      },
      {
        name: 'deep',
        topStops: ['#a8b8d5', '#3e6196', '#0e2354'],
        bodyStops: ['#020812', '#1a3e7e', '#5b87cb', '#1a3e7e', '#020716'],
        rimDark: '#000408',
      },
    ];

    // Gera os <defs> dinâmicos por estágio (1 gradient top + 1 gradient body cada)
    const paletteDefs = items
      .map((_, i) => {
        const p = palettes[i % palettes.length];
        return `
          <radialGradient id="discTop${i}" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%"  stop-color="${p.topStops[0]}" />
            <stop offset="55%" stop-color="${p.topStops[1]}" />
            <stop offset="100%" stop-color="${p.topStops[2]}" />
          </radialGradient>
          <linearGradient id="discBody${i}" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stop-color="${p.bodyStops[0]}" />
            <stop offset="22%"  stop-color="${p.bodyStops[1]}" />
            <stop offset="50%"  stop-color="${p.bodyStops[2]}" />
            <stop offset="78%"  stop-color="${p.bodyStops[3]}" />
            <stop offset="100%" stop-color="${p.bodyStops[4]}" />
          </linearGradient>
        `;
      })
      .join('');

    // ───────────────────────────────────────────────────────────
    // GERA OS DISCOS (cada um é um <g class="funnel-stage">)
    // ───────────────────────────────────────────────────────────
    const stages = items
      .map((item, i) => {
        const t0 = i / items.length;
        const t1 = (i + 1) / items.length;
        const yTop = padTop + i * (discH + gap);
        const yBottom = yTop + discH;
        const wTop = widthAtT(t0);
        const wBottom = widthAtT(t1);
        const ryTop = ryAtT(t0);
        const ryBottom = ryAtT(t1);
        const palette = palettes[i % palettes.length];

        const bodyPath = discBodyPath(yTop, yBottom, wTop, wBottom, ryTop, ryBottom);

        // Highlight especular esquerdo (acompanha a curva do disco)
        const hlLeft = (() => {
          const opening = 0.18;
          const x1 = cx - wTop / 2 + 5;
          const y1 = yTop + ryTop * 0.3;
          const x2 = cx - wBottom / 2 + 5;
          const y2 = yBottom - ryBottom * 0.3;
          return `M${x1 + (wTop - wBottom) * opening * 0.05},${y1} L${x2},${y2}`;
        })();

        const numberY = yTop + discH * 0.62;
        const labelY = yTop + discH * 0.38;
        const valueY = yTop + discH * 0.72;
        const stageId = `stage-${i}`;

        return `
          <g class="funnel-stage" data-idx="${i}"
             style="transform-origin: ${cx}px ${(yTop + yBottom) / 2}px;">

            <!-- 1. Sombra DO DISCO no gap (fica bem abaixo, no espaço entre fatias) -->
            <ellipse cx="${cx}" cy="${yBottom + gap * 0.6}"
                     rx="${wBottom / 2 * 0.95}" ry="${ryBottom * 0.55}"
                     fill="${palette.rimDark}" opacity="0.85"
                     filter="url(#discDropShadow)" />

            <!-- 2. CORPO CILÍNDRICO (lateral do disco) — gradient horizontal premium -->
            <path d="${bodyPath}" fill="url(#discBody${i})"
                  stroke="rgba(0,0,0,0.45)" stroke-width="0.6" />

            <!-- 3. Iluminação vertical (claro topo, escuro base) -->
            <path d="${bodyPath}" fill="url(#discBodyVertical)" opacity="0.45" />

            <!-- 4. Reflexo radial interno (foco de luz superior-esquerdo) -->
            <path d="${bodyPath}" fill="url(#discInnerReflect)" opacity="0.5" />

            <!-- 5. Highlight especular (linha branca curvada na lateral esquerda) -->
            <path d="${hlLeft}" stroke="rgba(255,255,255,0.85)" stroke-width="1.4"
                  stroke-linecap="round" fill="none" opacity="0.85" />

            <!-- 6. Borda inferior elíptica ESCURA (sombra sob o disco, dentro dele) -->
            <ellipse cx="${cx}" cy="${yBottom}" rx="${wBottom / 2}" ry="${ryBottom}"
                     fill="rgba(0,0,0,0.55)" />
            <!-- Anel claro fino na borda inferior (espessura do material) -->
            <path d="M${cx - wBottom / 2 + 2},${yBottom - 1}
                     A${wBottom / 2 - 2},${ryBottom * 0.7} 0 0 0
                     ${cx + wBottom / 2 - 2},${yBottom - 1}"
                  stroke="rgba(255,255,255,0.18)" stroke-width="0.8"
                  fill="none" />

            <!-- 7. TOPO do disco: face elíptica iluminada (gradient radial) -->
            <ellipse cx="${cx}" cy="${yTop}" rx="${wTop / 2}" ry="${ryTop}"
                     fill="url(#discTop${i})"
                     stroke="rgba(255,255,255,0.55)" stroke-width="0.6" />

            <!-- 8. Brilho especular fino no topo (reflexo cromado) -->
            <ellipse cx="${cx}" cy="${yTop - ryTop * 0.45}"
                     rx="${wTop / 2 - 14}" ry="${ryTop * 0.32}"
                     fill="url(#discGloss)" opacity="0.95" />

            <!-- 9. INOVAÇÃO: NÚMERO GIGANTE TRANSLÚCIDO como marca d'água
                    atrás do label (tipo "ranking 3D fantasma") -->
            <text x="${cx}" y="${numberY}" class="funnel-bignumber"
                  text-anchor="middle">${i + 1}</text>

            <!-- 10. Label + valor (sobre o número) -->
            <text x="${cx}" y="${labelY}" class="funnel-label">${escHtml(item.label)}</text>
            <text x="${cx}" y="${valueY}" class="funnel-value">R$ ${formatBRL(item.value)}</text>
          </g>
        `;
      })
      .join('');

    // ───────────────────────────────────────────────────────────
    // BOCAL DE SAÍDA (cilindro pequeno embaixo do último disco)
    // ───────────────────────────────────────────────────────────
    const yExitTop = padTop + bodyH + 10;
    const yExitBottom = yExitTop + 22;
    const wExit = widthAtT(1) * 0.55;
    const ryExit = ryAtT(1) * 0.55;
    const exitRim = `
      <!-- Cilindro do bocal -->
      <path d="M${cx - wExit / 2},${yExitTop}
               L${cx - wExit / 2},${yExitBottom}
               A${wExit / 2},${ryExit} 0 0 0 ${cx + wExit / 2},${yExitBottom}
               L${cx + wExit / 2},${yExitTop}
               A${wExit / 2},${ryExit * 0.7} 0 0 1 ${cx - wExit / 2},${yExitTop} Z"
            fill="url(#exitBody)" stroke="rgba(0,0,0,0.5)" stroke-width="0.5" />
      <!-- Topo do bocal (face elíptica) -->
      <ellipse cx="${cx}" cy="${yExitTop}" rx="${wExit / 2}" ry="${ryExit * 0.7}"
               fill="url(#exitTop)" stroke="rgba(255,255,255,0.4)" stroke-width="0.5" />
      <!-- Base do bocal (sombra escura — saída do funil) -->
      <ellipse cx="${cx}" cy="${yExitBottom}" rx="${wExit / 2}" ry="${ryExit}"
               fill="rgba(0,0,0,0.7)" />
      <!-- Anel claro fino na borda superior (espessura) -->
      <path d="M${cx - wExit / 2 + 2},${yExitTop - 1}
               A${wExit / 2 - 2},${ryExit * 0.6} 0 0 0 ${cx + wExit / 2 - 2},${yExitTop - 1}"
            stroke="rgba(255,255,255,0.5)" stroke-width="1"
            fill="none" opacity="0.8" />
    `;

    // ───────────────────────────────────────────────────────────
    // SOMBRA DO CHÃO (elipse blur sob o bocal)
    // ───────────────────────────────────────────────────────────
    const floorY = yExitBottom + 16;
    const floorRx = topW * 0.42;
    const floorShadow = `
      <ellipse class="funnel-floor-shadow" cx="${cx}" cy="${floorY}"
               rx="${floorRx}" ry="9" fill="url(#funilFloorShadow)"
               filter="url(#funilFloorBlur)" />
    `;

    return `
      <svg class="funnel-svg" viewBox="0 0 ${W} ${H}"
           xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
           role="img" aria-label="Funil 3D premium de entradas por curso">
        <defs>
          ${paletteDefs}

          <!-- Iluminação vertical (sobre todo disco): clara em cima, escura embaixo -->
          <linearGradient id="discBodyVertical" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stop-color="rgba(255,255,255,0.55)" />
            <stop offset="50%"  stop-color="rgba(255,255,255,0.04)" />
            <stop offset="100%" stop-color="rgba(0,0,0,0.55)" />
          </linearGradient>

          <!-- Reflexo radial interno: foco de luz no canto superior-esquerdo -->
          <radialGradient id="discInnerReflect" cx="0.28" cy="0.18" r="0.5">
            <stop offset="0%"   stop-color="rgba(255,255,255,0.5)" />
            <stop offset="55%"  stop-color="rgba(255,255,255,0.06)" />
            <stop offset="100%" stop-color="rgba(255,255,255,0)" />
          </radialGradient>

          <!-- Brilho especular fino sobre topo do disco -->
          <linearGradient id="discGloss" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stop-color="rgba(255,255,255,0.95)" />
            <stop offset="100%" stop-color="rgba(255,255,255,0)" />
          </linearGradient>

          <!-- Bocal de saída (cilindro) -->
          <linearGradient id="exitBody" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stop-color="#020812" />
            <stop offset="22%"  stop-color="#1a3e7e" />
            <stop offset="50%"  stop-color="#5b87cb" />
            <stop offset="78%"  stop-color="#1a3e7e" />
            <stop offset="100%" stop-color="#020716" />
          </linearGradient>
          <radialGradient id="exitTop" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%"  stop-color="#a8b8d5" />
            <stop offset="100%" stop-color="#1a3060" />
          </radialGradient>

          <!-- Sombra do chão -->
          <radialGradient id="funilFloorShadow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%"   stop-color="rgba(0,0,0,0.7)" />
            <stop offset="60%"  stop-color="rgba(0,0,0,0.25)" />
            <stop offset="100%" stop-color="rgba(0,0,0,0)" />
          </radialGradient>
          <filter id="funilFloorBlur" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
          </filter>

          <!-- Sombra de drop dos discos no gap (entre discos) -->
          <filter id="discDropShadow" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
          </filter>

          <!-- Halo neon azul ao redor de todos os discos -->
          <filter id="funilHalo" x="-20%" y="-10%" width="140%" height="120%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
            <feFlood flood-color="#5fa1ff" flood-opacity="0.45" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="halo" />
            <feMerge>
              <feMergeNode in="halo" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <!-- INOVAÇÃO: Reflexo fantasma do funil no chão (mirror com fade).
               O <g> dos discos é REUSADO via <use> espelhado verticalmente. -->
          <linearGradient id="funilReflectFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stop-color="rgba(0,0,0,0)" />
            <stop offset="100%" stop-color="rgba(0,0,0,1)" />
          </linearGradient>
          <mask id="funilReflectMask">
            <rect x="0" y="0" width="${W}" height="${H}" fill="url(#funilReflectFade)" />
          </mask>
        </defs>

        <!-- Reflexo fantasma (espelho vertical com mask de fade) -->
        <g transform="translate(0, ${(yExitBottom + 6) * 2}) scale(1, -1)"
           opacity="0.18" mask="url(#funilReflectMask)" pointer-events="none">
          ${stages}
          ${exitRim}
        </g>

        ${floorShadow}

        <g filter="url(#funilHalo)">
          ${stages}
          ${exitRim}
        </g>
      </svg>
    `;
  }

  _buildFunnelEntradasMetrics(items, total) {
    return items
      .map((item, i) => {
        const pct = total > 0 ? (item.value / total) * 100 : 0;
        const rank = i + 1;
        return `
          <li class="funnel-metric-item" data-idx="${i}" tabindex="0"
              role="button" aria-label="Destacar ${escHtml(item.label)}">
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
