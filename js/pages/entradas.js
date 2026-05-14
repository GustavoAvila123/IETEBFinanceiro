class EntradaPage {
  constructor(modal, firebase, ocr, igrejaDropdown, alunosManager) {
    this.modal = modal;
    this.firebase = firebase;
    this.ocr = ocr;
    this.igreja = igrejaDropdown;
    this.alunos = alunosManager;

    this.currentFile = null;
    this.currentFileDataUrl = null;
  }

  // Lista de IDs cobertos pelo autosave de rascunho — só campos
  // de texto/select/data. Alunos (multi-row) não entram aqui pra
  // não complicar; se o user perdeu, perdeu (rara perda).
  static get DRAFT_FIELDS() {
    return [
      'nomeDepositante',
      'nomeRecebedor',
      'bancoDepositante',
      'bancoRecebedor',
      'valorEntrada',
      'dataDeposito',
      'horaDeposito',
      'observacao',
      'parcela',
    ];
  }

  resetPage() {
    this.switchTab('manual');
    this.limparFormulario();
    // Conecta autosave + restaura rascunho da sessão (se houver)
    if (window.formPersist) {
      window.formPersist.attach('entrada', EntradaPage.DRAFT_FIELDS);
    }
  }

  // ── Abas ─────────────────────────────────────────────────────────────────────
  switchTab(tab) {
    const isManual = tab === 'manual';
    document.getElementById('panelManual').classList.toggle('tab-panel--hidden', !isManual);
    document.getElementById('panelUpload').classList.toggle('tab-panel--hidden', isManual);
    document.getElementById('tabManual').classList.toggle('tab-btn--active', isManual);
    document.getElementById('tabUpload').classList.toggle('tab-btn--active', !isManual);
    document.getElementById('tabManual').setAttribute('aria-selected', isManual);
    document.getElementById('tabUpload').setAttribute('aria-selected', !isManual);
    document.getElementById('btnLimpar').style.display = isManual ? '' : 'none';
  }

  // ── Igreja dropdown (delegado para IgrejaDropdown component) ─────────────────
  openChurchDropdown() {
    this.igreja.open();
  }
  filterChurches(val) {
    this.igreja.filter(val);
  }
  selectChurch(value) {
    this.igreja.select(value);
    this._updateSubmitState();
  }

  // ── Pagamento ─────────────────────────────────────────────────────────────────
  lockPayment() {
    document.getElementById('paymentTypes').classList.add('payment-types--locked');
  }

  unlockPayment() {
    document.getElementById('paymentTypes').classList.remove('payment-types--locked');
  }

  selectPayment(btn) {
    document
      .querySelectorAll('#paymentTypes .payment-btn')
      .forEach((b) => b.classList.remove('payment-btn--active'));
    btn.classList.add('payment-btn--active');
    document.getElementById('formaPagamento').value = btn.dataset.value;
    document.getElementById('pagamentoError').textContent = '';
    this.ajustarFormPorPagamento(btn.dataset.value);
    this._updateSubmitState();
  }

  _setLabelText(id, texto) {
    const el = document.getElementById(id);
    if (!el) return;
    const tn = Array.from(el.childNodes).find((n) => n.nodeType === 3);
    if (tn) tn.nodeValue = texto;
    else el.insertBefore(document.createTextNode(texto), el.firstChild);
  }

  ajustarFormPorPagamento(tipo) {
    const isDinheiro = tipo === 'Dinheiro';
    const isCredito = tipo === 'Crédito';
    const isDebito = tipo === 'Débito';
    const bancoRecEl = document.getElementById('bancoRecebedor');
    const grupoBancoRec = document.getElementById('grupoBancoRecebedor');
    const rowDeposRec = document.getElementById('rowDepositanteRecebedor');
    const rowBancos = document.getElementById('rowBancos');

    document.getElementById('grupoNomeDepositante').style.display = isDinheiro ? 'none' : '';
    document.getElementById('grupoBancoDepositante').style.display = isDinheiro ? 'none' : '';

    if (isDinheiro) {
      rowDeposRec.appendChild(grupoBancoRec);
      rowBancos.style.display = 'none';
    } else if (isCredito || isDebito) {
      rowBancos.appendChild(grupoBancoRec);
      rowBancos.style.display = 'none';
    } else {
      rowBancos.appendChild(grupoBancoRec);
      rowBancos.style.display = '';
    }

    const inputNomeDepo = document.getElementById('nomeDepositante');
    const inputNomeRec = document.getElementById('nomeRecebedor');
    const labelHora = document.getElementById('labelHoraDeposito');

    if (isCredito || isDebito) {
      this._setLabelText('labelNomeDepositante', 'Nome da Loja ');
      this._setLabelText('labelNomeRecebedor', 'Bandeira ');
      this._setLabelText('labelDataDeposito', 'Data da Transação ');
      if (labelHora) labelHora.textContent = 'Horário do Recebimento';
      if (inputNomeDepo) inputNomeDepo.placeholder = 'Nome do estabelecimento';
      if (inputNomeRec) inputNomeRec.placeholder = 'Ex: Mastercard, Visa, Elo...';
    } else {
      this._setLabelText('labelNomeDepositante', 'Nome do Depositante ');
      this._setLabelText('labelNomeRecebedor', 'Nome de Quem Recebeu ');
      this._setLabelText(
        'labelDataDeposito',
        isDinheiro ? 'Data do Pagamento ' : 'Data do Depósito '
      );
      if (labelHora) labelHora.textContent = 'Horário do Recebimento';
      if (inputNomeDepo) inputNomeDepo.placeholder = 'Quem realizou o pagamento';
      if (inputNomeRec) inputNomeRec.placeholder = 'Quem recebeu o valor';
    }

    if (isDinheiro) {
      bancoRecEl.value = 'Caixa';
      bancoRecEl.readOnly = true;
      bancoRecEl.classList.add('form-input--readonly');
    } else {
      if (bancoRecEl.readOnly) bancoRecEl.value = '';
      bancoRecEl.readOnly = false;
      bancoRecEl.classList.remove('form-input--readonly');
    }
  }

  // ── Upload / Drag & Drop ──────────────────────────────────────────────────────
  onDragOver(e) {
    e.preventDefault();
    document.getElementById('dropZone').classList.add('upload-area--dragover');
  }

  onDragLeave() {
    document.getElementById('dropZone').classList.remove('upload-area--dragover');
  }

  onDrop(e) {
    e.preventDefault();
    document.getElementById('dropZone').classList.remove('upload-area--dragover');
    const file = e.dataTransfer.files[0];
    if (file) this.handleFile(file);
  }

  onFileSelected(input) {
    const file = input.files[0];
    if (file) this.handleFile(file);
  }

  handleFile(file) {
    const allowed = [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/gif',
      'image/webp',
      'application/pdf',
    ];
    if (!allowed.includes(file.type)) {
      this.modal.showToast('Formato não suportado. Use imagem ou PDF.', 'error');
      return;
    }
    this.currentFile = file;
    document.getElementById('previewFileName').textContent = file.name;
    document.getElementById('uploadPreview').style.display = 'block';

    const img = document.getElementById('previewImg');
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        this.currentFileDataUrl = e.target.result;
        img.src = e.target.result;
        img.style.display = 'block';
      };
      reader.readAsDataURL(file);
    } else {
      img.style.display = 'none';
      this.currentFileDataUrl = null;
    }

    document.getElementById('btnLerComprovante').style.display = 'flex';
  }

  removeFile() {
    this.currentFile = null;
    this.currentFileDataUrl = null;
    document.getElementById('uploadPreview').style.display = 'none';
    document.getElementById('previewImg').style.display = 'none';
    document.getElementById('previewImg').src = '';
    document.getElementById('previewFileName').textContent = '';
    document.getElementById('btnLerComprovante').style.display = 'none';
    document.getElementById('ocrStatus').style.display = 'none';
    document.getElementById('fileInput').value = '';
    this.unlockPayment();
  }

  lerComprovante() {
    this.ocr.lerComprovante(this.currentFile);
  }

  // ── Alunos (delegado para AlunosManager component) ─────────────────────
  initAlunosContainer() {
    this.alunos.init();
  }
  addAlunoRow() {
    this.alunos.addRow();
  }
  removeAlunoRow(id) {
    this.alunos.removeRow(id);
  }
  getAlunosData() {
    return this.alunos.getData();
  }
  validateAlunos() {
    return this.alunos.validate();
  }

  initValidationListeners() {
    [
      ['curso', 'change', 'cursoError'],
      ['nomeDepositante', 'input', 'nomeDepositanteError'],
      ['nomeRecebedor', 'input', 'nomeRecebedorError'],
      ['bancoDepositante', 'input', 'bancoDepositanteError'],
      ['bancoRecebedor', 'input', 'bancoRecebedorError'],
      ['valorEntrada', 'input', 'valorError'],
      ['dataDeposito', 'input', 'dataError'],
    ].forEach(([inputId, evt, errId]) => {
      const el = document.getElementById(inputId);
      if (el) {
        el.addEventListener(evt, () => {
          clearFieldError(errId);
          this._updateSubmitState();
        });
      }
    });
    // Estado inicial do botão Salvar
    this._updateSubmitState();
  }

  /**
   * Versão silenciosa do validate() — retorna true se TODOS os campos
   * obrigatórios estão preenchidos. Não mexe em mensagens de erro.
   * Usado pra atualizar visualmente o botão Salvar (pulsa quando pronto).
   */
  _isFormReady() {
    const fp = document.getElementById('formaPagamento').value;
    if (!fp) return false;
    const isDinheiro = fp === 'Dinheiro';
    const isCredito = fp === 'Crédito';
    const isDebito = fp === 'Débito';
    const v = (id) => (document.getElementById(id) || {}).value || '';
    if (!v('curso')) return false;
    if (!v('igreja')) return false;
    if (!isDinheiro && !v('nomeDepositante').trim()) return false;
    if (!v('nomeRecebedor').trim()) return false;
    if (!isDinheiro && !isCredito && !isDebito && !v('bancoDepositante').trim()) return false;
    if (!isDinheiro && !isCredito && !isDebito && !v('bancoRecebedor').trim()) return false;
    if (!v('valorEntrada').trim()) return false;
    if (!v('dataDeposito')) return false;
    return true;
  }

  _updateSubmitState() {
    const btn = document.getElementById('btnSalvar');
    if (!btn) return;
    btn.classList.toggle('btn-primary--ready', this._isFormReady());
  }

  // ── Validação ─────────────────────────────────────────────────────────────────
  validate() {
    let ok = true;
    const fp = document.getElementById('formaPagamento').value;
    const isDinheiro = fp === 'Dinheiro';
    const isCredito = fp === 'Crédito';
    const isDebito = fp === 'Débito';

    const checks = [
      {
        errId: 'cursoError',
        msg: 'Selecione o curso.',
        val: () => document.getElementById('curso').value,
      },
      {
        errId: 'igrejaError',
        msg: 'Selecione a igreja.',
        val: () => document.getElementById('igreja').value,
      },
      {
        errId: 'pagamentoError',
        msg: 'Selecione a forma de pagamento.',
        val: () => document.getElementById('formaPagamento').value,
      },
      {
        errId: 'nomeDepositanteError',
        msg: 'Informe o nome do depositante.',
        val: () => (isDinheiro ? 'ok' : document.getElementById('nomeDepositante').value.trim()),
      },
      {
        errId: 'nomeRecebedorError',
        msg: 'Informe o nome de quem recebeu.',
        val: () => document.getElementById('nomeRecebedor').value.trim(),
      },
      {
        errId: 'bancoDepositanteError',
        msg: 'Informe o banco depositante.',
        val: () =>
          isDinheiro || isCredito || isDebito
            ? 'ok'
            : document.getElementById('bancoDepositante').value.trim(),
      },
      {
        errId: 'bancoRecebedorError',
        msg: 'Informe o banco recebedor.',
        val: () =>
          isDinheiro || isCredito || isDebito
            ? 'ok'
            : document.getElementById('bancoRecebedor').value.trim(),
      },
      {
        errId: 'valorError',
        msg: 'Informe o valor.',
        val: () => document.getElementById('valorEntrada').value.trim(),
      },
      {
        errId: 'dataError',
        msg: 'Informe a data.',
        val: () => document.getElementById('dataDeposito').value,
      },
    ];

    checks.forEach((c) => {
      const el = document.getElementById(c.errId);
      if (!c.val()) {
        el.textContent = c.msg;
        ok = false;
      } else el.textContent = '';
    });

    if (!this.validateAlunos()) ok = false;
    return ok;
  }

  // ── Salvar ────────────────────────────────────────────────────────────────────
  salvarLancamento() {
    if (!this.validate()) {
      window._reviewTarget = 'entradas';
      this.modal.open('reviewFormModal');
      return;
    }

    const alunos = this.getAlunosData();
    const _cu = getCurrentUser();
    const baseData = {
      curso: document.getElementById('curso').value,
      igreja: document.getElementById('igreja').value,
      formaPagamento: document.getElementById('formaPagamento').value,
      nomeDepositante: document.getElementById('nomeDepositante').value.trim(),
      nomeRecebedor: document.getElementById('nomeRecebedor').value.trim(),
      bancoDepositante: document.getElementById('bancoDepositante').value.trim(),
      bancoRecebedor: document.getElementById('bancoRecebedor').value.trim(),
      valor: document.getElementById('valorEntrada').value.trim(),
      dataDeposito: dateInputToISO(document.getElementById('dataDeposito').value),
      horaDeposito: document.getElementById('horaDeposito').value,
      observacao: document.getElementById('observacao').value.trim(),
      comprovante: this.currentFileDataUrl || null,
      criadoEm: new Date().toISOString(),
      userId: _cu.id,
      userName: _cu.name,
    };

    const existing = JSON.parse(localStorage.getItem('ieteb_lancamentos') || '[]');
    const baseTime = Date.now();

    const novosRegistros = alunos
      .slice()
      .reverse()
      .map((aluno, i) => ({
        ...baseData,
        id: baseTime + (alunos.length - 1 - i),
        nomeAluno: aluno.nome,
        parcela: aluno.parcela,
      }));

    novosRegistros.forEach((r) => existing.unshift(r));
    localStorage.setItem('ieteb_lancamentos', JSON.stringify(existing));
    novosRegistros.forEach((r) => this.firebase.save('Entradas', r));

    const msg =
      alunos.length > 1
        ? `${alunos.length} lançamentos salvos com sucesso!`
        : 'Lançamento salvo com sucesso!';
    this._showSnackbar(msg);
    // Salvamento bem-sucedido: limpa o draft pra próximo cadastro começar zerado
    if (window.formPersist) window.formPersist.clear('entrada');
    this.limparFormulario();
    try {
      document.dispatchEvent(new CustomEvent('ietebDataChanged'));
    } catch (_) {}
  }

  _showSnackbar(msg) {
    const el = document.getElementById('saidaSavedSnackbar');
    const overlay = document.getElementById('saidaSnackbarOverlay');
    const msgEl = document.getElementById('savedSnackbarMsg');
    if (!el) return;
    if (msgEl) msgEl.textContent = msg;
    el.classList.add('snackbar--visible');
    if (overlay) overlay.classList.add('snackbar--visible');
    clearTimeout(this._snackTimer);
    this._snackTimer = setTimeout(() => {
      el.classList.remove('snackbar--visible');
      if (overlay) overlay.classList.remove('snackbar--visible');
    }, 3000);
  }

  limparFormulario() {
    // Reseta valores E dispara `change` pra que componentes que escutam
    // (PickList, validation listeners, _updateSubmitState) sincronizem.
    // Sem o dispatch, value programático é silencioso e o trigger do
    // PickList continua mostrando o texto antigo após o save.
    [
      'curso',
      'nomeDepositante',
      'nomeRecebedor',
      'bancoDepositante',
      'bancoRecebedor',
      'valorEntrada',
      'dataDeposito',
      'horaDeposito',
      'observacao',
      'formaPagamento',
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const igrejaEl = document.getElementById('igreja');
    if (igrejaEl) {
      igrejaEl.value = '';
      igrejaEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
    document.getElementById('igrejaSearch').value = '';
    document
      .querySelectorAll('.payment-btn')
      .forEach((b) => b.classList.remove('payment-btn--active'));
    this.unlockPayment();
    this.ajustarFormPorPagamento('');

    [
      'cursoError',
      'igrejaError',
      'pagamentoError',
      'nomeDepositanteError',
      'nomeRecebedorError',
      'bancoDepositanteError',
      'bancoRecebedorError',
      'valorError',
      'dataError',
      'alunosError',
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = '';
    });

    this.initAlunosContainer();
    this.removeFile();
    this._updateSubmitState();
  }
}
