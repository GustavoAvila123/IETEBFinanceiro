
class OCREntradas {
  constructor(modal) {
    this.modal        = modal;
    this.ocrExtracted = {};
    this._entradaPage = null; // set after EntradaPage is created
  }

  setEntradaPage(page) { this._entradaPage = page; }

  setStatus(show, text) {
    const el = document.getElementById('ocrStatus');
    el.style.display = show ? 'flex' : 'none';
    if (text) document.getElementById('ocrStatusText').textContent = text;
  }

  async lerComprovante(currentFile) {
    if (!currentFile) return;
    this.setStatus(true, 'Carregando arquivo...');
    try {
      if (currentFile.type === 'application/pdf') {
        await this.extrairDoPdf(currentFile);
      } else {
        await this.extrairDaImagem(currentFile);
      }
    } catch (err) {
      this.setStatus(false);
      this.modal.showToast('Não foi possível ler o comprovante. Preencha manualmente.', 'error');
      console.error(err);
    }
  }

  async preprocessImageForOcr(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img load error')); };
      img.onload  = () => {
        URL.revokeObjectURL(url);
        try {
          const maxSide = Math.max(img.width, img.height);
          const scale   = maxSide < 2000 ? 2000 / maxSide : 1;
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
            let gray;
            if (r > g + 20 && r > b + 15 && r > 130) {
              gray = 255;
            } else {
              gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
            }
            gray = Math.min(255, Math.max(0, (gray - 128) * 1.8 + 128));
            d[i] = d[i + 1] = d[i + 2] = gray;
          }
          ctx.putImageData(imageData, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } catch (err) { reject(err); }
      };
      img.src = url;
    });
  }

  async extrairDaImagem(currentFile) {
    this.setStatus(true, 'Iniciando reconhecimento de texto...');
    if (typeof Tesseract === 'undefined') {
      await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
    }
    this.setStatus(true, 'Processando imagem...');
    let fileParaOcr = currentFile;
    try {
      fileParaOcr = await this.preprocessImageForOcr(currentFile);
    } catch (e) {
      console.warn('[OCR] Pré-processamento falhou, usando imagem original:', e);
    }
    this.setStatus(true, 'Lendo o comprovante (pode levar alguns segundos)...');
    const result = await Tesseract.recognize(fileParaOcr, 'por', {
      logger: m => {
        if (m.status === 'recognizing text') {
          const pct = Math.round((m.progress || 0) * 100);
          this.setStatus(true, `Lendo comprovante... ${pct}%`);
        }
      }
    });
    this.setStatus(false);
    this.parseAndShow(result.data.text);
  }

  async extrairDoPdf(currentFile) {
    this.setStatus(true, 'Lendo PDF...');
    if (typeof pdfjsLib === 'undefined') {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    const arrayBuffer = await currentFile.arrayBuffer();
    const pdf         = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let   fullText    = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map(item => item.str).join(' ') + '\n';
    }
    this.setStatus(false);
    this.parseAndShow(fullText);
  }

  parseAndShow(text) {
    console.log('[OCR] Texto bruto extraído:\n', text);
    const extracted = this.extractFields(text);
    console.log('[OCR] Campos extraídos:', extracted);
    this.ocrExtracted = extracted;

    const fp          = extracted.formaPagamento || document.getElementById('formaPagamento').value;
    const isCredito   = fp === 'Crédito';
    const isDinheiro  = fp === 'Dinheiro';

    const labels = {
      nomeAluno:        'Nome do Aluno',
      nomeDepositante:  isCredito ? 'Nome da Loja'      : 'Depositante',
      nomeRecebedor:    isCredito ? 'Maquininha'         : 'Quem Recebeu',
      bancoDepositante: 'Banco Depositante',
      bancoRecebedor:   'Banco Recebedor',
      valor:            'Valor',
      data:             isCredito ? 'Data da Transação' : isDinheiro ? 'Data do Pagamento' : 'Data',
      hora:             isCredito ? 'Hora da Transação' : isDinheiro ? 'Hora do Pagamento' : 'Hora',
      formaPagamento:   'Forma de Pagamento',
    };

    const camposVisiveis = isCredito
      ? ['nomeAluno','nomeDepositante','nomeRecebedor','valor','data','hora','formaPagamento']
      : Object.keys(labels);

    document.getElementById('ocrSummary').innerHTML = camposVisiveis.map(k =>
      `<div class="ocr-row">
        <span class="ocr-row-label">${labels[k]}</span>
        <span class="ocr-row-value">${escHtml(extracted[k] || '—')}</span>
      </div>`
    ).join('');

    this.modal.open('ocrModal');
  }

  extractFields(text) {
    const result = {};
    const full   = text;
    const lower  = full.toLowerCase();

    const valorMatch = full.match(/R\$\s*([\d.,]+)/i);
    if (valorMatch) result.valor = 'R$ ' + valorMatch[1].trim();

    const dataMatch =
      full.match(/(?:segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)[,.]?\s*(\d{2}\/\d{2}\/\d{4})/i) ||
      full.match(/data\s+(?:do\s+)?(?:pagamento|dep[oó]sito)?\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i) ||
      full.match(/\b(\d{2}\/\d{2}\/\d{4})\b/) ||
      full.match(/\b(\d{4}-\d{2}-\d{2})\b/)   ||
      full.match(/\b(\d{2}\/\d{2}\/\d{2})\b/);
    if (dataMatch && dataMatch[1]) {
      const raw = dataMatch[1];
      if (raw.includes('-')) {
        result.data = raw;
      } else {
        const parts = raw.split('/');
        result.data = parts[2].length === 2
          ? `20${parts[2]}-${parts[1]}-${parts[0]}`
          : `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }

    const horaMatch =
      full.match(/hor[aá]rio\s+(\d{1,2})h(\d{2})/i)                 ||
      full.match(/hor[aá]rio\s*[:\-]\s*(\d{1,2}):(\d{2})/i)         ||
      full.match(/\b(\d{1,2})h(\d{2})\b/i)                          ||
      full.match(/[àa]s\s+(\d{1,2}):(\d{2})/i)                      ||
      full.match(/\d{2}\/\d{2}\/\d{4}[T\s,]+(\d{2}):(\d{2})/)       ||
      full.match(/\d{4}-\d{2}-\d{2}[T\s]+(\d{2}):(\d{2})/)          ||
      full.match(/(?:hora|time)\s*[:\-]\s*(\d{1,2}):(\d{2})/i);
    if (horaMatch && horaMatch[1] && horaMatch[2]) {
      result.hora = String(horaMatch[1]).padStart(2, '0') + ':' + String(horaMatch[2]).padStart(2, '0');
    }

    if      (lower.includes('pix'))                                   result.formaPagamento = 'Pix';
    else if (lower.includes('débito') || lower.includes('debito'))    result.formaPagamento = 'Débito';
    else if (lower.includes('crédito') || lower.includes('credito'))  result.formaPagamento = 'Crédito';
    else if (lower.includes('dinheiro'))                              result.formaPagamento = 'Dinheiro';

    const MAQUININHA_BRANDS = [
      ['Laranjinha',  /laranjinha|graninha|[lf]?aran[ij]+inha/i],
      ['Stone',       /\bstone\b/i],
      ['Cielo',       /\bcielo\b/i],
      ['Rede',        /\brede\b/i],
      ['PagSeguro',   /pagseguro/i],
      ['Getnet',      /getnet/i],
      ['SumUp',       /sumup/i],
      ['InfinitePay', /infinitepay/i],
      ['Moderninha',  /moderninha/i],
      ['Ton',         /\bton\b/i],
    ];

    const lojaLineMatch =
      full.match(/([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 &.,'"|-]{1,50})\s+(?:CNPJ|CNPI|CNPE)\s*[:.]?\s*\d/i) ||
      full.match(/([A-Z][A-Z0-9 &.,'-]{2,50})\s*\n[\s\S]{0,80}?(?:CNPJ|CNPI)/im);
    if (lojaLineMatch && lojaLineMatch[1]) {
      const loja     = lojaLineMatch[1].trim().replace(/^[\s|;"'(]+|[\s|;"')=]+$/g, '');
      const isBrand  = MAQUININHA_BRANDS.some(([, re]) => re.test(loja));
      if (!isBrand && loja.length >= 2) result.nomeDepositante = toTitleCase(loja);
    }

    const brandEntry = MAQUININHA_BRANDS.find(([, re]) => re.test(full));
    if (brandEntry) {
      result.nomeRecebedor  = brandEntry[0];
      result.formaPagamento = result.formaPagamento || 'Crédito';
    }

    const NOME_PAT       = '((?:[A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇ][A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇa-záéíóúàâêôãõüç]* ?){2,9})';
    const NOME_PAT_LOOSE = '((?:[A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇ][A-Za-záéíóúàâêôãõüç]* ?){2,9})';

    const blocoPagou =
      full.match(new RegExp(`quem\\s+pagou[\\s\\S]{0,300}?nome\\s+${NOME_PAT}`, 'i')) ||
      full.match(new RegExp(`pagador[\\s\\S]{0,150}?nome\\s*[:\\-]?\\s*${NOME_PAT_LOOSE}`, 'i')) ||
      full.match(new RegExp(`(?:origem|remetente)[\\s\\S]{0,150}?nome\\s*[:\\-]?\\s*${NOME_PAT_LOOSE}`, 'i')) ||
      full.match(new RegExp(`\\bde\\s*[:\\-]?\\s*\\n+\\s*${NOME_PAT}`, 'i')) ||
      full.match(new RegExp(`remetente\\s*[:\\-]\\s*${NOME_PAT_LOOSE}`, 'i')) ||
      full.match(new RegExp(`enviado\\s+por\\s*[:\\-]?\\s*${NOME_PAT_LOOSE}`, 'i')) ||
      full.match(new RegExp(`pago\\s+por\\s*[:\\-]?\\s*${NOME_PAT_LOOSE}`, 'i'));
    if (blocoPagou && blocoPagou[1]) {
      const nome = toTitleCase(blocoPagou[1].trim().replace(/\s{2,}/g, ' '));
      result.nomeAluno       = nome;
      result.nomeDepositante = nome;
    }

    const instPagouMatch =
      full.match(/quem\s+pagou[\s\S]{0,400}?institui[çc][aã]o\s+([\wÀ-ÿ .,-]{3,40})/i) ||
      full.match(/\bde\b[\s\S]{0,250}?institui[çc][aã]o\s*[:\-]?\s*([\wÀ-ÿ .,-]{3,40})/i)  ||
      full.match(/pagador[\s\S]{0,200}?(?:banco|institui[çc][aã]o)\s*[:\-]?\s*([\wÀ-ÿ .,-]{3,30})/i) ||
      full.match(/(?:origem|remetente)[\s\S]{0,200}?(?:banco|institui[çc][aã]o)\s*[:\-]?\s*([\wÀ-ÿ .,-]{3,30})/i);
    if (instPagouMatch && instPagouMatch[1]) {
      result.bancoDepositante = this.normalizarBanco(instPagouMatch[1].trim());
    }

    const blocoRecebeu =
      full.match(new RegExp(`quem\\s+recebeu[\\s\\S]{0,300}?nome\\s+${NOME_PAT}`, 'i')) ||
      full.match(new RegExp(`favorecido[\\s\\S]{0,150}?nome\\s*[:\\-]?\\s*${NOME_PAT_LOOSE}`, 'i')) ||
      full.match(new RegExp(`benefici[aá]rio[\\s\\S]{0,150}?nome\\s*[:\\-]?\\s*${NOME_PAT_LOOSE}`, 'i')) ||
      full.match(new RegExp(`destinat[aá]rio[\\s\\S]{0,150}?nome\\s*[:\\-]?\\s*${NOME_PAT_LOOSE}`, 'i')) ||
      full.match(new RegExp(`\\bpara\\s*[:\\-]?\\s*\\n+\\s*${NOME_PAT}`, 'i')) ||
      full.match(new RegExp(`favorecido\\s*[:\\-]\\s*${NOME_PAT_LOOSE}`, 'i')) ||
      full.match(new RegExp(`benefici[aá]rio\\s*[:\\-]\\s*${NOME_PAT_LOOSE}`, 'i'));
    if (blocoRecebeu && blocoRecebeu[1]) {
      result.nomeRecebedor = toTitleCase(blocoRecebeu[1].trim().replace(/\s{2,}/g, ' '));
    }

    const instRecebeuMatch =
      full.match(/quem\s+recebeu[\s\S]{0,400}?institui[çc][aã]o\s+([\wÀ-ÿ .,-]{3,40})/i) ||
      full.match(/\bpara\b[\s\S]{0,250}?institui[çc][aã]o\s*[:\-]?\s*([\wÀ-ÿ .,-]{3,40})/i) ||
      full.match(/favorecido[\s\S]{0,200}?(?:banco|institui[çc][aã]o)\s*[:\-]?\s*([\wÀ-ÿ .,-]{3,30})/i) ||
      full.match(/benefici[aá]rio[\s\S]{0,200}?(?:banco|institui[çc][aã]o)\s*[:\-]?\s*([\wÀ-ÿ .,-]{3,30})/i) ||
      full.match(/destinat[aá]rio[\s\S]{0,200}?(?:banco|institui[çc][aã]o)\s*[:\-]?\s*([\wÀ-ÿ .,-]{3,30})/i);
    if (instRecebeuMatch && instRecebeuMatch[1]) {
      result.bancoRecebedor = this.normalizarBanco(instRecebeuMatch[1].trim());
    }

    if (!result.bancoDepositante || !result.bancoRecebedor) {
      const bancos = [
        ['Inter',           /\bbanco\s+inter\b|\binter\s+s\.?a\.?\b/i],
        ['Nubank',          /nubank/i],
        ['Itaú',            /ita[uú]/i],
        ['Bradesco',        /bradesco/i],
        ['Caixa',           /caixa\s+econ/i],
        ['Banco do Brasil', /banco\s+do\s+brasil|\bBB\b/i],
        ['Santander',       /santander/i],
        ['C6',              /c6\s+bank/i],
        ['PicPay',          /picpay/i],
        ['Mercado Pago',    /mercado\s+pago/i],
        ['Sicoob',          /sicoob/i],
        ['Sicredi',         /sicredi/i],
        ['BTG',             /btg\s+pactual/i],
        ['Neon',            /neon/i],
      ];
      for (const [nome, re] of bancos) {
        if (re.test(full)) {
          if      (!result.bancoDepositante)                                    result.bancoDepositante = nome;
          else if (!result.bancoRecebedor && result.bancoDepositante !== nome)  result.bancoRecebedor   = nome;
        }
      }
    }

    return result;
  }

  normalizarBanco(str) {
    const mapa = [
      [/inter/i,    'Inter'],    [/bradesco/i,  'Bradesco'],
      [/ita[uú]/i,  'Itaú'],    [/nubank/i,    'Nubank'],
      [/caixa/i,    'Caixa'],   [/brasil/i,    'Banco do Brasil'],
      [/santander/i,'Santander'],[/c6/i,        'C6'],
      [/picpay/i,   'PicPay'],  [/mercado/i,   'Mercado Pago'],
      [/sicoob/i,   'Sicoob'],  [/sicredi/i,   'Sicredi'],
      [/btg/i,      'BTG'],     [/neon/i,      'Neon'],
      [/next/i,     'Next'],    [/original/i,  'Original'],
    ];
    for (const [re, nome] of mapa) if (re.test(str)) return nome;
    return str;
  }

  confirmar() {
    this.modal.close('ocrModal');
    const extracted = this.ocrExtracted;
    const clearErr = id => { const el = document.getElementById(id); if (el) el.textContent = ''; };
    if (extracted.nomeAluno) {
      const firstRow = document.querySelector('#alunosContainer .aluno-row');
      if (firstRow) {
        const el = document.getElementById(`alunoNome_${firstRow.dataset.alunoId}`);
        if (el) { el.value = extracted.nomeAluno; clearErr(`alunoNomeError_${firstRow.dataset.alunoId}`); }
      }
    }
    if (extracted.nomeDepositante)  { setInput('nomeDepositante',  extracted.nomeDepositante);           clearErr('nomeDepositanteError');  }
    if (extracted.nomeRecebedor)    { setInput('nomeRecebedor',    extracted.nomeRecebedor);             clearErr('nomeRecebedorError');    }
    if (extracted.bancoDepositante) { setInput('bancoDepositante', extracted.bancoDepositante);          clearErr('bancoDepositanteError'); }
    if (extracted.bancoRecebedor)   { setInput('bancoRecebedor',   extracted.bancoRecebedor);            clearErr('bancoRecebedorError');   }
    if (extracted.data)             { setInput('dataDeposito',     isoToDateInput(extracted.data));      clearErr('dataError');             }
    if (extracted.hora)               setInput('horaDeposito',     extracted.hora);
    if (extracted.valor)            { document.getElementById('valorEntrada').value = extracted.valor.replace('R$ ', ''); clearErr('valorError'); }
    if (extracted.formaPagamento && this._entradaPage) {
      document.querySelectorAll('#paymentTypes .payment-btn').forEach(btn => {
        if (btn.dataset.value === extracted.formaPagamento) this._entradaPage.selectPayment(btn);
      });
    }
    if (this._entradaPage) this._entradaPage.switchTab('manual');
    this.modal.showToast('Formulário preenchido! Revise os dados e salve.', 'success');
  }

  closeModal() { this.modal.close('ocrModal'); }
}
