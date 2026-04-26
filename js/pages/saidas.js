
class SaidaPage {
  constructor(modal, firebase) {
    this.modal    = modal;
    this.firebase = firebase;

    this.currentFile        = null;
    this.currentFileDataUrl = null;
    this.ocrExtracted       = {};
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
      ['saidaCategoria',  'change', 'saidaCategoriaError'],
      ['saidaFornecedor', 'input',  'saidaFornecedorError'],
      ['saidaValor',      'input',  'saidaValorError'],
      ['saidaData',       'input',  'saidaDataError'],
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
    document.querySelectorAll('#paymentTypesSaida .payment-btn').forEach(b => b.classList.remove('payment-btn--active'));
    btn.classList.add('payment-btn--active');
    document.getElementById('saidaFormaPagamento').value = btn.dataset.value;
    document.getElementById('saidaPagamentoError').textContent = '';
    this.lockPayment();
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
    if (file.type !== 'application/pdf') {
      this.modal.showToast('Envie o PDF da Nota Fiscal. Imagens não são suportadas nesta seção.', 'error');
      return;
    }
    this.currentFile = file;
    document.getElementById('previewFileNameSaida').textContent = file.name;
    document.getElementById('uploadPreviewSaida').style.display = 'block';

    const img = document.getElementById('previewImgSaida');
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
      const reader = new FileReader();
      reader.onload = e => { this.currentFileDataUrl = e.target.result; };
      reader.readAsDataURL(file);
    }

