
const PAGE_SIZE = 10;

class RelatorioPage {
  constructor(modal, firebase) {
    this.modal    = modal;
    this.firebase = firebase;

    this.reportData   = [];
    this.filteredData = [];
    this.currentPage  = 1;
    this.tipo         = '';
    this.deleteTarget = null;
  }

  _monthRange() {
    const now   = new Date();
    const year  = now.getFullYear();
    const month = now.getMonth();
    const toISO = d => d.toISOString().slice(0, 10);
    return { de: toISO(new Date(year, month, 1)), ate: toISO(new Date(year, month + 1, 0)) };
  }

  resetPage() {
    this.tipo = '';
    document.getElementById('tipoBtnEntradas').classList.remove('tipo-btn--active');
    document.getElementById('tipoBtnSaidas').classList.remove('tipo-btn--active');
    document.getElementById('filtroDataDe').value    = '';
    document.getElementById('filtroDataAte').value   = '';
    document.getElementById('filtroCurso').value     = '';
    document.getElementById('filtroPagamento').value = '';
    this.carregar();
  }

  onTipoChange(tipo) {
    this.tipo = tipo;
    document.getElementById('tipoBtnEntradas').classList.toggle('tipo-btn--active', tipo === 'entradas');
    document.getElementById('tipoBtnSaidas').classList.toggle('tipo-btn--active',   tipo === 'saidas');

    document.getElementById('filtroCursoGrupo').style.display = tipo === 'saidas' ? 'none' : '';
    if (tipo === 'saidas') document.getElementById('filtroCurso').value = '';

    const { de, ate } = this._monthRange();
    document.getElementById('filtroDataDe').value  = isoToDateInput(de);
    document.getElementById('filtroDataAte').value = isoToDateInput(ate);

    document.getElementById('reportTipoPrompt').style.display = 'none';
    document.getElementById('reportFilters').style.display    = '';
    document.getElementById('reportActions').style.display    = '';
    document.getElementById('tableWrap').style.display        = '';
    document.getElementById('pagination').style.display       = '';

    this.carregar();
  }

  carregar() {
    if (!this.tipo) {
      document.getElementById('reportTipoPrompt').style.display = '';
      document.getElementById('reportFilters').style.display    = 'none';
      document.getElementById('reportActions').style.display    = 'none';
      document.getElementById('tableWrap').style.display        = 'none';
      document.getElementById('pagination').style.display       = 'none';
      return;
    }
    const key    = this.tipo === 'saidas' ? 'ieteb_saidas' : 'ieteb_lancamentos';
    this.reportData = JSON.parse(localStorage.getItem(key) || '[]');
    this.aplicarFiltros();
  }

  onFiltroDeChange() {
    const de  = dateInputToISO(document.getElementById('filtroDataDe').value);
    const ate = dateInputToISO(document.getElementById('filtroDataAte').value);
    if (de && ate && ate < de) {
      document.getElementById('filtroDataAte').value = '';
      document.getElementById('filtroDataModal').style.display = 'flex';
      return;
    }
    this.aplicarFiltros();
  }

  onFiltroAteChange() {
    const de  = dateInputToISO(document.getElementById('filtroDataDe').value);
    const ate = dateInputToISO(document.getElementById('filtroDataAte').value);
    if (de && ate && ate < de) {
      document.getElementById('filtroDataAte').value = '';
      document.getElementById('filtroDataModal').style.display = 'flex';
      return;
    }
    this.aplicarFiltros();
  }

  fecharFiltroDataModal() {
    document.getElementById('filtroDataModal').style.display = 'none';
    const ate = document.getElementById('filtroDataAte');
    ate.value = '';
    ate.focus();
  }

  aplicarFiltros() {
    const de        = dateInputToISO(document.getElementById('filtroDataDe').value);
    const ate       = dateInputToISO(document.getElementById('filtroDataAte').value);
    const curso     = document.getElementById('filtroCurso').value;
    const pagamento = document.getElementById('filtroPagamento').value;
    const isSaidas  = this.tipo === 'saidas';

    this.filteredData = this.reportData.filter(item => {
      const itemDate = isSaidas ? item.data : item.dataDeposito;
      if (de  && itemDate < de)  return false;
      if (ate && itemDate > ate) return false;
      if (!isSaidas && curso && item.curso !== curso) return false;
      if (pagamento && item.formaPagamento !== pagamento) return false;
      return true;
    });

    this.currentPage = 1;
    this.renderTabela();
    this.renderPaginacao();
    document.getElementById('reportCount').textContent =
      `${this.filteredData.length} registro${this.filteredData.length !== 1 ? 's' : ''}`;
  }

