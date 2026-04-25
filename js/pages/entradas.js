
class EntradaPage {
  constructor(modal, firebase, ocr) {
    this.modal    = modal;
    this.firebase = firebase;
    this.ocr      = ocr;

    this.currentFile        = null;
    this.currentFileDataUrl = null;
    this.nextAlunoId        = 0;
  }

  resetPage() {
    this.switchTab('manual');
    this.limparFormulario();
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

  // ── Igreja dropdown ───────────────────────────────────────────────────────────
  buildChurchDropdown(filter) {
    const dd       = document.getElementById('churchDropdown');
    const selected = document.getElementById('igreja').value;
    const term     = (filter || '').toLowerCase().trim();
    const list     = term ? CHURCHES.filter(c => c.toLowerCase().includes(term)) : CHURCHES;

    if (!list.length) {
      dd.innerHTML = '<div class="church-option" style="color:#8090b0;cursor:default">Nenhuma encontrada</div>';
      return;
    }

    dd.innerHTML = list.map(c => {
      const sel  = c === selected;
      const safe = c.replace(/'/g, "\\'");
      return `<div class="church-option${sel ? ' church-option--selected' : ''}"
        tabindex="0"
        onclick="selectChurch('${safe}')"
        onkeydown="if(event.key==='Enter'||event.key===' ')selectChurch('${safe}')">
        ${escHtml(c)}
      </div>`;
    }).join('');
  }

  openChurchDropdown() {
    this.buildChurchDropdown(document.getElementById('igrejaSearch').value);
    document.getElementById('churchDropdown').classList.add('church-dropdown--open');
    document.addEventListener('mousedown', this._closeChurchOutside);
  }

  _closeChurchOutside = (e) => {
    const wrap = document.querySelector('.select-search-wrap');
    if (wrap && !wrap.contains(e.target)) {
      document.getElementById('churchDropdown').classList.remove('church-dropdown--open');
      document.removeEventListener('mousedown', this._closeChurchOutside);
    }
  };

  filterChurches(val) {
    this.buildChurchDropdown(val);
    document.getElementById('churchDropdown').classList.add('church-dropdown--open');
    document.getElementById('igreja').value = '';
  }

  selectChurch(value) {
    document.getElementById('igreja').value       = value;
    document.getElementById('igrejaSearch').value = value;
    document.getElementById('churchDropdown').classList.remove('church-dropdown--open');
    document.getElementById('igrejaError').textContent = '';
    document.removeEventListener('mousedown', this._closeChurchOutside);
  }

  // ── Pagamento ─────────────────────────────────────────────────────────────────
  lockPayment() {
    document.getElementById('paymentTypes').classList.add('payment-types--locked');
  }

  unlockPayment() {
    document.getElementById('paymentTypes').classList.remove('payment-types--locked');
  }

  selectPayment(btn) {
    document.querySelectorAll('#paymentTypes .payment-btn').forEach(b => b.classList.remove('payment-btn--active'));
    btn.classList.add('payment-btn--active');
    document.getElementById('formaPagamento').value = btn.dataset.value;
    document.getElementById('pagamentoError').textContent = '';
    this.ajustarFormPorPagamento(btn.dataset.value);
    this.lockPayment();
  }

  _setLabelText(id, texto) {
    const el = document.getElementById(id);
    if (!el) return;
    const tn = Array.from(el.childNodes).find(n => n.nodeType === 3);
    if (tn) tn.nodeValue = texto;
    else    el.insertBefore(document.createTextNode(texto), el.firstChild);
  }

  ajustarFormPorPagamento(tipo) {
    const isDinheiro    = tipo === 'Dinheiro';
    const isCredito     = tipo === 'Crédito';
    const isDebito      = tipo === 'Débito';
    const bancoRecEl    = document.getElementById('bancoRecebedor');
    const grupoBancoRec = document.getElementById('grupoBancoRecebedor');
    const rowDeposRec   = document.getElementById('rowDepositanteRecebedor');
    const rowBancos     = document.getElementById('rowBancos');

    document.getElementById('grupoNomeDepositante').style.display  = isDinheiro ? 'none' : '';
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
    const inputNomeRec  = document.getElementById('nomeRecebedor');
    const labelHora     = document.getElementById('labelHoraDeposito');

    if (isCredito || isDebito) {
      this._setLabelText('labelNomeDepositante', 'Nome da Loja ');
      this._setLabelText('labelNomeRecebedor',   'Maquininha ');
      this._setLabelText('labelDataDeposito',    'Data da Transação ');
      if (labelHora) labelHora.textContent = 'Hora da Transação';
      if (inputNomeDepo) inputNomeDepo.placeholder = 'Nome do estabelecimento';
      if (inputNomeRec)  inputNomeRec.placeholder  = 'Ex: Laranjinha, Stone, Cielo...';
    } else {
      this._setLabelText('labelNomeDepositante', 'Nome do Depositante ');
      this._setLabelText('labelNomeRecebedor',   'Nome de Quem Recebeu ');
      this._setLabelText('labelDataDeposito',    isDinheiro ? 'Data do Pagamento ' : 'Data do Depósito ');
      if (labelHora) labelHora.textContent = 'Hora do Depósito';
      if (inputNomeDepo) inputNomeDepo.placeholder = 'Quem realizou o pagamento';
      if (inputNomeRec)  inputNomeRec.placeholder  = 'Quem recebeu o valor';
    }

    if (isDinheiro) {
      bancoRecEl.value    = 'Caixa';
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
    const allowed = ['image/png','image/jpeg','image/jpg','image/gif','image/webp','application/pdf'];
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
      reader.onload = e => {
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
    this.lockPayment();
  }

  removeFile() {
    this.currentFile        = null;
    this.currentFileDataUrl = null;
    document.getElementById('uploadPreview').style.display         = 'none';
    document.getElementById('previewImg').style.display            = 'none';
    document.getElementById('previewImg').src                      = '';
    document.getElementById('previewFileName').textContent         = '';
    document.getElementById('btnLerComprovante').style.display     = 'none';
    document.getElementById('ocrStatus').style.display             = 'none';
    document.getElementById('fileInput').value                     = '';
  }

  lerComprovante() {
    this.ocr.lerComprovante(this.currentFile);
  }

  // ── Alunos ────────────────────────────────────────────────────────────────────
  _buildAlunoRowHTML(id, isFirst) {
    const labelNome = isFirst
      ? `<label class="form-label" for="alunoNome_${id}">Nome do Aluno <span class="required">*</span></label>`
      : `<label class="form-label form-label--dim" for="alunoNome_${id}">Aluno adicional</label>`;

    const labelParcela = isFirst
      ? `<label class="form-label" for="alunoParcela_${id}">Parcela <span class="required">*</span></label>`
      : `<label class="form-label form-label--dim" for="alunoParcela_${id}">Parcela</label>`;

    const btn = isFirst
      ? `<button type="button" class="btn-add-aluno" onclick="addAlunoRow()" title="Adicionar outro aluno">
           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
             <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
           </svg>
         </button>`
      : `<button type="button" class="btn-remove-aluno" onclick="removeAlunoRow(${id})" title="Remover aluno">
           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
             <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
           </svg>
         </button>`;

    return `<div class="aluno-row" id="alunoRow_${id}" data-aluno-id="${id}">
      <div class="form-group">
        ${labelNome}
        <input type="text" class="form-input" id="alunoNome_${id}" placeholder="Nome completo do aluno" />
        <span class="field-error" id="alunoNomeError_${id}"></span>
      </div>
      <div class="form-group">
        ${labelParcela}
        <input type="text" class="form-input" id="alunoParcela_${id}"
               placeholder="Ex: 1" inputmode="numeric" oninput="onlyNumbers(this)" />
        <span class="field-error" id="alunoParcelaError_${id}"></span>
      </div>
      <div class="aluno-row-btn">
        <span class="aluno-btn-spacer" aria-hidden="true"></span>
        ${btn}
      </div>
    </div>`;
  }

  initValidationListeners() {
    [
      ['curso',            'change', 'cursoError'],
      ['nomeDepositante',  'input',  'nomeDepositanteError'],
      ['nomeRecebedor',    'input',  'nomeRecebedorError'],
      ['bancoDepositante', 'input',  'bancoDepositanteError'],
      ['bancoRecebedor',   'input',  'bancoRecebedorError'],
      ['valorEntrada',     'input',  'valorError'],
      ['dataDeposito',     'input',  'dataError'],
    ].forEach(([inputId, evt, errId]) => {
      const el = document.getElementById(inputId);
      if (el) el.addEventListener(evt, () => clearFieldError(errId));
    });
  }

  _attachAlunoListeners(id) {
    const nome    = document.getElementById(`alunoNome_${id}`);
    const parcela = document.getElementById(`alunoParcela_${id}`);
    if (nome)    nome.addEventListener('input', () => clearFieldError(`alunoNomeError_${id}`));
    if (parcela) parcela.addEventListener('input', () => clearFieldError(`alunoParcelaError_${id}`));
  }

  initAlunosContainer() {
    this.nextAlunoId = 0;
    document.getElementById('alunosContainer').innerHTML = this._buildAlunoRowHTML(this.nextAlunoId, true);
    this._attachAlunoListeners(this.nextAlunoId++);
  }

  addAlunoRow() {
    const id = this.nextAlunoId++;
    document.getElementById('alunosContainer').insertAdjacentHTML('beforeend', this._buildAlunoRowHTML(id, false));
    this._attachAlunoListeners(id);
  }

  removeAlunoRow(id) {
    const row = document.getElementById(`alunoRow_${id}`);
    if (row) row.remove();
  }

  getAlunosData() {
    return Array.from(document.querySelectorAll('#alunosContainer .aluno-row')).map(row => {
      const id = row.dataset.alunoId;
      return {
        nome:    document.getElementById(`alunoNome_${id}`).value.trim(),
        parcela: document.getElementById(`alunoParcela_${id}`).value.trim(),
      };
    });
  }

  validateAlunos() {
    let ok = true;
    document.getElementById('alunosError').textContent = '';
    document.querySelectorAll('#alunosContainer .aluno-row').forEach(row => {
      const id      = row.dataset.alunoId;
      const nome    = document.getElementById(`alunoNome_${id}`).value.trim();
      const parcela = document.getElementById(`alunoParcela_${id}`).value.trim();
      const nomeErr = document.getElementById(`alunoNomeError_${id}`);
      const parErr  = document.getElementById(`alunoParcelaError_${id}`);
      if (!nome)    { nomeErr.textContent = 'Informe o nome do aluno.'; ok = false; }
      else            nomeErr.textContent = '';
      if (!parcela) { parErr.textContent  = 'Informe a parcela.';       ok = false; }
      else            parErr.textContent  = '';
    });
    return ok;
  }

  // ── Validação ─────────────────────────────────────────────────────────────────
  validate() {
    let ok = true;
    const fp         = document.getElementById('formaPagamento').value;
    const isDinheiro = fp === 'Dinheiro';
    const isCredito  = fp === 'Crédito';
    const isDebito   = fp === 'Débito';

    const checks = [
      { errId: 'cursoError',            msg: 'Selecione o curso.',              val: () => document.getElementById('curso').value },
      { errId: 'igrejaError',           msg: 'Selecione a igreja.',             val: () => document.getElementById('igreja').value },
      { errId: 'pagamentoError',        msg: 'Selecione a forma de pagamento.', val: () => document.getElementById('formaPagamento').value },
      { errId: 'nomeDepositanteError',  msg: 'Informe o nome do depositante.',  val: () => isDinheiro ? 'ok' : document.getElementById('nomeDepositante').value.trim() },
      { errId: 'nomeRecebedorError',    msg: 'Informe o nome de quem recebeu.', val: () => document.getElementById('nomeRecebedor').value.trim() },
      { errId: 'bancoDepositanteError', msg: 'Informe o banco depositante.',    val: () => (isDinheiro || isCredito || isDebito) ? 'ok' : document.getElementById('bancoDepositante').value.trim() },
      { errId: 'bancoRecebedorError',   msg: 'Informe o banco recebedor.',      val: () => (isDinheiro || isCredito || isDebito) ? 'ok' : document.getElementById('bancoRecebedor').value.trim() },
      { errId: 'valorError',            msg: 'Informe o valor.',                val: () => document.getElementById('valorEntrada').value.trim() },
      { errId: 'dataError',             msg: 'Informe a data.',                 val: () => document.getElementById('dataDeposito').value },
    ];

    checks.forEach(c => {
      const el = document.getElementById(c.errId);
      if (!c.val()) { el.textContent = c.msg; ok = false; }
      else            el.textContent = '';
    });

    if (!this.validateAlunos()) ok = false;
    return ok;
  }

  // ── Salvar ────────────────────────────────────────────────────────────────────
  salvarLancamento() {
    if (!this.validate()) {
      this.modal.showToast('Preencha os campos obrigatórios.', 'error');
      return;
    }

    const alunos = this.getAlunosData();
    const baseData = {
      curso:           document.getElementById('curso').value,
      igreja:          document.getElementById('igreja').value,
      formaPagamento:  document.getElementById('formaPagamento').value,
      nomeDepositante: document.getElementById('nomeDepositante').value.trim(),
      nomeRecebedor:   document.getElementById('nomeRecebedor').value.trim(),
      bancoDepositante:document.getElementById('bancoDepositante').value.trim(),
      bancoRecebedor:  document.getElementById('bancoRecebedor').value.trim(),
      valor:           document.getElementById('valorEntrada').value.trim(),
      dataDeposito:    dateInputToISO(document.getElementById('dataDeposito').value),
      horaDeposito:    document.getElementById('horaDeposito').value,
      observacao:      document.getElementById('observacao').value.trim(),
      comprovante:     this.currentFileDataUrl || null,
      criadoEm:        new Date().toISOString(),
    };

    const existing = JSON.parse(localStorage.getItem('ieteb_lancamentos') || '[]');
    const baseTime  = Date.now();

    const novosRegistros = alunos.slice().reverse().map((aluno, i) => ({
      ...baseData,
      id:        baseTime + (alunos.length - 1 - i),
      nomeAluno: aluno.nome,
      parcela:   aluno.parcela,
    }));

    novosRegistros.forEach(r => existing.unshift(r));
    localStorage.setItem('ieteb_lancamentos', JSON.stringify(existing));
    novosRegistros.forEach(r => this.firebase.save('Entradas', r));
    document.dispatchEvent(new Event('ieteb:data-changed'));

    const msg = alunos.length > 1
      ? `${alunos.length} lançamentos salvos com sucesso!`
      : 'Lançamento salvo com sucesso!';
    this.modal.showToast(msg, 'success');
    this.limparFormulario();
  }

  limparFormulario() {
    ['curso','nomeDepositante','nomeRecebedor','bancoDepositante',
     'bancoRecebedor','valorEntrada','dataDeposito','horaDeposito',
     'observacao','formaPagamento'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    document.getElementById('igreja').value       = '';
    document.getElementById('igrejaSearch').value = '';
    document.querySelectorAll('.payment-btn').forEach(b => b.classList.remove('payment-btn--active'));
    this.unlockPayment();
    this.ajustarFormPorPagamento('');

    ['cursoError','igrejaError','pagamentoError','nomeDepositanteError',
     'nomeRecebedorError','bancoDepositanteError','bancoRecebedorError',
     'valorError','dataError','alunosError']
      .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = ''; });

    this.initAlunosContainer();
    this.removeFile();
  }
}
