
class TesourariaPage {
  constructor(modal) {
    this.modal   = modal;
    this.caixaMes = '';
    this.filtroAplicado = false;
  }

  _getSaldoAbertura() {
    return JSON.parse(localStorage.getItem('ieteb_saldo_abertura') || '{"dinheiro":"","conta":""}');
  }

  init() {
    if (!this.caixaMes) {
      const now     = new Date();
      this.caixaMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    this.render();
  }

  resetPage() {
    const now     = new Date();
    this.caixaMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    this.clearDia();
  }

  navegar(delta) {
    const [year, month] = this.caixaMes.split('-').map(Number);
    const d = new Date(year, month - 1 + delta, 1);
    this.caixaMes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const deEl  = document.getElementById('caixaDiaFiltroDE');
    const ateEl = document.getElementById('caixaDiaFiltroATE');
    if (deEl)  deEl.value  = '';
    if (ateEl) ateEl.value = '';
    this.filtroAplicado = false;
    this.render();
  }

  clearDia() {
    const deEl  = document.getElementById('caixaDiaFiltroDE');
    const ateEl = document.getElementById('caixaDiaFiltroATE');
    if (deEl)  deEl.value  = '';
    if (ateEl) ateEl.value = '';
    this.filtroAplicado = false;
    this.render();
  }

  aplicarFiltro() {
    const deEl  = document.getElementById('caixaDiaFiltroDE');
    const ateEl = document.getElementById('caixaDiaFiltroATE');
    if (!deEl.value && !ateEl.value) return;
    if (deEl.value && ateEl.value && dateInputToISO(ateEl.value) < dateInputToISO(deEl.value)) {
      ateEl.value = '';
      this.modal.open('caixaDataModal');
      return;
    }
    this.filtroAplicado = true;
    this.render();
  }

  onFiltroDeBlur() {
    const deEl  = document.getElementById('caixaDiaFiltroDE');
    const ateEl = document.getElementById('caixaDiaFiltroATE');
    if (deEl.value && ateEl.value && dateInputToISO(ateEl.value) < dateInputToISO(deEl.value)) {
      ateEl.value = '';
      this.modal.open('caixaDataModal');
    }
  }

  onFiltroAteBlur() {
    const deEl  = document.getElementById('caixaDiaFiltroDE');
    const ateEl = document.getElementById('caixaDiaFiltroATE');
    if (deEl.value && ateEl.value && dateInputToISO(ateEl.value) < dateInputToISO(deEl.value)) {
      ateEl.value = '';
      this.modal.open('caixaDataModal');
    }
  }

  render() {
    const [year, month] = this.caixaMes.split('-').map(Number);
    document.getElementById('caixaMesLabel').textContent = `${MESES[month - 1]} ${year}`;

    const mesInicio = `${this.caixaMes}-01`;
    const ultimoDia = new Date(year, month, 0).getDate();
    const mesFim    = `${this.caixaMes}-${String(ultimoDia).padStart(2, '0')}`;

    const deEl  = document.getElementById('caixaDiaFiltroDE');
    const ateEl = document.getElementById('caixaDiaFiltroATE');

    const deISO  = deEl  && deEl.value.length  === 10 ? dateInputToISO(deEl.value)  : '';
    const ateISO = ateEl && ateEl.value.length === 10 ? dateInputToISO(ateEl.value) : '';

    let filtroDE, filtroATE, saldoAntCutoff, periodoLabel;
    if (this.filtroAplicado && (deISO || ateISO)) {
      filtroDE       = deISO  || '0000-01-01';
      filtroATE      = ateISO || '9999-12-31';
      saldoAntCutoff = filtroDE;
      const deLabel  = deEl.value  || '...';
      const ateLabel = ateEl.value || '...';
      periodoLabel   = `de ${deLabel} até ${ateLabel}`;
    } else {
      filtroDE       = mesInicio;
      filtroATE      = mesFim;
      saldoAntCutoff = mesInicio;
      periodoLabel   = 'do Mês';
    }

    const monthControls = document.querySelector('.caixa-month-controls');
    if (monthControls) monthControls.classList.toggle('caixa-month-controls--inactive', this.filtroAplicado);

    const todasEntradas = getEntradasData();
    const todasSaidas   = getSaidasData();

    const entradasAnt = entradasAntes(todasEntradas, saldoAntCutoff);
    const saidasAnt   = saidasAntes(todasSaidas,     saldoAntCutoff);

    const entradas = filtrarEntradasPorPeriodo(todasEntradas, filtroDE, filtroATE);
    const saidas   = filtrarSaidasPorPeriodo  (todasSaidas,   filtroDE, filtroATE);

    const sumBy = somarPorFormaPagamento;

    const ab     = this._getSaldoAbertura();
    const saldoAnt = calcularSaldoSeparado(entradasAnt, saidasAnt, parseBRL(ab.dinheiro), parseBRL(ab.conta));
    const antMaos  = saldoAnt.dinheiro;
    const antConta = saldoAnt.conta;
    const antTotal = saldoAnt.total;

    const eDin = sumBy(entradas, 'Dinheiro');
    const ePix = sumBy(entradas, 'Pix');
    const eDeb = sumBy(entradas, 'Débito');
    const eCre = sumBy(entradas, 'Crédito');
    const eTotal = eDin + ePix + eDeb + eCre;

    const sDin  = sumBy(saidas, 'Dinheiro');
    const sPix  = sumBy(saidas, 'Pix');
    const sDeb  = sumBy(saidas, 'Débito');
    const sCre  = sumBy(saidas, 'Crédito');
    const sTotal = sDin + sPix + sDeb + sCre;

    const saldoAtual = calcularSaldoSeparado(entradas, saidas, antMaos, antConta);
    const saldoMaos  = saldoAtual.dinheiro;
    const saldoConta = saldoAtual.conta;
    const saldoTotal = saldoAtual.total;

    const cls = v => v >= 0 ? 'caixa-saldo-item-value--positivo' : 'caixa-saldo-item-value--negativo';
    const dot = tipo => `<span class="caixa-dot caixa-dot--${tipo}"></span>`;

    document.getElementById('caixaEntradasHeader').innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
      </svg>
      Entradas ${periodoLabel}`;

    document.getElementById('caixaSaidasHeader').innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
      </svg>
      Saídas ${periodoLabel}`;

    document.getElementById('caixaSaldoAnteriorDisplay').innerHTML = `
      <div class="caixa-anterior-item">
        <div class="caixa-saldo-item-label">Dinheiro Físico</div>
        <div class="caixa-saldo-item-value ${cls(antMaos)}" style="font-size:1.1rem">R$ ${formatBRL(antMaos)}</div>
      </div>
      <div class="caixa-anterior-sep"></div>
      <div class="caixa-anterior-item">
        <div class="caixa-saldo-item-label">C/C (Pix / Déb / Créd)</div>
        <div class="caixa-saldo-item-value ${cls(antConta)}" style="font-size:1.1rem">R$ ${formatBRL(antConta)}</div>
      </div>
      <div class="caixa-anterior-sep"></div>
      <div class="caixa-anterior-item">
        <div class="caixa-saldo-item-label">Saldo</div>
        <div class="caixa-saldo-item-value ${cls(antTotal)}" style="font-size:1.2rem;font-weight:800">R$ ${formatBRL(antTotal)}</div>
      </div>`;

    const totalDispEntradas = antTotal + eTotal;

    document.getElementById('caixaEntradas').innerHTML = `
      <div class="caixa-row caixa-row--section-label"><span>Saldo Anterior</span></div>
      <div class="caixa-row"><span class="caixa-row-label">Saldo</span><span class="caixa-row-value ${cls(antTotal)}">R$ ${formatBRL(antTotal)}</span></div>
      <div class="caixa-row--divider"></div>
      <div class="caixa-row caixa-row--section-label"><span>Entradas ${periodoLabel}</span></div>
      <div class="caixa-row"><span class="caixa-row-label">${dot('dinheiro')} Dinheiro</span><span class="caixa-row-value">R$ ${formatBRL(eDin)}</span></div>
      <div class="caixa-row"><span class="caixa-row-label">${dot('pix')} PIX</span><span class="caixa-row-value">R$ ${formatBRL(ePix)}</span></div>
      <div class="caixa-row"><span class="caixa-row-label">${dot('debito')} Débito</span><span class="caixa-row-value">R$ ${formatBRL(eDeb)}</span></div>
      <div class="caixa-row"><span class="caixa-row-label">${dot('credito')} Crédito</span><span class="caixa-row-value">R$ ${formatBRL(eCre)}</span></div>
      <div class="caixa-row caixa-row--total"><span class="caixa-row-label">Total Disponível</span><span class="caixa-row-value ${cls(totalDispEntradas)}">R$ ${formatBRL(totalDispEntradas)}</span></div>`;

    document.getElementById('caixaSaidas').innerHTML = `
      <div class="caixa-row"><span class="caixa-row-label">${dot('dinheiro')} Dinheiro</span><span class="caixa-row-value">R$ ${formatBRL(sDin)}</span></div>
      <div class="caixa-row"><span class="caixa-row-label">${dot('pix')} PIX</span><span class="caixa-row-value">R$ ${formatBRL(sPix)}</span></div>
      <div class="caixa-row"><span class="caixa-row-label">${dot('debito')} Débito</span><span class="caixa-row-value">R$ ${formatBRL(sDeb)}</span></div>
      <div class="caixa-row"><span class="caixa-row-label">${dot('credito')} Crédito</span><span class="caixa-row-value">R$ ${formatBRL(sCre)}</span></div>
      <div class="caixa-row caixa-row--total"><span class="caixa-row-label">Total</span><span class="caixa-row-value">R$ ${formatBRL(sTotal)}</span></div>`;

    document.getElementById('caixaSaldoAtual').innerHTML = `
      <div class="caixa-saldo-item">
        <div class="caixa-saldo-item-label">Dinheiro Físico</div>
        <div class="caixa-saldo-item-value ${cls(saldoMaos)}">R$ ${formatBRL(saldoMaos)}</div>
      </div>
      <div class="caixa-saldo-item">
        <div class="caixa-saldo-item-label">C/C (Pix / Débito / Crédito)</div>
        <div class="caixa-saldo-item-value ${cls(saldoConta)}">R$ ${formatBRL(saldoConta)}</div>
      </div>
      <div class="caixa-saldo-item caixa-saldo-item--total">
        <div class="caixa-saldo-item-label">Saldo Total</div>
        <div class="caixa-saldo-item-value ${cls(saldoTotal)}">R$ ${formatBRL(saldoTotal)}</div>
      </div>`;
  }
}