    document.getElementById('btnLerNF').style.display = 'flex';
  }

  removeFile() {
    this.currentFile        = null;
    this.currentFileDataUrl = null;
    document.getElementById('uploadPreviewSaida').style.display  = 'none';
    document.getElementById('previewImgSaida').style.display     = 'none';
    document.getElementById('previewImgSaida').src               = '';
    document.getElementById('previewFileNameSaida').textContent  = '';
    document.getElementById('btnLerNF').style.display            = 'none';
    document.getElementById('ocrStatusSaida').style.display      = 'none';
    document.getElementById('fileInputSaida').value              = '';
  }

  async lerNF() {
    if (!this.currentFile) return;
    this.setStatus(true, 'Lendo PDF...');
    try {
      await this.extrairDoPdf();
    } catch (err) {
      this.setStatus(false);
      this.modal.showToast('Não foi possível ler o PDF. Verifique o arquivo e tente novamente.', 'error');
      console.error(err);
    }
  }

  setStatus(show, text) {
    const el = document.getElementById('ocrStatusSaida');
    el.style.display = show ? 'flex' : 'none';
    if (text) document.getElementById('ocrStatusTextSaida').textContent = text;
  }

  // ── OCR ───────────────────────────────────────────────────────────────────────
  async preprocessImageForNF(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img load error')); };
      img.onload  = () => {
        URL.revokeObjectURL(url);
        try {
          const maxSide = Math.max(img.width, img.height);
          const scale   = maxSide < 2500 ? 2500 / maxSide : 1;
          const canvas  = document.createElement('canvas');
          canvas.width  = Math.round(img.width  * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const d = imageData.data;
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i], g = d[i + 1], b = d[i + 2];
            const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
            d[i] = d[i + 1] = d[i + 2] = gray;
          }
          ctx.putImageData(imageData, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } catch (err) { reject(err); }
      };
      img.src = url;
    });
  }

  async extrairDaImagem() {
    this.setStatus(true, 'Iniciando reconhecimento de texto...');
    if (typeof Tesseract === 'undefined') {
      await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
    }
    this.setStatus(true, 'Processando imagem...');
    let fileParaOcr = this.currentFile;
    try {
      fileParaOcr = await this.preprocessImageForNF(this.currentFile);
    } catch (e) {
      console.warn('[OCR NF] Pré-processamento falhou, usando original:', e);
    }
    this.setStatus(true, 'Lendo documento...');
    const result = await Tesseract.recognize(fileParaOcr, 'por', {
      logger: m => {
        if (m.status === 'recognizing text') {
          const pct = Math.round((m.progress || 0) * 100);
          this.setStatus(true, `Lendo documento... ${pct}%`);
        }
      }
    });
    this.setStatus(false);
    this.parseAndShow(result.data.text);
  }

  async extrairDoPdf() {
    this.setStatus(true, 'Lendo PDF...');
    if (typeof pdfjsLib === 'undefined') {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    const arrayBuffer = await this.currentFile.arrayBuffer();
    const pdf         = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map(item => item.str).join(' ') + '\n';
    }

    if (fullText.trim().length > 50) {
      this.setStatus(false);
      this.parseAndShow(fullText);
      return;
    }

    this.setStatus(true, 'Processando imagem do PDF...');
    const page     = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2.5 });
    const canvas   = document.createElement('canvas');
    canvas.width   = viewport.width;
    canvas.height  = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const gray = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
      d[i] = d[i + 1] = d[i + 2] = gray;
    }
    ctx.putImageData(imgData, 0, 0);

    if (typeof Tesseract === 'undefined') {
      await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
    }
    this.setStatus(true, 'Lendo documento...');
    const result = await Tesseract.recognize(canvas, 'por', {
      logger: m => {
        if (m.status === 'recognizing text') {
          const pct = Math.round((m.progress || 0) * 100);
          this.setStatus(true, `Lendo documento... ${pct}%`);
        }
      }
    });
    this.setStatus(false);
    this.parseAndShow(result.data.text);
  }

  extractFields(text) {
    const result = {};
    const full   = text;
    const lower  = full.toLowerCase();

    const _parseValor = raw => {
      const n = parseFloat(raw.trim().replace(/\.(?=\d{3}(?:,|$))/g, '').replace(',', '.'));
      return isNaN(n) ? null : n;
    };
    const vExato =
      full.match(/valor\s+[aà]\s+pagar\s+r?[s$5]?\s*([0-9]{1,3}(?:\.[0-9]{3})*[,\.][0-9]{2})/i) ||
      full.match(/valor\s+(?:total|pago)\s+r?[s$5]?\s*([0-9]{1,3}(?:\.[0-9]{3})*[,\.][0-9]{2})/i) ||
      full.match(/total\s+(?:[aà]\s+pagar|geral|nf[ae]?)?\s*r?[s$5]?\s*[:\-]?\s*([0-9]{1,3}(?:\.[0-9]{3})*[,\.][0-9]{2})/i) ||
      full.match(/r?[$s5]\s*([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})\b/i);
    if (vExato) {
      const n = _parseValor(vExato[1]);
      if (n) result.valor = 'R$ ' + n.toFixed(2).replace('.', ',');
    }
    if (!result.valor) {
      const todos = [...full.matchAll(/\b([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})\b/g)]
        .map(m => _parseValor(m[1]))
        .filter(v => v !== null && v > 1);
      if (todos.length) {
        const maior = Math.max(...todos);
        result.valor = 'R$ ' + maior.toFixed(2).replace('.', ',');
      }
    }

    const dataMatch =
      full.match(/\b(\d{2}\/\d{2}\/\d{4})\b/) ||
      full.match(/\b(\d{4}-\d{2}-\d{2})\b/)   ||
      full.match(/\b(\d{2}\/\d{2}\/\d{2})\b/);
    if (dataMatch && dataMatch[1]) {
      const raw   = dataMatch[1];
      const parts = raw.split('/');
      if (raw.includes('-')) {
        result.data = raw;
      } else if (parts.length === 3) {
        result.data = parts[2].length === 2
          ? `20${parts[2]}-${parts[1]}-${parts[0]}`
          : `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }

    const horaMatch =
      full.match(/\d{2}\/\d{2}\/\d{4}[\sT,]+(\d{2}):(\d{2})/) ||
      full.match(/\d{4}-\d{2}-\d{2}[\sT]+(\d{2}):(\d{2})/)    ||
      full.match(/\b(\d{1,2})h(\d{2})\b/i)                     ||
      full.match(/[àa]s\s+(\d{1,2}):(\d{2})/i)                 ||
      full.match(/(?:hora|time)\s*[:\-]\s*(\d{1,2}):(\d{2})/i) ||
      full.match(/\b((?:[01]\d|2[0-3])):([0-5]\d)(?::\d{2})?\b/);
    if (horaMatch && horaMatch[1] && horaMatch[2]) {
      result.hora = String(horaMatch[1]).padStart(2, '0') + ':' + String(horaMatch[2]).padStart(2, '0');
    }

    {
      let nome = null;
      const _lines = full.split(/\n/).map(l => l.trim()).filter(Boolean);

      const m1 = full.match(/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 &.,'"|-]{3,60})\s+(?:CN[PF]J|CPF)\s*[:.]?\s*[\d]/i);
      const m3 = full.match(/raz[aã]o\s+social\s*[:\-]?\s*([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 &.,'|-]{2,60})/i);
      const m4 = full.match(/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 &.,']{4,55}(?:\s+(?:LTDA|EIRELI|S\.A\.|S\/A|MICROEMPRESA)))/i);
      const _cnpjRe = /\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\s\/]?\d{4}[\s\-]?\d{2}/;
      let m5 = null;
      for (let i = 0; i < Math.min(_lines.length, 25); i++) {
        if (/CN[PF]J/i.test(_lines[i]) || _cnpjRe.test(_lines[i])) {
          const sl = _lines[i].match(/^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 &.,']{3,60}?)\s+(?:CN[PF]J|\d{2}[\.\s]?\d{3})/i);
          if (sl && sl[1].trim().length >= 4) { m5 = sl[1].trim(); break; }
          if (i > 0) {
            const prev = _lines[i - 1];
            if (prev.length >= 4 && /[A-Za-zÀ-ÿ]{2,}/.test(prev) && !/^\d{2}[\/\.]/.test(prev))
              { m5 = prev; break; }
          }
        }
      }

      if      (m1) nome = m1[1];
      else if (m3) nome = m3[1];
      else if (m5) nome = m5;
      else if (m4) nome = m4[1];

      if (nome) {
        const n = nome.trim().replace(/^[\s|;"'(]+|[\s|;"')=]+$/g, '');
        if (n.length >= 3) result.fornecedor = toTitleCase(n);
      }
    }

    if      (/cart[aã]o\s+de\s+cr[eé]dito|cr[eé]dito/i.test(lower)) result.formaPagamento = 'Crédito';
    else if (/cart[aã]o\s+de\s+d[eé]bito|d[eé]bito/i.test(lower))   result.formaPagamento = 'Débito';
    else if (lower.includes('pix'))                                    result.formaPagamento = 'Pix';
    else if (lower.includes('dinheiro'))                               result.formaPagamento = 'Dinheiro';

    return result;
  }

  parseAndShow(text) {
    console.log('[OCR NF] Texto bruto extraído:\n', text);
    const extracted = this.extractFields(text);
    console.log('[OCR NF] Campos extraídos:', extracted);
    this.ocrExtracted = extracted;

    const labels = { fornecedor: 'Fornecedor', valor: 'Valor', data: 'Data', hora: 'Hora' };
    document.getElementById('ocrSummarySaida').innerHTML = Object.keys(labels).map(k =>
      `<div class="ocr-row">
        <span class="ocr-row-label">${labels[k]}</span>
        <span class="ocr-row-value">${escHtml(extracted[k] || '—')}</span>
      </div>`
    ).join('');

    this.modal.open('ocrModalSaida');
  }

  confirmarOcr() {
    this.modal.close('ocrModalSaida');
    const e = this.ocrExtracted;
    const clearErr = id => { const el = document.getElementById(id); if (el) el.textContent = ''; };
    if (e.fornecedor) { setInput('saidaFornecedor', e.fornecedor);                                    clearErr('saidaFornecedorError'); }
    if (e.valor)      { document.getElementById('saidaValor').value = e.valor.replace('R$ ', '');     clearErr('saidaValorError');      }
    if (e.data)       { setInput('saidaData', isoToDateInput(e.data));                                clearErr('saidaDataError');        }
    if (e.hora)         setInput('saidaHora', e.hora);
    this.switchTab('manual');
    this.modal.showToast('Formulário preenchido! Revise os dados e salve.', 'success');
  }

  closeOcrModal() { this.modal.close('ocrModalSaida'); }

  // ── Validação ─────────────────────────────────────────────────────────────────
  validate() {
    let ok = true;
    const checks = [
      { errId: 'saidaCategoriaError',  msg: 'Selecione a categoria.',               val: () => { const el = document.getElementById('saidaCategoria');  return el ? el.value : ''; } },
      { errId: 'saidaFornecedorError', msg: 'Informe o fornecedor ou beneficiário.', val: () => { const el = document.getElementById('saidaFornecedor'); return el ? el.value.trim() : ''; } },
      { errId: 'saidaPagamentoError',  msg: 'Selecione a forma de pagamento.',       val: () => { const el = document.getElementById('saidaFormaPagamento'); return el ? el.value : ''; } },
      { errId: 'saidaValorError',      msg: 'Informe o valor.',                      val: () => { const el = document.getElementById('saidaValor');      return el ? el.value.trim() : ''; } },
      { errId: 'saidaDataError',       msg: 'Informe a data.',                       val: () => { const el = document.getElementById('saidaData');       return el ? el.value : ''; } },
    ];
    checks.forEach(c => {
      try {
        const el = document.getElementById(c.errId);
        const v = c.val();
        if (!v) { if (el) el.textContent = c.msg; ok = false; }
        else     { if (el) el.textContent = ''; }
      } catch (_) { ok = false; }
    });
    return ok;
  }

  salvarSaida() {
    try {
      if (!this.validate()) {
        this.modal.showToast('Preencha os campos obrigatórios.', 'error');
        return;
      }

      const registro = {
        id:             Date.now(),
        categoria:      document.getElementById('saidaCategoria').value,
        fornecedor:     document.getElementById('saidaFornecedor').value.trim(),
        formaPagamento: document.getElementById('saidaFormaPagamento').value,
        valor:          document.getElementById('saidaValor').value.trim(),
        data:           dateInputToISO(document.getElementById('saidaData').value),
        hora:           document.getElementById('saidaHora').value,
        observacao:     document.getElementById('saidaObservacao').value.trim(),
        criadoEm:       new Date().toISOString(),
      };

      const existing = JSON.parse(localStorage.getItem('ieteb_saidas') || '[]');
      existing.unshift(registro);
      try {
        localStorage.setItem('ieteb_saidas', JSON.stringify(existing));
      } catch (_) {
        try { localStorage.setItem('ieteb_saidas', JSON.stringify(existing.slice(0, 100))); } catch (__) {}
      }
      this.firebase.save('Saídas', registro);

      this.modal.showToast('Saída salva com sucesso!', 'success');
      this.limparSaida();
      try { document.dispatchEvent(new CustomEvent('ietebDataChanged')); } catch (_) {}
    } catch (err) {
      console.error('salvarSaida erro:', err);
      this.modal.showToast('Erro ao salvar: ' + (err.message || err), 'error');
    }
  }

  limparSaida() {
    ['saidaCategoria','saidaFornecedor','saidaFormaPagamento',
     'saidaValor','saidaData','saidaHora','saidaObservacao'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.querySelectorAll('#paymentTypesSaida .payment-btn').forEach(b => b.classList.remove('payment-btn--active'));
    this.unlockPayment();
    ['saidaCategoriaError','saidaFornecedorError','saidaPagamentoError',
     'saidaValorError','saidaDataError'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '';
    });
    this.removeFile();
  }
}
