class SaidaPage {
  constructor(modal, firebase, ocr) {
    this.modal = modal;
    this.firebase = firebase;
    this.ocr = ocr;

    this.currentFile = null;
    this.currentFileDataUrl = null;
  }

  // Acesso ao último OCR (compat para confirmarOcr / _abrirModalDados)
  get ocrExtracted() {
    return this.ocr ? this.ocr.ocrExtracted : {};
  }

  // ── Abas ─────────────────────────────────────────────────────────────────────
  switchTab(tab) {
    const isManual = tab === 'manual';
    document.getElementById('panelSaidaManual').classList.toggle('tab-panel--hidden', !isManual);
    document.getElementById('panelSaidaUpload').classList.toggle('tab-panel--hidden', isManual);
    document.getElementById('tabSaidaManual').classList.toggle('tab-btn--active', isManual);
    document.getElementById('tabSaidaUpload').classList.toggle('tab-btn--active', !isManual);
    document.getElementById('tabSaidaManual').setAttribute('aria-selected', isManual);
    document.getElementById('tabSaidaUpload').setAttribute('aria-selected', !isManual);
    document.getElementById('btnLimparSaida').style.display = isManual ? '' : 'none';
  }

  resetPage() {
    this.switchTab('manual');
    this.limparSaida();
  }

  initValidationListeners() {
    [
      ['saidaCategoria', 'change', 'saidaCategoriaError'],
      ['saidaFornecedor', 'input', 'saidaFornecedorError'],
      ['saidaValor', 'input', 'saidaValorError'],
      ['saidaData', 'input', 'saidaDataError'],
    ].forEach(([inputId, evt, errId]) => {
      const el = document.getElementById(inputId);
      if (el) el.addEventListener(evt, () => clearFieldError(errId));
    });
  }

  // ── Pagamento ─────────────────────────────────────────────────────────────────
  lockPayment() {
    document.getElementById('paymentTypesSaida').classList.add('payment-types--locked');
  }

  unlockPayment() {
    document.getElementById('paymentTypesSaida').classList.remove('payment-types--locked');
  }

  selectPayment(btn) {
    document
      .querySelectorAll('#paymentTypesSaida .payment-btn')
      .forEach((b) => b.classList.remove('payment-btn--active'));
    btn.classList.add('payment-btn--active');
    document.getElementById('saidaFormaPagamento').value = btn.dataset.value;
    document.getElementById('saidaPagamentoError').textContent = '';
  }

  // ── Upload ────────────────────────────────────────────────────────────────────
  onDragOver(e) {
    e.preventDefault();
    document.getElementById('dropZoneSaida').classList.add('upload-area--dragover');
  }

  onDragLeave() {
    document.getElementById('dropZoneSaida').classList.remove('upload-area--dragover');
  }

  onDrop(e) {
    e.preventDefault();
    document.getElementById('dropZoneSaida').classList.remove('upload-area--dragover');
    const file = e.dataTransfer.files[0];
    if (file) this.handleFile(file);
  }

  onFileSelected(input) {
    const file = input.files[0];
    if (file) this.handleFile(file);
  }

  handleFile(file) {
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    if (!isImage && !isPdf) {
      this.modal.showToast('Envie o PDF ou uma imagem (JPG, PNG) da Nota Fiscal.', 'error');
      return;
    }
    this.currentFile = file;
    document.getElementById('previewFileNameSaida').textContent = file.name;
    document.getElementById('uploadPreviewSaida').style.display = 'block';

    const img = document.getElementById('previewImgSaida');
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
      const reader = new FileReader();
      reader.onload = (e) => {
        this.currentFileDataUrl = e.target.result;
      };
      reader.readAsDataURL(file);
    }