  limparFiltros() {
    document.getElementById('filtroDataDe').value    = '';
    document.getElementById('filtroDataAte').value   = '';
    document.getElementById('filtroCurso').value     = '';
    document.getElementById('filtroPagamento').value = '';
    this.aplicarFiltros();
  }

  renderTabela() {
    const tbody = document.getElementById('reportTableBody');
    const empty = document.getElementById('tableEmpty');
    const start = (this.currentPage - 1) * PAGE_SIZE;
    const page  = this.filteredData.slice(start, start + PAGE_SIZE);
    const thead = document.getElementById('reportThead');

    if (this.tipo === 'saidas') {
      thead.innerHTML = `<tr>
        <th>Data</th><th>Hora</th><th>Categoria</th><th>Fornecedor</th>
        <th>Pagamento</th><th class="col-valor">Valor</th>
        <th>Obs.</th><th>Comprovante</th><th></th>
      </tr>`;
    } else {
      thead.innerHTML = `<tr>
        <th>Data</th><th>Hora</th><th>Aluno</th><th>Curso</th><th>Igreja</th>
        <th>Pagamento</th><th>Parcela</th><th>Depositante</th><th>Recebedor</th>
        <th>Banco Dep.</th><th>Banco Rec.</th><th class="col-valor">Valor</th>
        <th>Obs.</th><th>Comprovante</th><th></th>
      </tr>`;
    }

    if (!this.filteredData.length) {
      tbody.innerHTML = '';
      empty.style.display = 'flex';
      return;
    }

    const deleteIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
      <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
    </svg>`;
    const viewIcon = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>`;

    empty.style.display = 'none';
    tbody.innerHTML = page.map((item, idx) => {
      const badge     = badgePagamento(item.formaPagamento);
      const globalIdx = (this.currentPage - 1) * PAGE_SIZE + idx;
      const hasComp   = !!(item.comprovante || item.comprovanteUrl);
      const imgCell   = hasComp
        ? `<button class="btn-comprovante" onclick="verComprovante(${globalIdx})" title="Ver">${viewIcon} Ver</button>`
        : `<span class="no-comprovante">—</span>`;
      const delBtn = `<button class="btn-delete-row" onclick="pedirExclusao(${globalIdx})" title="Excluir">${deleteIcon}</button>`;

      if (this.tipo === 'saidas') {
        const data = item.data ? item.data.split('-').reverse().join('/') : '—';
        return `<tr>
          <td data-label="Data">${data}</td>
          <td data-label="Hora">${item.hora || '—'}</td>
          <td data-label="Categoria"  title="${escHtml(item.categoria  || '')}">${escHtml(item.categoria  || '—')}</td>
          <td data-label="Fornecedor" title="${escHtml(item.fornecedor || '')}">${escHtml(item.fornecedor || '—')}</td>
          <td data-label="Pagamento">${badge}</td>
          <td class="col-valor" data-label="Valor">R$ ${escHtml(item.valor || '0,00')}</td>
          <td data-label="Obs." title="${escHtml(item.observacao || '')}">${escHtml(truncate(item.observacao, 20))}</td>
          <td data-label="Comprovante">${imgCell}</td>
          <td>${delBtn}</td>
        </tr>`;
      }

      const data = item.dataDeposito ? item.dataDeposito.split('-').reverse().join('/') : '—';
      return `<tr>
        <td data-label="Data">${data}</td>
        <td data-label="Hora">${item.horaDeposito || '—'}</td>
        <td data-label="Aluno"    title="${escHtml(item.nomeAluno    || '')}">${escHtml(item.nomeAluno    || '—')}</td>
        <td data-label="Curso"    title="${escHtml(item.curso        || '')}">${escHtml(item.curso        || '—')}</td>
        <td data-label="Igreja"   title="${escHtml(item.igreja       || '')}">${escHtml(item.igreja       || '—')}</td>
        <td data-label="Pagamento">${badge}</td>
        <td data-label="Parcela">${escHtml(item.parcela || '—')}</td>
        <td data-label="Depositante" title="${escHtml(item.nomeDepositante || '')}">${escHtml(item.nomeDepositante || '—')}</td>
        <td data-label="Recebedor"   title="${escHtml(item.nomeRecebedor   || '')}">${escHtml(item.nomeRecebedor   || '—')}</td>
        <td data-label="Banco Dep.">${escHtml(item.bancoDepositante || '—')}</td>
        <td data-label="Banco Rec.">${escHtml(item.bancoRecebedor || '—')}</td>
        <td class="col-valor" data-label="Valor">R$ ${escHtml(item.valor || '0,00')}</td>
        <td data-label="Obs." title="${escHtml(item.observacao || '')}">${escHtml(truncate(item.observacao, 20))}</td>
        <td data-label="Comprovante">${imgCell}</td>
        <td>${delBtn}</td>
      </tr>`;
    }).join('');
  }

