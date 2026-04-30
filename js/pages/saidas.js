
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
    const isPdf   = file.type === 'application/pdf';
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
    this.unlockPayment();
  }

  async lerNF() {
    if (!this.currentFile) return;
    const isImage = this.currentFile.type.startsWith('image/');
    this.setStatus(true, isImage ? 'Lendo imagem...' : 'Lendo PDF...');
    try {
      if (isImage) {
        await this.extrairDaImagem();
      } else {
        await this.extrairDoPdf();
      }
    } catch (err) {
      this.setStatus(false);
      this.modal.showToast('Não foi possível ler o arquivo. Verifique e tente novamente.', 'error');
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
          // Cupom fiscal precisa de boa resolução para o Tesseract pegar
          // letras pequenas (data/hora no rodapé). Mira em ~3000px no
          // lado maior; reduz fotos grandes da câmera para evitar memória.
          const maxSide = Math.max(img.width, img.height);
          let scale = 1;
          if (maxSide < 2800)      scale = 2800 / maxSide;
          else if (maxSide > 4000) scale = 4000 / maxSide;

          const canvas  = document.createElement('canvas');
          canvas.width  = Math.round(img.width  * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const d = imageData.data;

          // Passo 1: grayscale + histograma
          const histogram = new Array(256).fill(0);
          for (let i = 0; i < d.length; i += 4) {
            const gray = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
            d[i] = d[i + 1] = d[i + 2] = gray;
            histogram[gray]++;
          }

          // Passo 2: threshold de Otsu (binarização adaptativa)
          const total = canvas.width * canvas.height;
          let sumAll = 0;
          for (let i = 0; i < 256; i++) sumAll += i * histogram[i];
          let sumB = 0, wB = 0, maxBetween = 0, threshold = 128;
          for (let t = 0; t < 256; t++) {
            wB += histogram[t];
            if (wB === 0) continue;
            const wF = total - wB;
            if (wF === 0) break;
            sumB += t * histogram[t];
            const mB = sumB / wB;
            const mF = (sumAll - sumB) / wF;
            const between = wB * wF * (mB - mF) * (mB - mF);
            if (between > maxBetween) { maxBetween = between; threshold = t; }
          }
          // Suaviza levemente o threshold para preservar contornos finos de
          // letras pequenas (data/hora). +6 favorece "manter mais preto".
          threshold = Math.min(threshold + 6, 240);

          // Passo 3: aumenta contraste antes da binarização (preserva
          // alguns tons cinza para letras na borda). Aplica binarização
          // só onde a diferença com o threshold é grande.
          for (let i = 0; i < d.length; i += 4) {
            const g  = d[i];
            const cf = (g - 128) * 1.6 + 128;
            const c  = Math.max(0, Math.min(255, cf));
            const bw = c >= threshold ? 255 : 0;
            d[i] = d[i + 1] = d[i + 2] = bw;
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
      },
      // PSM 4: assume coluna única de texto de tamanho variável.
      // Funciona bem para cupom fiscal/NFC-e onde tudo está empilhado.
      tessedit_pageseg_mode: '4',
    });
    this.setStatus(false);
    // Expõe o texto OCR só em debug (admin pode rodar window.__ietebOcrText)
    try { window.__ietebOcrText = result.data.text; } catch (_) {}
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

    // Extrair data do texto do pdf.js mesmo se curto (antes de cair no OCR)
    const pdfNorm = fullText.replace(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})/g, '$1/$2/$3');
    const pdfDateMatch =
      pdfNorm.match(/\b(\d{2}\/\d{2}\/\d{4})\b/) ||
      pdfNorm.match(/\b(\d{4}-\d{2}-\d{2})\b/)   ||
      pdfNorm.match(/\b(\d{2}\/\d{2}\/\d{2})\b/);
    let pdfDate = null;
    if (pdfDateMatch && pdfDateMatch[1]) {
      const raw = pdfDateMatch[1];
      const parts = raw.split('/');
      if (raw.includes('-')) {
        pdfDate = raw;
      } else if (parts.length === 3) {
        pdfDate = parts[2].length === 2
          ? `20${parts[2]}-${parts[1]}-${parts[0]}`
          : `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }

    if (fullText.trim().length > 50) {
      this.setStatus(false);
      this.parseAndShow(fullText);
      return;
    }

    this.setStatus(true, 'Processando imagem do PDF...');
    const page     = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 4.0 });
    const canvas   = document.createElement('canvas');
    canvas.width   = viewport.width;
    canvas.height  = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;
    let minG = 255, maxG = 0;
    for (let i = 0; i < d.length; i += 4) {
      const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
      if (g < minG) minG = g;
      if (g > maxG) maxG = g;
    }
    const range = maxG - minG || 1;
    for (let i = 0; i < d.length; i += 4) {
      const g       = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
      const bw      = Math.round((g - minG) / range * 255) > 140 ? 255 : 0;
      d[i] = d[i + 1] = d[i + 2] = bw;
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
      },
      tessedit_pageseg_mode: '4',
    });
    this.setStatus(false);
    try { window.__ietebOcrText = result.data.text; } catch (_) {}
    this.parseAndShow(result.data.text);
    // Fallback: se OCR não leu a data, usar a extraída do pdf.js
    if (!this.ocrExtracted.data && pdfDate) {
      this.ocrExtracted.data = pdfDate;
      document.querySelectorAll('#ocrSummarySaida .ocr-row').forEach(row => {
        if (row.querySelector('.ocr-row-label').textContent === 'Data') {
          row.querySelector('.ocr-row-value').textContent = pdfDate;
        }
      });
    }
  }

  extractFields(text) {
    const result = {};
    const full   = text;
    const lower  = full.toLowerCase();

    const _parseValor = raw => {
      const n = parseFloat(raw.trim().replace(/\.(?=\d{3}(?:,|$))/g, '').replace(',', '.'));
      return isNaN(n) ? null : n;
    };
    // Aceita números com OU sem milhar: 1.234,56 / 1234,56 / 1234.56 / 12,34
    const NUM_RE = '([0-9]{1,3}(?:[\\.\\s][0-9]{3})*[,\\.][0-9]{2})';

    // ── Valor ──────────────────────────────────────────────────────────
    // Para NFC-e/cupons fiscais, "Valor a pagar" é o valor final correto.
    // Permite até 60 chars (incluindo \n) entre o termo e o número, porque
    // o OCR frequentemente quebra a linha.
    let vMatch =
      full.match(new RegExp('valor\\s*[aà]?\\s*pagar[\\s\\S]{0,60}?' + NUM_RE, 'i')) ||
      full.match(new RegExp('total\\s*(?:da\\s*)?(?:nota|nf[ae]?|geral|liquido|liq)\\b[\\s\\S]{0,40}?' + NUM_RE, 'i')) ||
      full.match(new RegExp('valor\\s*(?:total|pago)[\\s\\S]{0,40}?' + NUM_RE, 'i')) ||
      full.match(new RegExp('total\\s*[\\s\\S]{0,40}?' + NUM_RE, 'i'));

    // Se nada bater, tenta o maior valor após "FORMA PAGAMENTO" (NFC-e)
    if (!vMatch) {
      const idx = lower.search(/forma\s*(?:de\s*)?pagamento/i);
      if (idx >= 0) {
        const trecho = full.slice(idx);
        const matches = [...trecho.matchAll(new RegExp(NUM_RE, 'g'))]
          .map(m => _parseValor(m[1]))
          .filter(v => v !== null && v > 1);
        if (matches.length) {
          const v = Math.max(...matches);
          result.valor = 'R$ ' + v.toFixed(2).replace('.', ',');
        }
      }
    }
    if (vMatch && !result.valor) {
      const n = _parseValor(vMatch[1]);
      if (n && n > 0) result.valor = 'R$ ' + n.toFixed(2).replace('.', ',');
    }
    // Fallback final: maior valor monetário do documento
    if (!result.valor) {
      const todos = [...full.matchAll(new RegExp('\\b' + NUM_RE + '\\b', 'g'))]
        .map(m => _parseValor(m[1]))
        .filter(v => v !== null && v > 1);
      if (todos.length) {
        const maior = Math.max(...todos);
        result.valor = 'R$ ' + maior.toFixed(2).replace('.', ',');
      }
    }

    // ── Data ───────────────────────────────────────────────────────────
    // OCR de cupom amassado costuma trocar dígitos por letras parecidas
    // (O↔0, l/I↔1, B↔8, S↔5, Z↔2, G↔6). Tentamos primeiro o texto bruto
    // e, se falhar, uma versão "normalizada" só para esses dígitos.
    const _ocrDigitFix = s => s
      .replace(/[Oo]/g, '0').replace(/[QqDÇç]/g, '0')
      .replace(/[IiLl|!]/g, '1')
      .replace(/[Zz]/g, '2')
      .replace(/[BbßĐ]/g, '8')
      .replace(/[Ss]/g, '5')
      .replace(/[Gg]/g, '6');

    const normalized = full.replace(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})/g, '$1/$2/$3');

    let dataMatch =
      normalized.match(/\b(\d{2}\/\d{2}\/\d{4})\b/) ||
      normalized.match(/\b(\d{4}-\d{2}-\d{2})\b/)   ||
      normalized.match(/\b(\d{2}\/\d{2}\/\d{2})\b/);

    if (!dataMatch) {
      // Procura candidatos com letras+dígitos+barras e tenta interpretar
      const candidatos = full.match(/[0-9OoIiLlBbSsZzQqGg!|]{1,2}[\/\.\-][0-9OoIiLlBbSsZzQqGg!|]{1,2}[\/\.\-][0-9OoIiLlBbSsZzQqGg!|]{2,4}/g) || [];
      for (const c of candidatos) {
        const fixed = _ocrDigitFix(c).replace(/[.\-]/g, '/');
        const m = fixed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
        if (m) { dataMatch = [c, fixed]; break; }
      }
    }

    if (dataMatch && dataMatch[1]) {
      const raw   = dataMatch[1];
      const parts = raw.split('/');
      if (raw.includes('-')) {
        result.data = raw;
      } else if (parts.length === 3) {
        const dd = parts[0].padStart(2, '0');
        const mm = parts[1].padStart(2, '0');
        const yyyy = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
        result.data = `${yyyy}-${mm}-${dd}`;
      }
    }

    // ── Hora ───────────────────────────────────────────────────────────
    let horaMatch =
      full.match(/\d{2}\/\d{2}\/\d{4}[\sT,]+(\d{2}):(\d{2})/) ||
      full.match(/\d{4}-\d{2}-\d{2}[\sT]+(\d{2}):(\d{2})/)    ||
      full.match(/\b(\d{1,2})h(\d{2})\b/i)                     ||
      full.match(/[àa]s\s+(\d{1,2}):(\d{2})/i)                 ||
      full.match(/(?:hora|time)\s*[:\-]\s*(\d{1,2}):(\d{2})/i) ||
      full.match(/\b((?:[01]\d|2[0-3])):([0-5]\d)(?::\d{2})?\b/);

    if (!horaMatch) {
      // Tenta com chars OCR-confusos
      const cand = full.match(/[0-9OoIiLlBbSsZzQqGg!|]{1,2}[:hH][0-9OoIiLlBbSsZzQqGg!|]{2}(?:[:hH][0-9OoIiLlBbSsZzQqGg!|]{2})?/);
      if (cand) {
        const fixed = _ocrDigitFix(cand[0]).replace(/[hH]/g, ':');
        const m = fixed.match(/^(\d{1,2}):(\d{2})/);
        if (m) horaMatch = [cand[0], m[1], m[2]];
      }
    }

    if (horaMatch && horaMatch[1] && horaMatch[2]) {
      result.hora = String(horaMatch[1]).padStart(2, '0') + ':' + String(horaMatch[2]).padStart(2, '0');
    }

    // ── Fornecedor ─────────────────────────────────────────────────────
    // Em NFC-e/cupom o nome do estabelecimento é uma das primeiras linhas,
    // logo antes do CNPJ. Estratégia em ordem de prioridade:
    //   1) Linha imediatamente anterior à do CNPJ
    //   2) Mesma linha do CNPJ (se houver texto antes dele)
    //   3) Linha que termina em LTDA/EIRELI/SA/etc nas primeiras 10 linhas
    //   4) Primeira linha não-vazia "razoável" (com letras, sem ser título)
    {
      const _lines = full.split(/\n/).map(l => l.trim()).filter(Boolean);
      const _cnpjRe = /\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\s\/]?\d{4}[\s\-]?\d{2}/;

      const _looksLikeTitle = s => /^(documento|docucuento|docu[a-z]*\s+aux|auxiliar|nf[ce]?(?:-?e)?\b|cupom\s+fiscal|consumidor|via\s+do|recibo|c[oó]digo|descri|qtde|forma\s*pagamento|valor|total|desconto|cart[aã]o|consulte|protocolo|chave\s+de\s+acesso|https?:|www\.)/i.test(s);
      const _hasLetters = s => /[A-Za-zÀ-ÿ]{3,}/.test(s);
      const _looksLikeName = s =>
        s.length >= 5
        && _hasLetters(s)
        && !_looksLikeTitle(s)
        && !_cnpjRe.test(s)
        && !/^\d/.test(s);

      let nome = null;
      // Procura o CNPJ nas primeiras 15 linhas
      for (let i = 0; i < Math.min(_lines.length, 15); i++) {
        if (_cnpjRe.test(_lines[i]) || /CN[PF]J/i.test(_lines[i])) {
          // 1) Linha anterior é forte candidata
          for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
            if (_looksLikeName(_lines[j])) { nome = _lines[j]; break; }
          }
          if (nome) break;

          // 2) Mesma linha pode ter "Empresa LTDA  CNPJ:..."
          const sl = _lines[i].match(/^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 &.,'|-]{3,60}?)\s+(?:CN[PF]J|\d{2}[\.\s]?\d{3})/i);
          if (sl && sl[1].trim().length >= 4) { nome = sl[1].trim(); break; }
        }
      }

      // 3) Linha terminando em LTDA/EIRELI/SA nas primeiras 10
      if (!nome) {
        for (const l of _lines.slice(0, 10)) {
          if (/(?:LTDA|EIRELI|S[\/.]?A|ME|MEI|EPP)\s*\.?$/i.test(l) && _hasLetters(l) && !_looksLikeTitle(l)) {
            nome = l; break;
          }
        }
      }

      // 4) Primeira linha "razoável"
      if (!nome) {
        for (const l of _lines.slice(0, 8)) {
          if (_looksLikeName(l)) { nome = l; break; }
        }
      }

      if (nome) {
        // limpa caracteres residuais e normaliza
        const n = nome
          .replace(/CN[PF]J.*$/i, '')
          .replace(/^[\s|;"'(]+|[\s|;"')=]+$/g, '')
          .replace(/\s{2,}/g, ' ')
          .trim();
        if (n.length >= 3) result.fornecedor = toTitleCase(n);
      }
    }

    // ── Forma de pagamento ─────────────────────────────────────────────
    if      (/cart[aã]o\s+de\s+cr[eé]dito|cr[eé]dito/i.test(lower)) result.formaPagamento = 'Crédito';
    else if (/cart[aã]o\s+de\s+d[eé]bito|d[eé]bito/i.test(lower))   result.formaPagamento = 'Débito';
    else if (lower.includes('pix'))                                    result.formaPagamento = 'Pix';
    else if (lower.includes('dinheiro'))                               result.formaPagamento = 'Dinheiro';

    return result;
  }

  parseAndShow(text) {
    const extracted = this.extractFields(text);
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
    if (e.formaPagamento) {
      document.getElementById('saidaFormaPagamento').value = e.formaPagamento;
      document.querySelectorAll('#paymentTypesSaida .payment-btn').forEach(btn => {
        btn.classList.toggle('payment-btn--active', btn.dataset.value === e.formaPagamento);
      });
      this.lockPayment();
    }
    this.switchTab('manual');
    this._abrirModalDados();
  }

  _abrirModalDados() {
    const e = this.ocrExtracted;
    const labels = { fornecedor: 'Fornecedor', valor: 'Valor', data: 'Data', hora: 'Hora', formaPagamento: 'Pagamento' };
    document.getElementById('ocrDadosSummary').innerHTML = Object.keys(labels)
      .filter(k => e[k])
      .map(k => `<div class="ocr-row">
        <span class="ocr-row-label">${escHtml(labels[k])}</span>
        <span class="ocr-row-value">${escHtml(e[k])}</span>
      </div>`).join('') || '<p style="padding:16px;color:#aaa;text-align:center">Nenhum dado extraído.</p>';
    this.modal.open('ocrDadosModal');
  }

  closeOcrDadosModal() { this.modal.close('ocrDadosModal'); }

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

      const _cu = getCurrentUser();
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
        userId:         _cu.id,
        userName:       _cu.name,
      };

      const existing = JSON.parse(localStorage.getItem('ieteb_saidas') || '[]');
      existing.unshift(registro);
      try {
        localStorage.setItem('ieteb_saidas', JSON.stringify(existing));
      } catch (_) {
        try { localStorage.setItem('ieteb_saidas', JSON.stringify(existing.slice(0, 100))); } catch (__) {}
      }
      this.firebase.save('Saídas', registro);

      this._showSnackbar();
      this.limparSaida();
      try { document.dispatchEvent(new CustomEvent('ietebDataChanged')); } catch (_) {}
    } catch (err) {
      console.error('salvarSaida erro:', err);
      this.modal.showToast('Erro ao salvar: ' + (err.message || err), 'error');
    }
  }

  _showSnackbar() {
    const el      = document.getElementById('saidaSavedSnackbar');
    const overlay = document.getElementById('saidaSnackbarOverlay');
    const msg     = document.getElementById('savedSnackbarMsg');
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
