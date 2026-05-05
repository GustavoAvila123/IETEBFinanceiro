/**
 * OCR Saídas — extração de dados de nota fiscal/cupom (NFC-e)
 *
 * Responsabilidades:
 *  - Pré-processamento da imagem (Otsu + contraste)
 *  - Tesseract.js para OCR
 *  - pdf.js para PDFs vetorizados
 *  - Parsing dos campos: fornecedor, valor, data, hora, formaPagamento
 *  - Validação de qualidade (rejeita fotos aleatórias)
 *  - Apresentação no modal de confirmação
 */
class OCRSaidas {
  constructor(modal) {
    this.modal = modal;
    this.ocrExtracted = {};
    this._saidaPage = null;
  }

  // O OCR precisa avisar a SaidaPage quando: identificou forma de pagamento
  // (lockPayment), trocar de aba após confirmar, ou cancelar (removeFile).
  setSaidaPage(saidaPage) {
    this._saidaPage = saidaPage;
  }

  setStatus(show, text) {
    const el = document.getElementById('ocrStatusSaida');
    if (el) el.style.display = show ? 'flex' : 'none';
    if (text) {
      const t = document.getElementById('ocrStatusTextSaida');
      if (t) t.textContent = text;
    }
  }

  async lerNF(currentFile) {
    if (!currentFile) return;
    this._currentFile = currentFile;
    const isImage = currentFile.type.startsWith('image/');
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
    }
  }

  async preprocessImageForNF(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('img load error'));
      };
      img.onload = () => {
        URL.revokeObjectURL(url);
        try {
          // Cupom fiscal precisa de boa resolução para o Tesseract pegar
          // letras pequenas (data/hora no rodapé). Mira em ~3000px no
          // lado maior; reduz fotos grandes da câmera para evitar memória.
          const maxSide = Math.max(img.width, img.height);
          let scale = 1;
          if (maxSide < 2800) scale = 2800 / maxSide;
          else if (maxSide > 4000) scale = 4000 / maxSide;

          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
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
          let sumB = 0,
            wB = 0,
            maxBetween = 0,
            threshold = 128;
          for (let t = 0; t < 256; t++) {
            wB += histogram[t];
            if (wB === 0) continue;
            const wF = total - wB;
            if (wF === 0) break;
            sumB += t * histogram[t];
            const mB = sumB / wB;
            const mF = (sumAll - sumB) / wF;
            const between = wB * wF * (mB - mF) * (mB - mF);
            if (between > maxBetween) {
              maxBetween = between;
              threshold = t;
            }
          }
          // Suaviza levemente o threshold para preservar contornos finos de
          // letras pequenas (data/hora). +6 favorece "manter mais preto".
          threshold = Math.min(threshold + 6, 240);

          // Passo 3: aumenta contraste antes da binarização (preserva
          // alguns tons cinza para letras na borda). Aplica binarização
          // só onde a diferença com o threshold é grande.
          for (let i = 0; i < d.length; i += 4) {
            const g = d[i];
            const cf = (g - 128) * 1.6 + 128;
            const c = Math.max(0, Math.min(255, cf));
            const bw = c >= threshold ? 255 : 0;
            d[i] = d[i + 1] = d[i + 2] = bw;
          }
          ctx.putImageData(imageData, 0, 0);

          resolve(canvas.toDataURL('image/png'));
        } catch (err) {
          reject(err);
        }
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
    let fileParaOcr = this._currentFile;
    try {
      fileParaOcr = await this.preprocessImageForNF(this._currentFile);
    } catch (_) {}
    this.setStatus(true, 'Lendo documento...');
    const result = await Tesseract.recognize(fileParaOcr, 'por', {
      logger: (m) => {
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
    try {
      window.__ietebOcrText = result.data.text;
    } catch (_) {}
    this.parseAndShow(result.data.text);
  }

  async extrairDoPdf() {
    this.setStatus(true, 'Lendo PDF...');
    if (typeof pdfjsLib === 'undefined') {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    const arrayBuffer = await this._currentFile.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map((item) => item.str).join(' ') + '\n';
    }

    // Extrair data do texto do pdf.js mesmo se curto (antes de cair no OCR)
    const pdfNorm = fullText.replace(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})/g, '$1/$2/$3');
    const pdfDateMatch =
      pdfNorm.match(/\b(\d{2}\/\d{2}\/\d{4})\b/) ||
      pdfNorm.match(/\b(\d{4}-\d{2}-\d{2})\b/) ||
      pdfNorm.match(/\b(\d{2}\/\d{2}\/\d{2})\b/);
    let pdfDate = null;
    if (pdfDateMatch && pdfDateMatch[1]) {
      const raw = pdfDateMatch[1];
      const parts = raw.split('/');
      if (raw.includes('-')) {
        pdfDate = raw;
      } else if (parts.length === 3) {
        pdfDate =
          parts[2].length === 2
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
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 4.0 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;
    let minG = 255,
      maxG = 0;
    for (let i = 0; i < d.length; i += 4) {
      const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
      if (g < minG) minG = g;
      if (g > maxG) maxG = g;
    }
    const range = maxG - minG || 1;
    for (let i = 0; i < d.length; i += 4) {
      const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
      const bw = Math.round(((g - minG) / range) * 255) > 140 ? 255 : 0;
      d[i] = d[i + 1] = d[i + 2] = bw;
    }
    ctx.putImageData(imgData, 0, 0);

    if (typeof Tesseract === 'undefined') {
      await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
    }
    this.setStatus(true, 'Lendo documento...');
    const result = await Tesseract.recognize(canvas, 'por', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          const pct = Math.round((m.progress || 0) * 100);
          this.setStatus(true, `Lendo documento... ${pct}%`);
        }
      },
      tessedit_pageseg_mode: '4',
    });
    this.setStatus(false);
    try {
      window.__ietebOcrText = result.data.text;
    } catch (_) {}
    this.parseAndShow(result.data.text);
    // Fallback: se OCR não leu a data, usar a extraída do pdf.js
    if (!this.ocrExtracted.data && pdfDate) {
      this.ocrExtracted.data = pdfDate;
      document.querySelectorAll('#ocrSummarySaida .ocr-row').forEach((row) => {
        if (row.querySelector('.ocr-row-label').textContent === 'Data') {
          row.querySelector('.ocr-row-value').textContent = pdfDate;
        }
      });
    }
  }

  extractFields(text) {
    const result = {};
    const full = text;
    const lower = full.toLowerCase();
    const tipoDoc = this._detectarTipoDoc(lower);

    const _parseValor = (raw) => {
      const n = parseFloat(
        raw
          .trim()
          .replace(/\.(?=\d{3}(?:,|$))/g, '')
          .replace(',', '.')
      );
      return isNaN(n) ? null : n;
    };
    // Aceita números com OU sem milhar: 1.234,56 / 1234,56 / 1234.56 / 12,34
    const NUM_RE = '([0-9]{1,3}(?:[\\.\\s][0-9]{3})*[,\\.][0-9]{2})';

    // ── Valor ──────────────────────────────────────────────────────────
    // Padrões originais (NFC-e/NF-e) + adicionados para boleto, fatura,
    // recibo manual e NFS-e.
    const vMatch =
      full.match(new RegExp('valor\\s*[aà]?\\s*pagar[\\s\\S]{0,60}?' + NUM_RE, 'i')) ||
      full.match(
        new RegExp(
          'total\\s*(?:da\\s*)?(?:nota|nf[ae]?|geral|liquido|liq)\\b[\\s\\S]{0,40}?' + NUM_RE,
          'i'
        )
      ) ||
      full.match(new RegExp('valor\\s*(?:total|pago)[\\s\\S]{0,40}?' + NUM_RE, 'i')) ||
      // Adicionados:
      full.match(new RegExp('valor\\s+do\\s+documento[\\s\\S]{0,40}?' + NUM_RE, 'i')) || // boleto
      full.match(new RegExp('valor\\s+cobrado[\\s\\S]{0,40}?' + NUM_RE, 'i')) || // fatura
      full.match(new RegExp('import[âa]ncia\\s+(?:de\\s+)?r?\\$?[\\s\\S]{0,30}?' + NUM_RE, 'i')) || // recibo
      full.match(new RegExp('valor\\s+do\\s+servi[çc]o[\\s\\S]{0,40}?' + NUM_RE, 'i')) || // NFS-e
      full.match(new RegExp('valor\\s+l[ií]quido[\\s\\S]{0,40}?' + NUM_RE, 'i')) || // NFS-e
      full.match(new RegExp('total\\s+a\\s+pagar[\\s\\S]{0,80}?' + NUM_RE, 'i')) || // fatura
      full.match(new RegExp('total\\s*[\\s\\S]{0,40}?' + NUM_RE, 'i'));

    // Se nada bater, tenta o maior valor após "FORMA PAGAMENTO" (NFC-e)
    if (!vMatch) {
      const idx = lower.search(/forma\s*(?:de\s*)?pagamento/i);
      if (idx >= 0) {
        const trecho = full.slice(idx);
        const matches = [...trecho.matchAll(new RegExp(NUM_RE, 'g'))]
          .map((m) => _parseValor(m[1]))
          .filter((v) => v !== null && v > 1);
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
        .map((m) => _parseValor(m[1]))
        .filter((v) => v !== null && v > 1);
      if (todos.length) {
        const maior = Math.max(...todos);
        result.valor = 'R$ ' + maior.toFixed(2).replace('.', ',');
      }
    }

    // ── Data ───────────────────────────────────────────────────────────
    const _ocrDigitFix = (s) =>
      s
        .replace(/[Oo]/g, '0')
        .replace(/[QqDÇç]/g, '0')
        .replace(/[IiLl|!]/g, '1')
        .replace(/[Zz]/g, '2')
        .replace(/[BbßĐ]/g, '8')
        .replace(/[Ss]/g, '5')
        .replace(/[Gg]/g, '6');

    const normalized = full.replace(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})/g, '$1/$2/$3');

    let dataMatch =
      normalized.match(
        /data\s*(?:de|da)?\s*(?:autoriza[çc][aã]o|emiss[aã]o)[\s\S]{0,30}?(\d{2}\/\d{2}\/\d{4})/i
      ) ||
      normalized.match(/nfc-?e[\s\S]{0,90}?(\d{2}\/\d{2}\/\d{4})/i) ||
      normalized.match(/protocolo[\s\S]{0,80}?(\d{2}\/\d{2}\/\d{4})/i) ||
      null;

    if (!dataMatch) {
      const todas = [...normalized.matchAll(/\b(\d{2}\/\d{2}\/\d{4})\b/g)].map((m) => m[1]);
      if (todas.length) {
        const cnt = {};
        todas.forEach((d) => {
          cnt[d] = (cnt[d] || 0) + 1;
        });
        const escolhida = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
        dataMatch = [escolhida, escolhida];
      }
    }

    if (!dataMatch) {
      dataMatch =
        normalized.match(/\b(\d{4}-\d{2}-\d{2})\b/) ||
        normalized.match(/\b(\d{2}\/\d{2}\/\d{2})\b/);
    }

    if (!dataMatch) {
      const candidatos =
        full.match(
          /[0-9OoIiLlBbSsZzQqGg!|]{1,2}[\/\.\-][0-9OoIiLlBbSsZzQqGg!|]{1,2}[\/\.\-][0-9OoIiLlBbSsZzQqGg!|]{2,4}/g
        ) || [];
      for (const c of candidatos) {
        const fixed = _ocrDigitFix(c).replace(/[.\-]/g, '/');
        const m = fixed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
        if (m) {
          dataMatch = [c, fixed];
          break;
        }
      }
    }

    if (dataMatch && dataMatch[1]) {
      const raw = dataMatch[1];
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
    // NF-e/DANFE costuma ter HH:MM:SS (com segundos). Captura mas só
    // retornamos HH:MM no campo final.
    let horaMatch =
      full.match(/\d{2}\/\d{2}\/\d{4}[\sT,]+(\d{2}):(\d{2})(?::\d{2})?/) ||
      full.match(/\d{4}-\d{2}-\d{2}[\sT]+(\d{2}):(\d{2})(?::\d{2})?/) ||
      full.match(
        /(?:data\s*\/?\s*hora\s*(?:de|da)?\s*emiss[aã]o)[\s\S]{0,40}?(\d{2}):(\d{2})(?::\d{2})?/i
      ) ||
      full.match(/\b(\d{1,2})h(\d{2})\b/i) ||
      full.match(/[àa]s\s+(\d{1,2}):(\d{2})/i) ||
      full.match(/(?:hora|time)\s*[:\-]\s*(\d{1,2}):(\d{2})(?::\d{2})?/i) ||
      full.match(/\b((?:[01]\d|2[0-3])):([0-5]\d)(?::\d{2})?\b/);

    if (!horaMatch) {
      const cand = full.match(
        /[0-9OoIiLlBbSsZzQqGg!|]{1,2}[:hH][0-9OoIiLlBbSsZzQqGg!|]{2}(?:[:hH][0-9OoIiLlBbSsZzQqGg!|]{2})?/
      );
      if (cand) {
        const fixed = _ocrDigitFix(cand[0]).replace(/[hH]/g, ':');
        const m = fixed.match(/^(\d{1,2}):(\d{2})/);
        if (m) horaMatch = [cand[0], m[1], m[2]];
      }
    }

    if (horaMatch && horaMatch[1] && horaMatch[2]) {
      result.hora =
        String(horaMatch[1]).padStart(2, '0') + ':' + String(horaMatch[2]).padStart(2, '0');
    }

    // ── Fornecedor ─────────────────────────────────────────────────────
    {
      const _lines = full
        .split(/\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const _cnpjRe = /\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\s\/]?\d{4}[\s\-]?\d{2}/;

      const _looksLikeTitle = (s) =>
        /^(documento|docucuento|docu[a-z]*\s+aux|auxiliar|nf[ce]?(?:-?e)?\b|cupom\s+fiscal|consumidor|via\s+do|recibo|c[oó]digo|descri|qtde|forma\s*pagamento|valor|total|desconto|cart[aã]o|consulte|protocolo|chave\s+de\s+acesso|https?:|www\.)/i.test(
          s
        );
      const _looksLikeAddress = (s) =>
        /^(av\.?|avenida|rua|r\.|al\.?|alameda|tv\.?|travessa|rod\.?|rodovia|estrada|pra[cç]a|largo|lote|qd\.?|quadra)\b/i.test(
          s.trim()
        ) || /^[A-Za-zÀ-ÿ\s\.\,\-]{3,40}\d{2,5}\s*[\-,]/.test(s);
      const _hasLetters = (s) => /[A-Za-zÀ-ÿ]{3,}/.test(s);
      const _looksLikeName = (s) =>
        s.length >= 5 &&
        _hasLetters(s) &&
        !_looksLikeTitle(s) &&
        !_looksLikeAddress(s) &&
        !_cnpjRe.test(s) &&
        !/^\d/.test(s);

      const _cleanCandidate = (s) =>
        s
          .replace(
            /^\s*CN[PF]J\s*[:.]?\s*\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\s\/]?\d{4}[\s\-]?\d{2}\s*/i,
            ''
          )
          .replace(
            /\s*CN[PF]J\s*[:.]?\s*\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\s\/]?\d{4}[\s\-]?\d{2}\s*$/i,
            ''
          )
          .replace(/\s{2,}/g, ' ')
          .trim();

      let nome = null;

      // Estratégia 0: labels explícitos (independente de CNPJ)
      // Cobre NF-e (Emitente / Razão Social), NFS-e (Prestador),
      // boleto (Beneficiário / Cedente), fatura (Empresa Emissora).
      const labelMatches = [
        /(?:emitente|raz[aã]o\s+social|raz\.?\s*soc\.?)\s*[:\-]\s*([A-Za-zÀ-ÿ][^\n]{3,80})/i,
        /(?:prestador\s+(?:de\s+)?servi[çc]os?|prestador)\s*[:\-]\s*([A-Za-zÀ-ÿ][^\n]{3,80})/i,
        /(?:benefici[áa]rio|cedente)\s*[:\-]\s*([A-Za-zÀ-ÿ][^\n]{3,80})/i,
        /(?:empresa(?:\s+emissora)?|estabelecimento)\s*[:\-]\s*([A-Za-zÀ-ÿ][^\n]{3,80})/i,
      ];
      for (const re of labelMatches) {
        const m = full.match(re);
        if (m && m[1]) {
          // Corta antes do próximo CNPJ ou label inline
          const cand = _cleanCandidate(m[1])
            .split(/\s+(?:CN[PF]J|CPF|institui[çc][aã]o|banco\s)/i)[0]
            .trim();
          if (_looksLikeName(cand)) {
            nome = cand;
            break;
          }
        }
      }

      // PIX (especialmente para PF que não tem CNPJ): captura o nome do
      // recebedor a partir de Favorecido/Recebedor/Beneficiário.
      if (!nome) {
        const pixRecebedorMatches = [
          /(?:favorecido|recebedor)[\s\S]{0,80}?nome\s*[:\-]?\s*([A-Za-zÀ-ÿ][^\n]{3,80})/i,
          /(?:favorecido|recebedor|benefici[áa]rio)\s*[:\-]\s*([A-Za-zÀ-ÿ][^\n]{3,80})/i,
          /(?:para|destinat[áa]rio)\s*[:\-]?\s*\n+\s*([A-Za-zÀ-ÿ][^\n]{3,80})/i,
        ];
        for (const re of pixRecebedorMatches) {
          const m = full.match(re);
          if (m && m[1]) {
            const cand = _cleanCandidate(m[1])
              .split(/\s+(?:CN[PF]J|CPF|institui[çc][aã]o|banco\s|chave|ag[eê]ncia)/i)[0]
              .trim();
            if (_looksLikeName(cand)) {
              nome = cand;
              break;
            }
          }
        }
      }

      // Estratégia 1-3: bloco do CNPJ (lógica original)
      // ORDEM:
      //  a) Linha anterior ao CNPJ se terminar em LTDA/EIRELI/SA/ME/MEI/EPP
      //     (sinal forte de nome de empresa)
      //  b) Texto APÓS o CNPJ na mesma linha (caso Carrefour)
      //  c) Texto ANTES do CNPJ na mesma linha
      //  d) Linha anterior sem terminação corporativa (fallback)
      const _termCorp = /(?:LTDA|EIRELI|S[\/.]?A|ME|MEI|EPP)\s*\.?$/i;
      if (!nome) {
        for (let i = 0; i < Math.min(_lines.length, 15); i++) {
          const ln = _lines[i];
          if (!(_cnpjRe.test(ln) || /CN[PF]J/i.test(ln))) continue;

          // Coleta linha anterior "razoável" (até 3 linhas atrás)
          let prev = null;
          for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
            if (_looksLikeName(_lines[j])) {
              prev = _lines[j];
              break;
            }
          }

          // a) Linha anterior com terminação corporativa = sinal forte
          if (prev && _termCorp.test(prev)) {
            nome = prev;
            break;
          }

          // b) Texto APÓS o CNPJ na mesma linha (Carrefour)
          const after = ln.match(
            /(?:CN[PF]J\s*[:.]?\s*)?\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\s\/]?\d{4}[\s\-]?\d{2}\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 &.,'|-]{3,80})/i
          );
          if (after && after[1].trim().length >= 4) {
            const cand = _cleanCandidate(after[1]);
            if (_looksLikeName(cand)) {
              nome = cand;
              break;
            }
          }

          // c) Texto ANTES do CNPJ na mesma linha
          const before = ln.match(
            /^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 &.,'|-]{3,60}?)\s+(?:CN[PF]J|\d{2}[\.\s]?\d{3})/i
          );
          if (before && before[1].trim().length >= 4) {
            const cand = _cleanCandidate(before[1]);
            if (_looksLikeName(cand)) {
              nome = cand;
              break;
            }
          }

          // d) Linha anterior sem terminação corporativa (fallback)
          if (prev) {
            nome = prev;
            break;
          }
        }
      }

      if (!nome) {
        for (const l of _lines.slice(0, 10)) {
          if (
            /(?:LTDA|EIRELI|S[\/.]?A|ME|MEI|EPP)\s*\.?$/i.test(l) &&
            _hasLetters(l) &&
            !_looksLikeTitle(l) &&
            !_looksLikeAddress(l)
          ) {
            nome = l;
            break;
          }
        }
      }

      if (!nome) {
        for (const l of _lines.slice(0, 8)) {
          if (_looksLikeName(l)) {
            nome = l;
            break;
          }
        }
      }

      if (nome) {
        const n = _cleanCandidate(nome).replace(/^[\s|;"'(]+|[\s|;"')=]+$/g, '');
        if (n.length >= 3) result.fornecedor = toTitleCase(n);
      }
    }

    // ── Forma de pagamento ─────────────────────────────────────────────
    // "Crédito"/"Débito" sozinhos eram falsos positivos ("crédito ao
    // consumidor", "débito vencido"). Exigimos contexto explícito agora.
    const isCredito =
      /cart[aã]o\s+(?:de\s+)?cr[eé]dito/i.test(lower) ||
      /\b(?:no|em|via|pagto\.?|pagamento)\s+cr[eé]dito\b/i.test(lower) ||
      /cr[eé]dito\s*(?:[(\-]|visa|master|elo|amex|hipercard)/i.test(lower);
    const isDebito =
      /cart[aã]o\s+(?:de\s+)?d[eé]bito/i.test(lower) ||
      /\b(?:no|em|via|pagto\.?|pagamento)\s+d[eé]bito\b/i.test(lower) ||
      /d[eé]bito\s*(?:[(\-]|visa|master|elo|maestro)/i.test(lower);
    const isPix = /\bpix\b/i.test(lower);
    const isDinheiro = /\bdinheiro\b/i.test(lower);

    if (isCredito) result.formaPagamento = 'Crédito';
    else if (isDebito) result.formaPagamento = 'Débito';
    else if (isPix) result.formaPagamento = 'Pix';
    else if (isDinheiro) result.formaPagamento = 'Dinheiro';

    return result;
  }

  // Detecta o tipo do documento por palavras-chave. Usado para priorizar
  // certas regex e ativar buscas específicas (ex: PIX para PF não tem CNPJ
  // e usa "Favorecido"; boleto usa "Cedente"; NFS-e usa "Prestador").
  _detectarTipoDoc(lower) {
    if (/nfc-?e\b|cupom\s+fiscal/.test(lower)) return 'nfce';
    if (/nfs-?e\b|nota\s+fiscal\s+(?:de\s+)?servi/.test(lower)) return 'nfse';
    if (/\bnf-?e\b|danfe|nota\s+fiscal\s+eletr/.test(lower)) return 'nfe';
    if (
      /boleto|c[oó]digo\s+de\s+barras|linha\s+digit[áa]vel|cedente|sacado|nosso\s+n[uú]mero/.test(
        lower
      )
    )
      {return 'boleto';}
    if (
      /comprovante\s+de\s+pix|pix\s+(?:enviado|pago|recebido|transferido)|chave\s+pix/.test(lower)
    )
      {return 'pix';}
    if (/\brecibo\b|recebi\s+de|import[âa]ncia\s+de/.test(lower)) return 'recibo';
    if (/\bfatura\b|nota\s+promiss/.test(lower)) return 'fatura';
    return 'generico';
  }

  // Heurística: avalia se o fornecedor extraído tem cara de nome de
  // empresa (rejeita lixo de OCR como "Nannn—— ——*", "AAAAAAAA", "—").
  _fornecedorParecValido(nome) {
    if (!nome) return false;
    const t = String(nome).trim();
    if (t.length < 4 || t.length > 80) return false;

    const letras = t.replace(/[^A-Za-zÀ-ÿ]/g, '');
    if (letras.length < 4) return false;

    const palavras = t.split(/\s+/).filter((w) => /[A-Za-zÀ-ÿ]{3,}/.test(w));
    if (palavras.length < 1) return false;

    if (/[^\w\s.,'&\-À-ÿ/()]{2,}/.test(t)) return false;
    if (/([A-Za-zÀ-ÿ])\1{3,}/i.test(t)) return false;

    const semEspaco = t.replace(/\s/g, '');
    const naoLetras = semEspaco.length - letras.length;
    if (naoLetras / semEspaco.length > 0.5) return false;

    return true;
  }

  parseAndShow(text) {
    const extracted = this.extractFields(text);
    this.ocrExtracted = extracted;

    if (!this._fornecedorParecValido(extracted.fornecedor)) {
      delete extracted.fornecedor;
      this.ocrExtracted = extracted;
    }
    const sinais =
      (extracted.fornecedor ? 1 : 0) + (extracted.valor ? 1 : 0) + (extracted.data ? 1 : 0);

    if (sinais < 2) {
      this.modal.showToast(
        'Não foi possível identificar este documento como nota fiscal. Verifique se o arquivo é uma imagem ou PDF de uma NF/cupom válido.',
        'error'
      );
      if (this._saidaPage) this._saidaPage.removeFile();
      return;
    }

    const labels = { fornecedor: 'Fornecedor', valor: 'Valor', data: 'Data', hora: 'Hora' };
    document.getElementById('ocrSummarySaida').innerHTML = Object.keys(labels)
      .map(
        (k) =>
          `<div class="ocr-row">
        <span class="ocr-row-label">${labels[k]}</span>
        <span class="ocr-row-value">${escHtml(extracted[k] || '—')}</span>
      </div>`
      )
      .join('');

    this.modal.open('ocrModalSaida');
  }
}