  renderPaginacao() {
    const total = Math.ceil(this.filteredData.length / PAGE_SIZE);
    const el    = document.getElementById('pagination');
    if (total <= 1) { el.innerHTML = ''; return; }

    let html = `<button class="page-btn" onclick="goPage(${this.currentPage - 1})" ${this.currentPage === 1 ? 'disabled' : ''}>‹</button>`;
    for (let i = 1; i <= total; i++) {
      if (total > 7 && Math.abs(i - this.currentPage) > 2 && i !== 1 && i !== total) {
        if (i === this.currentPage - 3 || i === this.currentPage + 3)
          html += `<span style="padding:0 4px;color:#8090b0">…</span>`;
        continue;
      }
      html += `<button class="page-btn${i === this.currentPage ? ' page-btn--active' : ''}" onclick="goPage(${i})">${i}</button>`;
    }
    html += `<button class="page-btn" onclick="goPage(${this.currentPage + 1})" ${this.currentPage === total ? 'disabled' : ''}>›</button>`;
    el.innerHTML = html;
  }

  goPage(p) {
    const total = Math.ceil(this.filteredData.length / PAGE_SIZE);
    if (p < 1 || p > total) return;
    this.currentPage = p;
    this.renderTabela();
    this.renderPaginacao();
  }

  // ── Exportação PDF ────────────────────────────────────────────────────────────
  exportarPDF() {
    if (!this.filteredData.length) {
      this.modal.showToast('Nenhum registro para imprimir.', 'error');
      return;
    }
    const agora    = new Date().toLocaleString('pt-BR');
    const isSaidas = this.tipo === 'saidas';
    const titulo   = isSaidas ? 'Relatório de Saídas' : 'Relatório de Lançamentos';
    let cabecalho, linhas;

    if (isSaidas) {
      cabecalho = `<th>Data</th><th>Hora</th><th>Categoria</th><th>Fornecedor</th><th>Pagamento</th><th>Valor</th>`;
      linhas = this.filteredData.map(item => {
        const data = item.data ? item.data.split('-').reverse().join('/') : '—';
        return `<tr><td>${data}</td><td>${item.hora || '—'}</td>
          <td>${escHtml(item.categoria || '—')}</td><td>${escHtml(item.fornecedor || '—')}</td>
          <td>${escHtml(item.formaPagamento || '—')}</td><td>R$ ${escHtml(item.valor || '0,00')}</td></tr>`;
      }).join('');
    } else {
      cabecalho = `<th>Data</th><th>Hora</th><th>Aluno</th><th>Curso</th><th>Igreja</th>
        <th>Pagamento</th><th>Depositante</th><th>Banco Dep.</th><th>Banco Rec.</th><th>Valor</th>`;
      linhas = this.filteredData.map(item => {
        const data = item.dataDeposito ? item.dataDeposito.split('-').reverse().join('/') : '—';
        return `<tr><td>${data}</td><td>${item.horaDeposito || '—'}</td>
          <td>${escHtml(item.nomeAluno || '—')}</td><td>${escHtml(item.curso || '—')}</td>
          <td>${escHtml(item.igreja || '—')}</td><td>${escHtml(item.formaPagamento || '—')}</td>
          <td>${escHtml(item.nomeDepositante || '—')}</td><td>${escHtml(item.bancoDepositante || '—')}</td>
          <td>${escHtml(item.bancoRecebedor || '—')}</td><td>R$ ${escHtml(item.valor || '0,00')}</td></tr>`;
      }).join('');
    }

    document.getElementById('printArea').innerHTML = `
      <div class="print-header">
        <h1>IETEB — ${titulo}</h1>
        <p>Gerado em: ${agora} &nbsp;|&nbsp; Total: ${this.filteredData.length} registro(s)</p>
      </div>
      <table class="print-table">
        <thead><tr>${cabecalho}</tr></thead>
        <tbody>${linhas}</tbody>
      </table>
      <div class="print-footer">IETEB — Centro Educacional Teológico</div>`;
    window.print();
  }