    document.getElementById('btnLerNF').style.display = 'flex';
  }

  removeFile() {
    this.currentFile = null;
    this.currentFileDataUrl = null;
    document.getElementById('uploadPreviewSaida').style.display = 'none';
    document.getElementById('previewImgSaida').style.display = 'none';
    document.getElementById('previewImgSaida').src = '';
    document.getElementById('previewFileNameSaida').textContent = '';
    document.getElementById('btnLerNF').style.display = 'none';
    document.getElementById('ocrStatusSaida').style.display = 'none';
    document.getElementById('fileInputSaida').value = '';
    this.unlockPayment();
  }

  async lerNF() {
    if (this.ocr) await this.ocr.lerNF(this.currentFile);
  }

  confirmarOcr() {
    this.modal.close('ocrModalSaida');
    const e = this.ocrExtracted;
    const clearErr = (id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = '';
    };
    if (e.fornecedor) {
      setInput('saidaFornecedor', e.fornecedor);
      clearErr('saidaFornecedorError');
    }
    if (e.valor) {
      document.getElementById('saidaValor').value = e.valor.replace('R$ ', '');
      clearErr('saidaValorError');
    }
    if (e.data) {
      setInput('saidaData', isoToDateInput(e.data));
      clearErr('saidaDataError');
    }
    if (e.hora) setInput('saidaHora', e.hora);
    if (e.formaPagamento) {
      document.getElementById('saidaFormaPagamento').value = e.formaPagamento;
      document.querySelectorAll('#paymentTypesSaida .payment-btn').forEach((btn) => {
        btn.classList.toggle('payment-btn--active', btn.dataset.value === e.formaPagamento);
      });
      this.lockPayment();
    }
    this.switchTab('manual');
    this._abrirModalDados();
  }

  _abrirModalDados() {
    const e = this.ocrExtracted;
    const labels = {
      fornecedor: 'Fornecedor',
      valor: 'Valor',
      data: 'Data',
      hora: 'Hora',
      formaPagamento: 'Pagamento',
    };
    document.getElementById('ocrDadosSummary').innerHTML =
      Object.keys(labels)
        .filter((k) => e[k])
        .map(
          (k) => `<div class="ocr-row">
        <span class="ocr-row-label">${escHtml(labels[k])}</span>
        <span class="ocr-row-value">${escHtml(e[k])}</span>
      </div>`
        )
        .join('') ||
      '<p style="padding:16px;color:#aaa;text-align:center">Nenhum dado extraído.</p>';
    this.modal.open('ocrDadosModal');
  }

  closeOcrDadosModal() {
    this.modal.close('ocrDadosModal');
  }

  closeOcrModal() {
    this.modal.close('ocrModalSaida');
  }

  // ── Validação ─────────────────────────────────────────────────────────────────
  validate() {
    let ok = true;
    const checks = [
      {
        errId: 'saidaCategoriaError',
        msg: 'Selecione a categoria.',
        val: () => {
          const el = document.getElementById('saidaCategoria');
          return el ? el.value : '';
        },
      },
      {
        errId: 'saidaFornecedorError',
        msg: 'Informe o fornecedor ou beneficiário.',
        val: () => {
          const el = document.getElementById('saidaFornecedor');
          return el ? el.value.trim() : '';
        },
      },
      {
        errId: 'saidaPagamentoError',
        msg: 'Selecione a forma de pagamento.',
        val: () => {
          const el = document.getElementById('saidaFormaPagamento');
          return el ? el.value : '';
        },
      },
      {
        errId: 'saidaValorError',
        msg: 'Informe o valor.',
        val: () => {
          const el = document.getElementById('saidaValor');
          return el ? el.value.trim() : '';
        },
      },
      {
        errId: 'saidaDataError',
        msg: 'Informe a data.',
        val: () => {
          const el = document.getElementById('saidaData');
          return el ? el.value : '';
        },
      },
    ];
    checks.forEach((c) => {
      try {
        const el = document.getElementById(c.errId);
        const v = c.val();
        if (!v) {
          if (el) el.textContent = c.msg;
          ok = false;
        } else {
          if (el) el.textContent = '';
        }
      } catch (_) {
        ok = false;
      }
    });
    return ok;
  }

  salvarSaida() {
    try {
      if (!this.validate()) {
        window._reviewTarget = 'saidas';
        this.modal.open('reviewFormModal');
        return;
      }

      const _cu = getCurrentUser();
      const registro = {
        id: Date.now(),
        categoria: document.getElementById('saidaCategoria').value,
        fornecedor: document.getElementById('saidaFornecedor').value.trim(),
        formaPagamento: document.getElementById('saidaFormaPagamento').value,
        valor: document.getElementById('saidaValor').value.trim(),
        data: dateInputToISO(document.getElementById('saidaData').value),
        hora: document.getElementById('saidaHora').value,
        observacao: document.getElementById('saidaObservacao').value.trim(),
        criadoEm: new Date().toISOString(),
        userId: _cu.id,
        userName: _cu.name,
      };

      const existing = JSON.parse(localStorage.getItem('ieteb_saidas') || '[]');
      existing.unshift(registro);
      try {
        localStorage.setItem('ieteb_saidas', JSON.stringify(existing));
      } catch (_) {
        try {
          localStorage.setItem('ieteb_saidas', JSON.stringify(existing.slice(0, 100)));
        } catch (__) {}
      }
      this.firebase.save('Saídas', registro);

      this._showSnackbar();
      this.limparSaida();
      try {
        document.dispatchEvent(new CustomEvent('ietebDataChanged'));
      } catch (_) {}
    } catch (err) {
      console.error('salvarSaida erro:', err);
      this.modal.showToast('Erro ao salvar: ' + (err.message || err), 'error');
    }
  }

  _showSnackbar() {
    const el = document.getElementById('saidaSavedSnackbar');
    const overlay = document.getElementById('saidaSnackbarOverlay');
    const msg = document.getElementById('savedSnackbarMsg');
    if (msg) msg.textContent = 'Saída salva com sucesso!';
    if (!el) return;
    el.classList.add('snackbar--visible');
    if (overlay) overlay.classList.add('snackbar--visible');
    clearTimeout(this._snackTimer);
    this._snackTimer = setTimeout(() => {
      el.classList.remove('snackbar--visible');
      if (overlay) overlay.classList.remove('snackbar--visible');
    }, 3000);
  }

  limparSaida() {
    [
      'saidaCategoria',
      'saidaFornecedor',
      'saidaFormaPagamento',
      'saidaValor',
      'saidaData',
      'saidaHora',
      'saidaObservacao',
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document
      .querySelectorAll('#paymentTypesSaida .payment-btn')
      .forEach((b) => b.classList.remove('payment-btn--active'));
    this.unlockPayment();
    [
      'saidaCategoriaError',
      'saidaFornecedorError',
      'saidaPagamentoError',
      'saidaValorError',
      'saidaDataError',
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = '';
    });
    this.removeFile();
  }
}
