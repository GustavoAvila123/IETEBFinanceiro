
class TesourariaPage {
  constructor(modal) {
    this.modal   = modal;
    this.caixaMes = '';
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
    document.getElementById('caixaDiaLimpar').style.display = 'none';
    this.render();
  }

  clearDia() {
    document.getElementById('caixaDiaFiltroDE').value  = '';
    document.getElementById('caixaDiaFiltroATE').value = '';
    document.getElementById('caixaDiaLimpar').style.display = 'none';
    this.render();
  }

  onFiltroDeBlur() {
    const deEl  = document.getElementById('caixaDiaFiltroDE');
    const ateEl = document.getElementById('caixaDiaFiltroATE');
    if (deEl.value && ateEl.value && dateInputToISO(ateEl.value) < dateInputToISO(deEl.value)) {
      ateEl.value = '';
      document.getElementById('caixaDataModal').style.display = 'flex';
      return;
    }
    this.render();
  }

  onFiltroAteBlur() {
    const deEl  = document.getElementById('caixaDiaFiltroDE');
    const ateEl = document.getElementById('caixaDiaFiltroATE');
    if (deEl.value && ateEl.value && dateInputToISO(ateEl.value) < dateInputToISO(deEl.value)) {
      ateEl.value = '';
      document.getElementById('caixaDataModal').style.display = 'flex';
      return;
    }
    this.render();
  }

  render() {
    const [year, month] = this.caixaMes.split('-').map(Number);
    document.getElementById('caixaMesLabel').textContent = `${MESES[month - 1]} ${year}`;

    const mesInicio = `${this.caixaMes}-01`;
    const ultimoDia = new Date(year, month, 0).getDate();
    const mesFim    = `${this.caixaMes}-${String(ultimoDia).padStart(2, '0')}`;

    const deEl  = document.getElementById('caixaDiaFiltroDE');
    const ateEl = document.getElementById('caixaDiaFiltroATE');
    if (deEl)  { deEl.min  = mesInicio; deEl.max  = mesFim; }
    if (ateEl) { ateEl.min = mesInicio; ateEl.max = mesFim; }

    const deISO     = deEl  && deEl.value.length  === 10 ? dateInputToISO(deEl.value)  : '';
    const ateISO    = ateEl && ateEl.value.length === 10 ? dateInputToISO(ateEl.value) : '';
    const filtroDE  = deISO  && deISO  >= mesInicio && deISO  <= mesFim ? deISO  : mesInicio;
    const filtroATE = ateISO && ateISO >= mesInicio && ateISO <= mesFim ? ateISO : mesFim;
    const filtroAtivo = (deEl && deEl.value) || (ateEl && ateEl.value);
    document.getElementById('caixaDiaLimpar').style.display = filtroAtivo ? 'flex' : 'none';

    const todasEntradas = JSON.parse(localStorage.getItem('ieteb_lancamentos') || '[]');
    const todasSaidas   = JSON.parse(localStorage.getItem('ieteb_saidas')      || '[]');

    const entradasAnt = todasEntradas.filter(i => i.dataDeposito && i.dataDeposito < mesInicio);
    const saidasAnt   = todasSaidas.filter(i => i.data && i.data < mesInicio);

    const entradas = todasEntradas.filter(i => i.dataDeposito && i.dataDeposito >= filtroDE && i.dataDeposito <= filtroATE);
    const saidas   = todasSaidas.filter(i => i.data && i.data >= filtroDE && i.data <= filtroATE);

    const sumBy = (arr, tipo) =>
      arr.filter(i => i.formaPagamento === tipo).reduce((s, i) => s + parseBRL(i.valor), 0);

    const ab      = this._getSaldoAbertura();
    const abMaos  = parseBRL(ab.dinheiro);
    const abConta = parseBRL(ab.conta);

    const antMaos  = abMaos  + sumBy(entradasAnt, 'Dinheiro') - sumBy(saidasAnt, 'Dinheiro');
    const antConta = abConta + sumBy(entradasAnt, 'Pix') + sumBy(entradasAnt, 'Débito') + sumBy(entradasAnt, 'Crédito') - sumBy(saidasAnt, 'Pix');
    const antTotal = antMaos + antConta;

    const eDin = sumBy(entradas, 'Dinheiro');
    const ePix = sumBy(entradas, 'Pix');
    const eDeb = sumBy(entradas, 'Débito');
    const eCre = sumBy(entradas, 'Crédito');
    const eTotal = eDin + ePix + eDeb + eCre;

    const sDin   = sumBy(saidas, 'Dinheiro');
    const sPix   = sumBy(saidas, 'Pix');
    const sTotal = sDin + sPix;

    const saldoMaos  = antMaos  + eDin - sDin;
    const saldoConta = antConta + ePix + eDeb + eCre - sPix;
    const saldoTotal = saldoMaos + saldoConta;

    const cls = v => v >= 0 ? 'caixa-saldo-item-value--positivo' : 'caixa-saldo-item-value--negativo';
    const dot = tipo => `<span class="caixa-dot caixa-dot--${tipo}"></span>`;

    const periodoLabel = filtroAtivo
      ? `de ${deEl.value || isoToDateInput(mesInicio)} até ${ateEl.value || isoToDateInput(mesFim)}`
      : `do Mês`;

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
        <div class="caixa-saldo-item-label">Total</div>
        <div class="caixa-saldo-item-value ${cls(antTotal)}" style="font-size:1.2rem;font-weight:800">R$ ${formatBRL(antTotal)}</div>
      </div>`;

    document.getElementById('caixaEntradas').innerHTML = `
      <div class="caixa-row"><span class="caixa-row-label">${dot('dinheiro')} Dinheiro</span><span class="caixa-row-value">R$ ${formatBRL(eDin)}</span></div>
      <div class="caixa-row"><span class="caixa-row-label">${dot('pix')} PIX</span><span class="caixa-row-value">R$ ${formatBRL(ePix)}</span></div>
      <div class="caixa-row"><span class="caixa-row-label">${dot('debito')} Débito</span><span class="caixa-row-value">R$ ${formatBRL(eDeb)}</span></div>
      <div class="caixa-row"><span class="caixa-row-label">${dot('credito')} Crédito</span><span class="caixa-row-value">R$ ${formatBRL(eCre)}</span></div>
      <div class="caixa-row caixa-row--total"><span class="caixa-row-label">Total</span><span class="caixa-row-value">R$ ${formatBRL(eTotal)}</span></div>`;

    document.getElementById('caixaSaidas').innerHTML = `
      <div class="caixa-row"><span class="caixa-row-label">${dot('dinheiro')} Dinheiro</span><span class="caixa-row-value">R$ ${formatBRL(sDin)}</span></div>
      <div class="caixa-row"><span class="caixa-row-label">${dot('pix')} PIX</span><span class="caixa-row-value">R$ ${formatBRL(sPix)}</span></div>
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