  // ── Exportação Excel ──────────────────────────────────────────────────────────
  async exportarExcel() {
    if (!this.filteredData.length) {
      this.modal.showToast('Nenhum registro para exportar.', 'error');
      return;
    }
    if (typeof XLSX === 'undefined') {
      this.modal.showToast('Carregando biblioteca, aguarde...', '');
      await loadScript('https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js');
    }

    const isSaidas = this.tipo === 'saidas';
    const agora    = new Date().toISOString().slice(0, 10);
    let headers, rows, sheetName, fileName, colWidths;

    if (isSaidas) {
      headers   = ['Data','Hora','Categoria','Fornecedor','Forma de Pagamento','Valor','Observação'];
      rows      = this.filteredData.map(item => [
        item.data ? item.data.split('-').reverse().join('/') : '',
        item.hora || '', item.categoria || '', item.fornecedor || '',
        item.formaPagamento || '', `R$ ${item.valor || '0,00'}`, item.observacao || '',
      ]);
      sheetName = 'Saídas';   fileName = `IETEB_Saidas_${agora}.xlsx`;
      colWidths = [8,6,24,28,12,10,24];
    } else {
      headers   = ['Data','Hora','Nome do Aluno','Curso','Igreja','Forma de Pagamento','Depositante','Banco Depositante','Banco Recebedor','Valor','Observação'];
      rows      = this.filteredData.map(item => [
        item.dataDeposito ? item.dataDeposito.split('-').reverse().join('/') : '',
        item.horaDeposito || '', item.nomeAluno || '', item.curso || '',
        item.igreja || '', item.formaPagamento || '', item.nomeDepositante || '',
        item.bancoDepositante || '', item.bancoRecebedor || '',
        `R$ ${item.valor || '0,00'}`, item.observacao || '',
      ]);
      sheetName = 'Lançamentos'; fileName = `IETEB_Lancamentos_${agora}.xlsx`;
      colWidths = [8,6,22,20,28,12,20,16,16,10,20];
    }

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    ws['!cols'] = colWidths.map(w => ({ wch: w }));
    XLSX.writeFile(wb, fileName);
    this.modal.showToast('Excel exportado com sucesso!', 'success');
  }

  // ── Exclusão ──────────────────────────────────────────────────────────────────
  pedirExclusao(idx) {
    const item = this.filteredData[idx];
    if (!item) return;
    this.deleteTarget = item.id;
    this.modal.open('deleteModal');
  }

  confirmarExclusao() {
    if (this.deleteTarget === null) return;
    const colName    = this.tipo === 'saidas' ? 'Saídas' : 'Entradas';
    const storageKey = this.tipo === 'saidas' ? 'ieteb_saidas' : 'ieteb_lancamentos';
    const todos = JSON.parse(localStorage.getItem(storageKey) || '[]');
    const novos = todos.filter(l => l.id !== this.deleteTarget);
    localStorage.setItem(storageKey, JSON.stringify(novos));
    this.firebase.delete(colName, this.deleteTarget);
    this.deleteTarget = null;
    this.modal.close('deleteModal');
    this.carregar();
    this.modal.showToast('Registro excluído.', 'success');
  }

  closeDeleteModal() { this.modal.close('deleteModal'); this.deleteTarget = null; }

  // ── Comprovante ───────────────────────────────────────────────────────────────
  verComprovante(idx) {
    const item = this.filteredData[idx];
    const src  = item && (item.comprovante || item.comprovanteUrl);
    if (!src) return;

    const imgEl   = document.getElementById('imgModalImg');
    const pdfEl   = document.getElementById('imgModalPdf');
    const emptyEl = document.getElementById('imgModalEmpty');

    imgEl.style.display   = 'none';
    pdfEl.style.display   = 'none';
    emptyEl.style.display = 'none';

    const isPdf = src.startsWith('data:application/pdf') || item.comprovanteType === 'pdf';
    const isImg = src.startsWith('data:image') || item.comprovanteType === 'image' || src.startsWith('http');

    if (isPdf) {
      pdfEl.src           = src;
      pdfEl.style.display = 'block';
    } else if (isImg) {
      imgEl.src           = src;
      imgEl.style.display = 'block';
    } else {
      emptyEl.style.display = 'flex';
    }

    this.modal.open('imgModal');
  }

  closeImgModal() {
    this.modal.close('imgModal');
    document.getElementById('imgModalImg').src = '';
    document.getElementById('imgModalPdf').src = '';
  }
}
