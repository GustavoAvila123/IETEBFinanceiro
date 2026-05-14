const PAGE_SIZE = 10;

class RelatorioPage {
  constructor(modal, firebase) {
    this.modal = modal;
    this.firebase = firebase;

    this.reportData = [];
    this.filteredData = [];
    this.currentPage = 1;
    this.tipo = '';
    this.deleteTarget = null;
  }

  _monthRange() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const toISO = (d) => d.toISOString().slice(0, 10);
    return { de: toISO(new Date(year, month, 1)), ate: toISO(new Date(year, month + 1, 0)) };
  }

  resetPage() {
    this.tipo = '';
    // Helpers null-safe — proteção contra HTML cacheado defasado em
    // relação ao JS (acontece quando o SW serve index.html antigo).
    const setVal = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = v;
    };
    const rmCls = (id, c) => {
      const el = document.getElementById(id);
      if (el) el.classList.remove(c);
    };
    rmCls('tipoBtnEntradas', 'tipo-btn--active');
    rmCls('tipoBtnSaidas', 'tipo-btn--active');
    setVal('filtroDataDe', '');
    setVal('filtroDataAte', '');
    setVal('filtroAluno', '');
    setVal('filtroCurso', '');
    setVal('filtroPagamento', '');
    this._toggleClearAluno();
    this.closeAlunoDropdown();
    this.carregar();
  }

  onTipoChange(tipo) {
    this.tipo = tipo;
    const tg = (id, c, on) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle(c, on);
    };
    const dsp = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.style.display = v;
    };
    const setVal = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = v;
    };

    tg('tipoBtnEntradas', 'tipo-btn--active', tipo === 'entradas');
    tg('tipoBtnSaidas', 'tipo-btn--active', tipo === 'saidas');

    // Aluno e Curso só fazem sentido em Entradas
    dsp('filtroAlunoGrupo', tipo === 'saidas' ? 'none' : '');
    dsp('filtroCursoGrupo', tipo === 'saidas' ? 'none' : '');
    if (tipo === 'saidas') {
      setVal('filtroAluno', '');
      setVal('filtroCurso', '');
    }

    const { de, ate } = this._monthRange();
    setVal('filtroDataDe', isoToDateInput(de));
    setVal('filtroDataAte', isoToDateInput(ate));

    dsp('reportTipoPrompt', 'none');
    dsp('reportFilters', '');
    dsp('reportActions', '');
    dsp('tableWrap', '');
    dsp('pagination', '');

    this.carregar();
  }

  carregar() {
    if (!this.tipo) {
      document.getElementById('reportTipoPrompt').style.display = '';
      document.getElementById('reportFilters').style.display = 'none';
      document.getElementById('reportActions').style.display = 'none';
      document.getElementById('tableWrap').style.display = 'none';
      document.getElementById('pagination').style.display = 'none';
      return;
    }
    this.reportData = this.tipo === 'saidas' ? getSaidasData() : getEntradasData();
    this._popularDatalistAlunos();
    this.aplicarFiltros();
  }

  _popularDatalistAlunos() {
    if (this.tipo !== 'entradas') {
      this._alunosUnicos = [];
      return;
    }
    // Lista única, ordenada, ignorando vazios — base do combobox custom
    this._alunosUnicos = Array.from(
      new Set(this.reportData.map((it) => (it.nomeAluno || '').trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  // ── Combobox de Aluno ──────────────────────────────────────────────────
  // Substitui o <datalist> nativo (visual inconsistente entre browsers
  // e mobile) por um dropdown estilizado igual ao .church-dropdown.
  _renderAlunoDropdown(termo) {
    const dd = document.getElementById('filtroAlunoDropdown');
    if (!dd) return;
    const list = this._alunosUnicos || [];
    const t = (termo || '').trim().toLowerCase();
    const filt = t ? list.filter((n) => n.toLowerCase().includes(t)) : list;
    if (!filt.length) {
      dd.innerHTML = `<div class="combobox-empty">Nenhum aluno encontrado</div>`;
    } else {
      dd.innerHTML = filt
        .slice(0, 50)
        .map(
          (n) =>
            `<div class="combobox-option" onmousedown="selectAluno(this)" data-value="${escHtml(n)}">${escHtml(n)}</div>`
        )
        .join('');
    }
    dd.classList.add('combobox-dropdown--open');
  }

  _toggleClearAluno() {
    const inp = document.getElementById('filtroAluno');
    const clear = document.getElementById('filtroAlunoClear');
    if (inp && clear) clear.hidden = !(inp.value || '').trim();
  }

  onFiltroAlunoFocus() {
    this._renderAlunoDropdown(document.getElementById('filtroAluno').value);
  }

  onFiltroAlunoInput() {
    this._renderAlunoDropdown(document.getElementById('filtroAluno').value);
    this._toggleClearAluno();
    this.aplicarFiltros();
  }

  selectAluno(el) {
    const inp = document.getElementById('filtroAluno');
    inp.value = el.dataset.value || '';
    this.closeAlunoDropdown();
    this._toggleClearAluno();
    this.aplicarFiltros();
  }

  onFiltroAlunoClear() {
    const inp = document.getElementById('filtroAluno');
    inp.value = '';
    this._toggleClearAluno();
    this._renderAlunoDropdown('');
    inp.focus();
    this.aplicarFiltros();
  }

  closeAlunoDropdown() {
    const dd = document.getElementById('filtroAlunoDropdown');
    if (dd) dd.classList.remove('combobox-dropdown--open');
  }

  // Fecha o dropdown ao clicar fora — chamado uma vez no init.
  bindAlunoOutsideClose() {
    document.addEventListener('click', (ev) => {
      const wrap = document.querySelector('#filtroAlunoGrupo .combobox-wrap');
      if (!wrap) return;
      if (!wrap.contains(ev.target)) this.closeAlunoDropdown();
    });
  }

  onFiltroDeChange() {
    const de = dateInputToISO(document.getElementById('filtroDataDe').value);
    const ate = dateInputToISO(document.getElementById('filtroDataAte').value);
    if (de && ate && ate < de) {
      document.getElementById('filtroDataAte').value = '';
      this.modal.open('filtroDataModal');
      return;
    }
    this.aplicarFiltros();
  }

  onFiltroAteChange() {
    const de = dateInputToISO(document.getElementById('filtroDataDe').value);
    const ate = dateInputToISO(document.getElementById('filtroDataAte').value);
    if (de && ate && ate < de) {
      document.getElementById('filtroDataAte').value = '';
      this.modal.open('filtroDataModal');
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
    const v = (id) => {
      const el = document.getElementById(id);
      return el ? el.value : '';
    };
    const de = dateInputToISO(v('filtroDataDe'));
    const ate = dateInputToISO(v('filtroDataAte'));
    const aluno = v('filtroAluno').trim().toLowerCase();
    const curso = v('filtroCurso');
    const pagamento = v('filtroPagamento');
    const isSaidas = this.tipo === 'saidas';

    this.filteredData = this.reportData.filter((item) => {
      const itemDate = isSaidas ? item.data : item.dataDeposito;
      if (de && itemDate < de) return false;
      if (ate && itemDate > ate) return false;
      if (!isSaidas && aluno && !(item.nomeAluno || '').toLowerCase().includes(aluno)) return false;
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
    const { de, ate } = this._monthRange();
    // Dispara input+change em cada campo pra que o PickList (e qualquer
    // outro listener) sincronize. Sem o dispatch, value programático é
    // silencioso e o trigger do PickList continua mostrando o filtro
    // anterior — bug "limpar filtros não funciona".
    const setVal = (id, v) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setVal('filtroDataDe', isoToDateInput(de));
    setVal('filtroDataAte', isoToDateInput(ate));
    setVal('filtroAluno', '');
    setVal('filtroCurso', '');
    setVal('filtroPagamento', '');
    this._toggleClearAluno();
    this.closeAlunoDropdown();
    this.aplicarFiltros();
  }

  renderTabela() {
    const tbody = document.getElementById('reportTableBody');
    const empty = document.getElementById('tableEmpty');
    const start = (this.currentPage - 1) * PAGE_SIZE;
    const page = this.filteredData.slice(start, start + PAGE_SIZE);
    const thead = document.getElementById('reportThead');

    if (this.tipo === 'saidas') {
      thead.innerHTML = `<tr>
        <th>Data</th><th>Hora</th><th>Categoria</th><th>Fornecedor</th>
        <th>Pagamento</th><th class="col-valor">Valor</th>
        <th>Obs.</th><th></th>
      </tr>`;
    } else {
      thead.innerHTML = `<tr>
        <th>Data</th><th>Hora</th><th>Aluno</th><th>Curso</th><th>Igreja</th>
        <th>Pagamento</th><th>Parcela</th><th>Depositante</th><th>Recebedor</th>
        <th>Banco Dep.</th><th>Banco Rec.</th><th class="col-valor">Valor</th>
        <th>Obs.</th><th></th>
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
    const editIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <path d="M12 20h9"/>
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
    </svg>`;

    empty.style.display = 'none';
    tbody.innerHTML = page
      .map((item, idx) => {
        const badge = badgePagamento(item.formaPagamento);
        const globalIdx = (this.currentPage - 1) * PAGE_SIZE + idx;
        const editBtn = `<button class="btn-edit-row" onclick="pedirEdicao(${globalIdx})" title="Editar">${editIcon}</button>`;
        const delBtn = `<button class="btn-delete-row" onclick="pedirExclusao(${globalIdx})" title="Excluir">${deleteIcon}</button>`;
        const acoes = editBtn + delBtn;

        if (this.tipo === 'saidas') {
          const data = item.data ? item.data.split('-').reverse().join('/') : '—';
          return `<tr>
          <td data-label="Data">${data}</td>
          <td data-label="Hora">${item.hora || '—'}</td>
          <td data-label="Categoria"  title="${escHtml(item.categoria || '')}">${escHtml(item.categoria || '—')}</td>
          <td data-label="Fornecedor" title="${escHtml(item.fornecedor || '')}">${escHtml(item.fornecedor || '—')}</td>
          <td data-label="Pagamento">${badge}</td>
          <td class="col-valor" data-label="Valor">R$ ${escHtml(item.valor || '0,00')}</td>
          <td data-label="Obs." title="${escHtml(item.observacao || '')}">${escHtml(truncate(item.observacao, 20))}</td>
          <td>${acoes}</td>
        </tr>`;
        }

        const data = item.dataDeposito ? item.dataDeposito.split('-').reverse().join('/') : '—';
        return `<tr>
        <td data-label="Data">${data}</td>
        <td data-label="Hora">${item.horaDeposito || '—'}</td>
        <td data-label="Aluno"    title="${escHtml(item.nomeAluno || '')}">${escHtml(item.nomeAluno || '—')}</td>
        <td data-label="Curso"    title="${escHtml(item.curso || '')}">${escHtml(item.curso || '—')}</td>
        <td data-label="Igreja"   title="${escHtml(item.igreja || '')}">${escHtml(item.igreja || '—')}</td>
        <td data-label="Pagamento">${badge}</td>
        <td data-label="Parcela">${escHtml(item.parcela || '—')}</td>
        <td data-label="Depositante" title="${escHtml(item.nomeDepositante || '')}">${escHtml(item.nomeDepositante || '—')}</td>
        <td data-label="Recebedor"   title="${escHtml(item.nomeRecebedor || '')}">${escHtml(item.nomeRecebedor || '—')}</td>
        <td data-label="Banco Dep.">${escHtml(item.bancoDepositante || '—')}</td>
        <td data-label="Banco Rec.">${escHtml(item.bancoRecebedor || '—')}</td>
        <td class="col-valor" data-label="Valor">R$ ${escHtml(item.valor || '0,00')}</td>
        <td data-label="Obs." title="${escHtml(item.observacao || '')}">${escHtml(truncate(item.observacao, 20))}</td>
        <td>${acoes}</td>
      </tr>`;
      })
      .join('');
  }

  renderPaginacao() {
    const total = Math.ceil(this.filteredData.length / PAGE_SIZE);
    const el = document.getElementById('pagination');
    if (total <= 1) {
      el.innerHTML = '';
      return;
    }

    let html = `<button class="page-btn" onclick="goPage(${this.currentPage - 1})" ${this.currentPage === 1 ? 'disabled' : ''}>‹</button>`;
    for (let i = 1; i <= total; i++) {
      if (total > 7 && Math.abs(i - this.currentPage) > 2 && i !== 1 && i !== total) {
        if (i === this.currentPage - 3 || i === this.currentPage + 3) {
          html += `<span style="padding:0 4px;color:#8090b0">…</span>`;
        }
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
  // Desktop: window.print() (preview do navegador, comportamento original).
  // Mobile:  jsPDF + autotable, gera arquivo e baixa direto (igual Excel).
  exportarPDF() {
    if (!this.filteredData.length) {
      this.modal.showToast('Nenhum registro para imprimir.', 'error');
      return;
    }
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) return this._exportarPdfMobile();
    return this._exportarPdfDesktop();
  }

  _exportarPdfDesktop() {
    if (window.showProcess)
      {window.showProcess('Preparando PDF...', 'Organizando os dados do relatório.');}
    const btns = document.querySelectorAll('.btn-export');
    btns.forEach((b) => {
      b.disabled = true;
      b.classList.add('btn-export--loading');
    });

    const agora = new Date().toLocaleString('pt-BR');
    const isSaidas = this.tipo === 'saidas';
    const titulo = isSaidas ? 'Relatório de Saídas' : 'Relatório de Lançamentos';
    let cabecalho, linhas;

    if (isSaidas) {
      cabecalho = `<th>Data</th><th>Hora</th><th>Categoria</th><th>Fornecedor</th><th>Pagamento</th><th>Valor</th>`;
      linhas = this.filteredData
        .map((item) => {
          const data = item.data ? item.data.split('-').reverse().join('/') : '—';
          return `<tr><td>${data}</td><td>${item.hora || '—'}</td>
          <td>${escHtml(item.categoria || '—')}</td><td>${escHtml(item.fornecedor || '—')}</td>
          <td>${escHtml(item.formaPagamento || '—')}</td><td>R$ ${escHtml(item.valor || '0,00')}</td></tr>`;
        })
        .join('');
    } else {
      cabecalho = `<th>Data</th><th>Hora</th><th>Aluno</th><th>Curso</th><th>Igreja</th>
        <th>Pagamento</th><th>Depositante</th><th>Banco Dep.</th><th>Banco Rec.</th><th>Valor</th>`;
      linhas = this.filteredData
        .map((item) => {
          const data = item.dataDeposito ? item.dataDeposito.split('-').reverse().join('/') : '—';
          return `<tr><td>${data}</td><td>${item.horaDeposito || '—'}</td>
          <td>${escHtml(item.nomeAluno || '—')}</td><td>${escHtml(item.curso || '—')}</td>
          <td>${escHtml(item.igreja || '—')}</td><td>${escHtml(item.formaPagamento || '—')}</td>
          <td>${escHtml(item.nomeDepositante || '—')}</td><td>${escHtml(item.bancoDepositante || '—')}</td>
          <td>${escHtml(item.bancoRecebedor || '—')}</td><td>R$ ${escHtml(item.valor || '0,00')}</td></tr>`;
        })
        .join('');
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

    const reabilitar = () => {
      btns.forEach((b) => {
        b.disabled = false;
        b.classList.remove('btn-export--loading');
      });
    };

    setTimeout(() => {
      let finalizado = false;
      const finalizar = (sucesso = true) => {
        if (finalizado) return;
        finalizado = true;
        reabilitar();
        if (sucesso && window.showProcessSuccess) {
          window.showProcessSuccess('PDF pronto', 'Documento enviado para impressão.');
        } else if (window.closeProcess) {
          window.closeProcess();
        }
      };

      try {
        const onAfterPrint = () => {
          window.removeEventListener('afterprint', onAfterPrint);
          finalizar(true);
        };
        window.addEventListener('afterprint', onAfterPrint);
        window.print();
        setTimeout(() => finalizar(true), 1200);
      } catch (_) {
        finalizar(false);
      }
      setTimeout(() => finalizar(true), 8000);
    }, 60);
  }

  async _exportarPdfMobile() {
    if (window.showProcess)
      {window.showProcess('Preparando PDF...', 'Gerando arquivo para download.');}
    const btns = document.querySelectorAll('.btn-export');
    btns.forEach((b) => {
      b.disabled = true;
      b.classList.add('btn-export--loading');
    });
    const reabilitar = () => {
      btns.forEach((b) => {
        b.disabled = false;
        b.classList.remove('btn-export--loading');
      });
    };

    try {
      // jsPDF + autotable carregam sob demanda (evita peso no boot).
      if (!(window.jspdf && window.jspdf.jsPDF)) {
        await loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js');
      }
      const jsPDFCtor = window.jspdf && window.jspdf.jsPDF;
      if (!jsPDFCtor) throw new Error('jspdf-load');
      if (typeof jsPDFCtor.API.autoTable !== 'function') {
        await loadScript(
          'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js'
        );
      }

      const isSaidas = this.tipo === 'saidas';
      const titulo = isSaidas ? 'Relatório de Saídas' : 'Relatório de Lançamentos';
      const agora = new Date().toLocaleString('pt-BR');
      const dataIso = new Date().toISOString().slice(0, 10);

      let head, body;
      if (isSaidas) {
        head = [['Data', 'Hora', 'Categoria', 'Fornecedor', 'Pagamento', 'Valor', 'Obs.']];
        body = this.filteredData.map((item) => [
          item.data ? item.data.split('-').reverse().join('/') : '—',
          item.hora || '—',
          item.categoria || '—',
          item.fornecedor || '—',
          item.formaPagamento || '—',
          `R$ ${item.valor || '0,00'}`,
          item.observacao || '',
        ]);
      } else {
        head = [
          [
            'Data',
            'Hora',
            'Aluno',
            'Curso',
            'Igreja',
            'Pagto',
            'Depositante',
            'Banco Dep.',
            'Banco Rec.',
            'Valor',
          ],
        ];
        body = this.filteredData.map((item) => [
          item.dataDeposito ? item.dataDeposito.split('-').reverse().join('/') : '—',
          item.horaDeposito || '—',
          item.nomeAluno || '—',
          item.curso || '—',
          item.igreja || '—',
          item.formaPagamento || '—',
          item.nomeDepositante || '—',
          item.bancoDepositante || '—',
          item.bancoRecebedor || '—',
          `R$ ${item.valor || '0,00'}`,
        ]);
      }

      const doc = new jsPDFCtor({ orientation: 'landscape', unit: 'pt', format: 'a4' });

      // Cabeçalho
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(11, 31, 92);
      doc.text(`IETEB — ${titulo}`, 40, 36);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(`Gerado em: ${agora}  |  Total: ${this.filteredData.length} registro(s)`, 40, 52);

      // Larguras explícitas por coluna pra evitar que campo longo
      // (ex.: nome de igreja ou aluno) "vaze" pra coluna ao lado em
      // mobile. Em A4 paisagem temos ~795pt úteis (842 − 24 − 24).
      // overflow: 'linebreak' garante quebra de linha ao invés de overflow.
      const columnStyles = isSaidas
        ? {
            0: { cellWidth: 56 }, // Data
            1: { cellWidth: 42 }, // Hora
            2: { cellWidth: 110 }, // Categoria
            3: { cellWidth: 165 }, // Fornecedor
            4: { cellWidth: 78 }, // Pagamento
            5: { cellWidth: 70, halign: 'right' }, // Valor
            6: { cellWidth: 'auto' }, // Obs.
          }
        : {
            0: { cellWidth: 50 }, // Data
            1: { cellWidth: 38 }, // Hora
            2: { cellWidth: 120 }, // Aluno
            3: { cellWidth: 100 }, // Curso
            4: { cellWidth: 130 }, // Igreja
            5: { cellWidth: 56 }, // Pagto
            6: { cellWidth: 100 }, // Depositante
            7: { cellWidth: 70 }, // Banco Dep.
            8: { cellWidth: 70 }, // Banco Rec.
            9: { cellWidth: 60, halign: 'right' }, // Valor
          };

      // Tabela
      doc.autoTable({
        head,
        body,
        startY: 64,
        theme: 'grid',
        styles: {
          fontSize: 7,
          cellPadding: 3,
          overflow: 'linebreak',
          valign: 'middle',
          lineWidth: 0.3,
          lineColor: [220, 220, 220],
        },
        headStyles: {
          fillColor: [11, 31, 92],
          textColor: [212, 175, 55],
          fontSize: 7,
          fontStyle: 'bold',
          halign: 'center',
        },
        bodyStyles: { textColor: [33, 33, 33] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles,
        margin: { top: 64, left: 24, right: 24, bottom: 30 },
        tableWidth: 'auto',
        didDrawPage: (data) => {
          // Rodapé
          const page = doc.internal.getCurrentPageInfo().pageNumber;
          const total = doc.internal.getNumberOfPages();
          doc.setFontSize(7);
          doc.setTextColor(150);
          doc.text(
            `IETEB — Centro Educacional Teológico  ·  Página ${page} de ${total}`,
            data.settings.margin.left,
            doc.internal.pageSize.getHeight() - 14
          );
        },
      });

      const fileName = `IETEB_${isSaidas ? 'Saidas' : 'Lancamentos'}_${dataIso}.pdf`;
      doc.save(fileName);

      if (window.showProcessSuccess) {
        window.showProcessSuccess('PDF pronto', 'O download foi iniciado.');
      }
    } catch (err) {
      if (window.closeProcess) window.closeProcess();
      this.modal.showToast('Não foi possível gerar o PDF. Verifique sua conexão.', 'error');
    } finally {
      reabilitar();
    }
  }

  // ── Exportação Excel ──────────────────────────────────────────────────────────
  async exportarExcel() {
    if (!this.filteredData.length) {
      this.modal.showToast('Nenhum registro para exportar.', 'error');
      return;
    }

    const btns = document.querySelectorAll('.btn-export');
    btns.forEach((b) => {
      b.disabled = true;
      b.classList.add('btn-export--loading');
    });
    const reabilitar = () => {
      btns.forEach((b) => {
        b.disabled = false;
        b.classList.remove('btn-export--loading');
      });
    };

    try {
      if (window.showProcess)
        {window.showProcess('Preparando Excel...', 'Carregando biblioteca e gerando arquivo.');}
      if (typeof XLSX === 'undefined') {
        await loadScript('https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js');
      }

      const isSaidas = this.tipo === 'saidas';
      const agora = new Date().toISOString().slice(0, 10);
      let headers, rows, sheetName, fileName, colWidths;

      // Converte "1.234,56" (BR) → 1234.56 (Number). Mantém 0 se vazio.
      // Valor como Number permite Excel/Sheets reconhecer e somar/formatar
      // como moeda. Se ficar como string "R$ 1.234,56", o Sheets mobile
      // pode renderizar fora da coluna ou cortar.
      const toNumber = (brl) => {
        if (!brl) return 0;
        const n = parseFloat(String(brl).replace(/\./g, '').replace(',', '.'));
        return Number.isFinite(n) ? n : 0;
      };

      if (isSaidas) {
        headers = [
          'Data',
          'Hora',
          'Categoria',
          'Fornecedor',
          'Forma de Pagamento',
          'Valor (R$)',
          'Observação',
        ];
        rows = this.filteredData.map((item) => [
          item.data ? item.data.split('-').reverse().join('/') : '',
          item.hora || '',
          item.categoria || '',
          item.fornecedor || '',
          item.formaPagamento || '',
          toNumber(item.valor),
          item.observacao || '',
        ]);
        sheetName = 'Saídas';
        fileName = `IETEB_Saidas_${agora}.xlsx`;
        // Larguras generosas: previne corte/overflow em Sheets mobile.
        colWidths = [12, 8, 22, 32, 18, 14, 40];
      } else {
        headers = [
          'Data',
          'Hora',
          'Nome do Aluno',
          'Curso',
          'Igreja',
          'Forma de Pagamento',
          'Depositante',
          'Banco Depositante',
          'Banco Recebedor',
          'Valor (R$)',
          'Observação',
        ];
        rows = this.filteredData.map((item) => [
          item.dataDeposito ? item.dataDeposito.split('-').reverse().join('/') : '',
          item.horaDeposito || '',
          item.nomeAluno || '',
          item.curso || '',
          item.igreja || '',
          item.formaPagamento || '',
          item.nomeDepositante || '',
          item.bancoDepositante || '',
          item.bancoRecebedor || '',
          toNumber(item.valor),
          item.observacao || '',
        ]);
        sheetName = 'Lançamentos';
        fileName = `IETEB_Lancamentos_${agora}.xlsx`;
        colWidths = [12, 8, 28, 26, 36, 18, 24, 22, 22, 14, 32];
      }

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      ws['!cols'] = colWidths.map((w) => ({ wch: w }));
      // Formata coluna Valor como moeda BRL (índice varia por tipo)
      const valorColIdx = isSaidas ? 5 : 9;
      const totalRows = rows.length;
      for (let r = 1; r <= totalRows; r++) {
        const cellRef = XLSX.utils.encode_cell({ c: valorColIdx, r });
        if (ws[cellRef]) {
          ws[cellRef].t = 'n';
          ws[cellRef].z = 'R$ #,##0.00';
        }
      }
      XLSX.writeFile(wb, fileName);
      if (window.showProcessSuccess) {
        window.showProcessSuccess('Excel exportado!', 'O download foi iniciado.');
      }
    } catch (err) {
      if (window.closeProcess) window.closeProcess();
      this.modal.showToast('Não foi possível exportar. Verifique sua conexão.', 'error');
    } finally {
      reabilitar();
    }
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
    const colName = this.tipo === 'saidas' ? 'Saidas' : 'Entradas';
    const storageKey = this.tipo === 'saidas' ? 'ieteb_saidas' : 'ieteb_lancamentos';
    const todos = JSON.parse(localStorage.getItem(storageKey) || '[]');
    const novos = todos.filter((l) => l.id !== this.deleteTarget);
    localStorage.setItem(storageKey, JSON.stringify(novos));
    this.firebase.delete(colName, this.deleteTarget);
    this.deleteTarget = null;
    this.modal.close('deleteModal');
    this.carregar();
    this.modal.showToast('Registro excluído.', 'success');
  }

  closeDeleteModal() {
    this.modal.close('deleteModal');
    this.deleteTarget = null;
  }

  // ── Edição ────────────────────────────────────────────────────────────────────
  // Abre o modal de edição apropriado (entrada ou saída) pré-preenchido com
  // os dados do registro selecionado. Salvar persiste em localStorage +
  // firebase via `save` (faz upsert pelo id existente, preserva o registro).
  pedirEdicao(idx) {
    const item = this.filteredData[idx];
    if (!item) return;
    this.editTarget = item.id;
    if (this.tipo === 'saidas') {
      this._preencherModalEdicaoSaida(item);
      this.modal.open('editSaidaModal');
    } else {
      this._preencherModalEdicaoEntrada(item);
      this.modal.open('editEntradaModal');
    }
  }

  _preencherModalEdicaoEntrada(item) {
    const _set = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = v == null ? '' : v;
    };
    _set('editEntId', item.id);
    _set('editEntData', item.dataDeposito || '');
    _set('editEntHora', item.horaDeposito || '');
    _set('editEntAluno', item.nomeAluno || '');
    _set('editEntCurso', item.curso || '');
    _set('editEntForma', item.formaPagamento || 'Pix');
    _set('editEntIgreja', item.igreja || '');
    _set('editEntParcela', item.parcela || '');
    _set('editEntValor', item.valor || '');
    _set('editEntDepositante', item.nomeDepositante || '');
    _set('editEntRecebedor', item.nomeRecebedor || '');
    _set('editEntBancoDep', item.bancoDepositante || '');
    _set('editEntBancoRec', item.bancoRecebedor || '');
    _set('editEntObs', item.observacao || '');
  }

  _preencherModalEdicaoSaida(item) {
    const _set = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = v == null ? '' : v;
    };
    _set('editSaiId', item.id);
    _set('editSaiData', item.data || '');
    _set('editSaiHora', item.hora || '');
    _set('editSaiCategoria', item.categoria || '');
    _set('editSaiForma', item.formaPagamento || 'Pix');
    _set('editSaiFornecedor', item.fornecedor || '');
    _set('editSaiValor', item.valor || '');
    _set('editSaiObs', item.observacao || '');
  }

  salvarEdicaoEntrada() {
    const id = Number(document.getElementById('editEntId').value);
    if (!id) return;
    const _get = (k) => (document.getElementById(k) || {}).value || '';
    const _trim = (v) => String(v || '').trim();

    const todos = JSON.parse(localStorage.getItem('ieteb_lancamentos') || '[]');
    const idx = todos.findIndex((l) => l.id === id);
    if (idx < 0) {
      this.modal.showToast('Registro não encontrado.', 'error');
      return;
    }
    const atualizado = {
      ...todos[idx],
      dataDeposito: _get('editEntData') || todos[idx].dataDeposito,
      horaDeposito: _get('editEntHora'),
      nomeAluno: _trim(_get('editEntAluno')),
      curso: _get('editEntCurso'),
      formaPagamento: _get('editEntForma'),
      igreja: _trim(_get('editEntIgreja')),
      parcela: _trim(_get('editEntParcela')),
      valor: _trim(_get('editEntValor')),
      nomeDepositante: _trim(_get('editEntDepositante')),
      nomeRecebedor: _trim(_get('editEntRecebedor')),
      bancoDepositante: _trim(_get('editEntBancoDep')),
      bancoRecebedor: _trim(_get('editEntBancoRec')),
      observacao: _trim(_get('editEntObs')),
      atualizadoEm: new Date().toISOString(),
    };
    todos[idx] = atualizado;
    localStorage.setItem('ieteb_lancamentos', JSON.stringify(todos));
    this.firebase.save('Entradas', atualizado);
    this.modal.close('editEntradaModal');
    this.editTarget = null;
    this.carregar();
    this.modal.showToast('Lançamento atualizado.', 'success');
    try {
      document.dispatchEvent(new CustomEvent('ietebDataChanged'));
    } catch (_) {}
  }

  salvarEdicaoSaida() {
    const id = Number(document.getElementById('editSaiId').value);
    if (!id) return;
    const _get = (k) => (document.getElementById(k) || {}).value || '';
    const _trim = (v) => String(v || '').trim();

    const todos = JSON.parse(localStorage.getItem('ieteb_saidas') || '[]');
    const idx = todos.findIndex((l) => l.id === id);
    if (idx < 0) {
      this.modal.showToast('Registro não encontrado.', 'error');
      return;
    }
    const atualizado = {
      ...todos[idx],
      data: _get('editSaiData') || todos[idx].data,
      hora: _get('editSaiHora'),
      categoria: _trim(_get('editSaiCategoria')),
      formaPagamento: _get('editSaiForma'),
      fornecedor: _trim(_get('editSaiFornecedor')),
      valor: _trim(_get('editSaiValor')),
      observacao: _trim(_get('editSaiObs')),
      atualizadoEm: new Date().toISOString(),
    };
    todos[idx] = atualizado;
    localStorage.setItem('ieteb_saidas', JSON.stringify(todos));
    this.firebase.save('Saidas', atualizado);
    this.modal.close('editSaidaModal');
    this.editTarget = null;
    this.carregar();
    this.modal.showToast('Lançamento atualizado.', 'success');
    try {
      document.dispatchEvent(new CustomEvent('ietebDataChanged'));
    } catch (_) {}
  }

  closeEditEntradaModal() {
    this.modal.close('editEntradaModal');
    this.editTarget = null;
  }

  closeEditSaidaModal() {
    this.modal.close('editSaidaModal');
    this.editTarget = null;
  }

  // ── Comprovante ───────────────────────────────────────────────────────────────
  verComprovante(idx) {
    const item = this.filteredData[idx];
    const src = item && (item.comprovante || item.comprovanteUrl);
    if (!src) return;

    const imgEl = document.getElementById('imgModalImg');
    const pdfEl = document.getElementById('imgModalPdf');
    const emptyEl = document.getElementById('imgModalEmpty');
    const zoomCtrls = document.getElementById('imgModalZoomCtrls');

    imgEl.style.display = 'none';
    pdfEl.style.display = 'none';
    emptyEl.style.display = 'none';

    const isPdf = src.startsWith('data:application/pdf') || item.comprovanteType === 'pdf';
    const isImg =
      src.startsWith('data:image') || item.comprovanteType === 'image' || src.startsWith('http');

    // Zoom controls só aparecem para imagem (PDF já tem zoom nativo do iframe)
    if (zoomCtrls) zoomCtrls.style.display = isImg ? '' : 'none';

    if (isPdf) {
      pdfEl.src = src;
      pdfEl.style.display = 'block';
    } else if (isImg) {
      imgEl.src = src;
      imgEl.style.display = 'block';
      this.zoomImg(0); // reset zoom ao abrir
    } else {
      emptyEl.style.display = 'flex';
    }

    this.modal.open('imgModal');
  }

  // Zoom da imagem do comprovante. delta: +1 amplia, -1 reduz, 0 reseta.
  // Sem zoom nativo do browser (viewport bloqueia), implementamos via
  // CSS transform: scale. Pan vem via overflow: auto no body do modal.
  zoomImg(delta) {
    const STEPS = [0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4];
    if (this._imgZoomIdx == null) this._imgZoomIdx = 2; // 100%

    if (delta === 0) {
      this._imgZoomIdx = 2;
    } else {
      this._imgZoomIdx = Math.max(0, Math.min(STEPS.length - 1, this._imgZoomIdx + delta));
    }

    const scale = STEPS[this._imgZoomIdx];
    const img = document.getElementById('imgModalImg');
    const lvl = document.getElementById('imgModalZoomLevel');
    if (img) {
      img.style.transform = `scale(${scale})`;
      img.style.transformOrigin = 'center center';
      img.style.cursor = scale > 1 ? 'grab' : 'zoom-in';
    }
    if (lvl) lvl.textContent = `${Math.round(scale * 100)}%`;
  }

  closeImgModal() {
    this.modal.close('imgModal');
    document.getElementById('imgModalImg').src = '';
    document.getElementById('imgModalPdf').src = '';
    this._imgZoomIdx = null;
  }
}
