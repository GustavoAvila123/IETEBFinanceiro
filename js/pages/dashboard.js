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
   * Funil 3D com laterais CURVAS (não retas): a silhueta usa easing
   * cubic-in-out, criando um perfil de "vaso/garrafa" estilo o print
   * de referência (top largo → afina rápido no meio → base estreita).
   *
   * Cada estágio é um <g class="funnel-stage" data-idx="N">. As bordas
   * laterais são amostradas em vários pontos (pra parecerem curvas) e
   * a base de cada estágio é um arco elíptico (rim 3D).
   */
  _buildFunnelEntradasSVG(items) {
    const W = 360;
    const H = 340;
    const cx = W / 2;
    const topW = 320;          // largura do topo (boca do funil) — bem larga
    const bottomW = 70;        // base estreita (saída do funil)
    const padTop = 22;         // espaço pro rim/lip do topo
    const padBottom = 26;      // espaço pra sombra do chão
    const bodyH = H - padTop - padBottom;
    const stageH = bodyH / items.length;
    const ellipseRyTop = 18;   // achatamento da elipse-rim (perspectiva)
    const SAMPLES = 18;        // pontos por lado por estágio (curva suave)

    // Easing cubic-in-out: começa devagar, acelera no meio, desacelera no fim.
    // É o que dá a "barriga" curvada do funil estilo vaso.
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    // Largura no parâmetro t∈[0,1] (0 = topo, 1 = base)
    const widthAtT = (t) => {
      const tc = Math.max(0, Math.min(1, t));
      return topW - (topW - bottomW) * ease(tc);
    };
    const ryAtT = (t) => (widthAtT(t) / topW) * ellipseRyTop;

    // Constrói o path de um estágio amostrando N pontos por lado.
    const stagePath = (t0, t1) => {
      const yAt = (t) => padTop + t * bodyH;
      const parts = [];
      // Lado direito: do topo (t0) até a base (t1) — descendo
      for (let i = 0; i <= SAMPLES; i++) {
        const t = t0 + (t1 - t0) * (i / SAMPLES);
        const x = cx + widthAtT(t) / 2;
        const y = yAt(t);
        parts.push(i === 0 ? `M${x},${y}` : `L${x},${y}`);
      }
      // Arco elíptico na base (rim de baixo)
      const wB = widthAtT(t1);
      const ryB = ryAtT(t1);
      parts.push(`A${wB / 2},${ryB} 0 0 1 ${cx - wB / 2},${yAt(t1)}`);
      // Lado esquerdo: subindo da base até o topo
      for (let i = SAMPLES - 1; i >= 0; i--) {
        const t = t0 + (t1 - t0) * (i / SAMPLES);
        const x = cx - widthAtT(t) / 2;
        const y = yAt(t);
        parts.push(`L${x},${y}`);
      }
      parts.push('Z');
      return parts.join(' ');
    };

    // Highlight curvo na lateral esquerda (luz vinda de cima-esquerda):
    // segue a curva do estágio, mas deslocado pra dentro.
    const highlightPath = (t0, t1, side, inset, opening, closing) => {
      const yAt = (t) => padTop + t * bodyH;
      const parts = [];
      const sign = side === 'left' ? -1 : 1;
      const startT = t0 + (t1 - t0) * opening;
      const endT = t1 - (t1 - t0) * closing;
      for (let i = 0; i <= SAMPLES; i++) {
        const t = startT + (endT - startT) * (i / SAMPLES);
        const x = cx + sign * (widthAtT(t) / 2 - inset);
        const y = yAt(t);
        parts.push(i === 0 ? `M${x},${y}` : `L${x},${y}`);
      }
      return parts.join(' ');
    };

    const stages = items
      .map((item, i) => {
        const t0 = i / items.length;
        const t1 = (i + 1) / items.length;
        const y0 = padTop + t0 * bodyH;
        const y1 = padTop + t1 * bodyH;
        const w0 = widthAtT(t0);
        const w1 = widthAtT(t1);
        const ry0 = ryAtT(t0);
        const ry1 = ryAtT(t1);

        const path = stagePath(t0, t1);

        const labelY = y0 + (y1 - y0) / 2 - 10;
        const valueY = y0 + (y1 - y0) / 2 + 12;

        const topRim =
          i === 0
            ? `<ellipse cx="${cx}" cy="${y0}" rx="${w0 / 2}" ry="${ry0}"
                       fill="url(#funilTopRim)" />
               <!-- Brilho fino no topo do rim (boca do funil) -->
               <ellipse cx="${cx}" cy="${y0 - ry0 * 0.45}"
                        rx="${w0 / 2 - 8}" ry="${ry0 * 0.32}"
                        fill="url(#funilRimGloss)" opacity="0.9" />`
            : '';

        // Highlight da lateral esquerda (acompanha a curva)
        const hlLeft = highlightPath(t0, t1, 'left', 5, 0.06, 0.08);
        // Sombra sutil da lateral direita (luz cai do esquerdo)
        const hlRight = highlightPath(t0, t1, 'right', 5, 0.06, 0.08);

        return `
          <g class="funnel-stage" data-idx="${i}" style="transform-origin: ${cx}px ${(y0 + y1) / 2}px;">
            <path d="${path}" fill="url(#funilBody${i % 4})"
                  stroke="rgba(255,255,255,0.14)" stroke-width="0.7" />
            <!-- Camada vertical de iluminação (clara no topo, escura na base) -->
            <path d="${path}" fill="url(#funilBodyVertical)" opacity="0.55" />
            <!-- Reflexo de luz especular acompanhando a curva esquerda -->
            <path d="${hlLeft}" stroke="rgba(255,255,255,0.55)" stroke-width="3"
                  stroke-linecap="round" fill="none" opacity="0.65" />
            <path d="${hlLeft}" stroke="rgba(255,255,255,0.85)" stroke-width="1"
                  stroke-linecap="round" fill="none" opacity="0.7" />
            <!-- Sombra na lateral direita (lado oposto à luz) -->
            <path d="${hlRight}" stroke="rgba(0,0,0,0.32)" stroke-width="2.2"
                  stroke-linecap="round" fill="none" opacity="0.65" />
            ${topRim}
            <!-- Sombra interna no rim de baixo pra dar profundidade -->
            <ellipse cx="${cx}" cy="${y1}" rx="${w1 / 2}" ry="${ry1}"
                     fill="url(#funilInnerShadow)" opacity="0.7" />
            <text x="${cx}" y="${labelY}" class="funnel-label">${escHtml(item.label)}</text>
            <text x="${cx}" y="${valueY}" class="funnel-value">R$ ${formatBRL(item.value)}</text>
          </g>
        `;
      })
      .join('');

    // Sombra do "chão" — elipse borrada sob a base, mostra que o funil
    // está apoiado em uma superfície
    const floorY = padTop + bodyH + 8;
    const floorRx = bottomW * 1.8;
    const floorShadow = `
      <ellipse class="funnel-floor-shadow" cx="${cx}" cy="${floorY}"
               rx="${floorRx}" ry="7" fill="url(#funilFloorShadow)"
               filter="url(#funilFloorBlur)" />
    `;

    return `
      <svg class="funnel-svg" viewBox="0 0 ${W} ${H}"
           xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
           role="img" aria-label="Funil 3D de entradas por curso (maior valor no topo)">
        <defs>
          <!-- Gradient horizontal do corpo: cada estágio com intensidade
               diferente pra simular profundidade descendo.
               5 stops dão volume tipo "vidro polido" (claro nas bordas
               internas, mais escuro nos cantos externos). -->
          <linearGradient id="funilBody0" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stop-color="#214a9a" />
            <stop offset="22%"  stop-color="#5a98ee" />
            <stop offset="50%"  stop-color="#9cc4ff" />
            <stop offset="78%"  stop-color="#4a82dc" />
            <stop offset="100%" stop-color="#1a3c84" />
          </linearGradient>
          <linearGradient id="funilBody1" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stop-color="#193b80" />
            <stop offset="22%"  stop-color="#4980d4" />
            <stop offset="50%"  stop-color="#85b2f2" />
            <stop offset="78%"  stop-color="#3a6dc0" />
            <stop offset="100%" stop-color="#0f2b66" />
          </linearGradient>
          <linearGradient id="funilBody2" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stop-color="#142e69" />
            <stop offset="22%"  stop-color="#3a6dba" />
            <stop offset="50%"  stop-color="#6f9ce0" />
            <stop offset="78%"  stop-color="#2a59a4" />
            <stop offset="100%" stop-color="#0a1f4f" />
          </linearGradient>
          <linearGradient id="funilBody3" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stop-color="#0d2354" />
            <stop offset="22%"  stop-color="#2c5aa0" />
            <stop offset="50%"  stop-color="#5b87cb" />
            <stop offset="78%"  stop-color="#1f4488" />
            <stop offset="100%" stop-color="#06163b" />
          </linearGradient>
          <!-- Camada vertical: clareia o topo do estágio, escurece a base.
               Aplicada com opacity reduzida sobre o body horizontal pra
               simular a luz do alto + sombra acumulada na base. -->
          <linearGradient id="funilBodyVertical" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stop-color="rgba(255,255,255,0.45)" />
            <stop offset="40%"  stop-color="rgba(255,255,255,0.05)" />
            <stop offset="100%" stop-color="rgba(0,0,0,0.45)" />
          </linearGradient>
          <!-- Faixa de brilho horizontal (gloss) — mais forte no centro -->
          <linearGradient id="funilGloss" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stop-color="rgba(255,255,255,0.85)" />
            <stop offset="60%"  stop-color="rgba(255,255,255,0.25)" />
            <stop offset="100%" stop-color="rgba(255,255,255,0)" />
          </linearGradient>
          <!-- Rim de cima (boca do funil): mais claro, simula luz refletida -->
          <linearGradient id="funilTopRim" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stop-color="#cfe2ff" />
            <stop offset="55%"  stop-color="#7eb1f5" />
            <stop offset="100%" stop-color="#1f4488" />
          </linearGradient>
          <!-- Brilho fino que corre por cima do rim (espelho/reflexo) -->
          <linearGradient id="funilRimGloss" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stop-color="rgba(255,255,255,0.95)" />
            <stop offset="100%" stop-color="rgba(255,255,255,0)" />
          </linearGradient>
          <!-- Sombra interna nos rims de baixo (entre estágios) -->
          <radialGradient id="funilInnerShadow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%"   stop-color="rgba(0,0,0,0.55)" />
            <stop offset="100%" stop-color="rgba(0,0,0,0)" />
          </radialGradient>
          <!-- Sombra do chão sob a base do funil -->
          <radialGradient id="funilFloorShadow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%"   stop-color="rgba(0,0,0,0.55)" />
            <stop offset="70%"  stop-color="rgba(0,0,0,0.18)" />
            <stop offset="100%" stop-color="rgba(0,0,0,0)" />
          </radialGradient>
          <filter id="funilFloorBlur" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3.2" />
          </filter>
        </defs>
        ${floorShadow}
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
