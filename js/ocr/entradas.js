class OCREntradas {
  constructor(modal) {
    this.modal = modal;
    this.ocrExtracted = {};
    this._entradaPage = null; // set after EntradaPage is created
  }

  setEntradaPage(page) {
    this._entradaPage = page;
  }

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

  async preprocessImageForOcr(file, maxTarget) {
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
          const maxSide = Math.max(img.width, img.height);
          // Padrão: só upscale se imagem muito pequena. Quando maxTarget
          // é passado, força esse tamanho — usado no 2º pass pra
          // shrink texto MUITO grande (R$ 200 do Mercado Pago) até um
          // tamanho que o Tesseract reconhece bem (~30-60px de altura).
          const scale = maxTarget ? maxTarget / maxSide : maxSide < 2000 ? 2000 / maxSide : 1;
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const d = imageData.data;
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i],
              g = d[i + 1],
              b = d[i + 2];
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
        } catch (err) {
          reject(err);
        }
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
      logger: (m) => {
        if (m.status === 'recognizing text') {
          const pct = Math.round((m.progress || 0) * 100);
          this.setStatus(true, `Lendo comprovante... ${pct}%`);
        }
      },
    });
    let text = result.data.text;

    // Comprovantes como Mercado Pago renderizam o "R$ 200" em fonte
    // gigante. O PSM 3 (padrão, auto) costuma tratar texto muito
    // grande como gráfico e pular a linha inteira. Se não achamos
    // nenhuma marca de "R$" na 1ª passada, fazemos uma 2ª com PSM 11
    // (sparse text) — agressivo em encontrar texto isolado de
    // qualquer tamanho. Só roda quando precisa, pra não dobrar o
    // tempo no caso normal.
    const semRS = !/\bR\s*[\$Ss5%#&8B]?\s*\d/i.test(text);
    if (semRS) {
      try {
        this.setStatus(true, 'Refazendo leitura para texto grande...');
        // Imagem reduzida pra ~1000px no maior lado. O "R$ 200" gigante
        // vira um número de ~60-80px, que o Tesseract reconhece bem.
        let fileSmall = fileParaOcr;
        try {
          fileSmall = await this.preprocessImageForOcr(currentFile, 1000);
        } catch (e) {
          console.warn('[OCR] Downscale falhou:', e);
        }

        const worker = await Tesseract.createWorker('por');
        try {
          await worker.setParameters({ tessedit_pageseg_mode: '11' });
          const r2 = await worker.recognize(fileSmall);
          text = text + '\n\n' + (r2.data.text || '');
        } finally {
          await worker.terminate();
        }
      } catch (e) {
        console.warn('[OCR] 2º pass (PSM 11) falhou:', e);
      }
    }

    this.setStatus(false);
    this.parseAndShow(text);
  }

  async extrairDoPdf(currentFile) {
    this.setStatus(true, 'Lendo PDF...');
    if (typeof pdfjsLib === 'undefined') {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    const arrayBuffer = await currentFile.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map((item) => item.str).join(' ') + '\n';
    }
    this.setStatus(false);
    this.parseAndShow(fullText);
  }

  parseAndShow(text) {
    const extracted = this.extractFields(text);
    this.ocrExtracted = extracted;

    // Heurística: se nenhum dos campos chave foi reconhecido, o arquivo
    // provavelmente não é um comprovante válido. Avisa e cancela o fluxo.
    const camposChave = [
      'valor',
      'data',
      'formaPagamento',
      'nomeDepositante',
      'nomeRecebedor',
      'bancoDepositante',
      'bancoRecebedor',
    ];
    const reconhecido = camposChave.some((k) => !!extracted[k]);
    if (!reconhecido) {
      this.modal.showToast(
        'Não foi possível identificar este documento como comprovante. Verifique se o arquivo é uma imagem ou PDF de um comprovante válido.',
        'error'
      );
      if (this._entradaPage && typeof this._entradaPage.removeFile === 'function') {
        this._entradaPage.removeFile();
      }
      return;
    }

    const fp = extracted.formaPagamento || document.getElementById('formaPagamento').value;
    const isCredito = fp === 'Crédito';
    const isDinheiro = fp === 'Dinheiro';

    const labels = {
      nomeAluno: 'Nome do Aluno',
      nomeDepositante: isCredito ? 'Nome da Loja' : 'Depositante',
      nomeRecebedor: isCredito ? 'Bandeira' : 'Quem Recebeu',
      bancoDepositante: 'Banco Depositante',
      bancoRecebedor: 'Banco Recebedor',
      valor: 'Valor',
      data: isCredito ? 'Data da Transação' : isDinheiro ? 'Data do Pagamento' : 'Data',
      hora: isCredito ? 'Hora da Transação' : isDinheiro ? 'Hora do Pagamento' : 'Hora',
      formaPagamento: 'Forma de Pagamento',
    };

    const camposVisiveis = isCredito
      ? ['nomeAluno', 'nomeDepositante', 'nomeRecebedor', 'valor', 'data', 'hora', 'formaPagamento']
      : Object.keys(labels);

    document.getElementById('ocrSummary').innerHTML = camposVisiveis
      .map(
        (k) =>
          `<div class="ocr-row">
        <span class="ocr-row-label">${labels[k]}</span>
        <span class="ocr-row-value">${escHtml(extracted[k] || '—')}</span>
      </div>`
      )
      .join('');

    this.modal.open('ocrModal');
  }

  extractFields(text) {
    const result = {};
    const full = text;
    const lower = full.toLowerCase();

    // ── Valor ──────────────────────────────────────────────────────────
    // Bancos como Inter/Nubank/Itaú novo mostram o "Saldo disponível"
    // ANTES do valor da transação. Pegar o primeiro R$ que aparecer
    // resultava no saldo no lugar do valor real.
    //
    // Estratégia em ordem de prioridade:
    //   1) Valor próximo de palavra-chave do PIX (valor, transferência,
    //      pix enviado/recebido, pagamento)
    //   2) Primeiro R$ que NÃO esteja precedido por saldo/tarifa/limite
    //   3) Fallback: primeiro R$ (compat com versão original)
    const NUM_RE = '([0-9]{1,3}(?:[\\.\\s][0-9]{3})*[,\\.][0-9]{2})';
    const _parseV = (raw) => {
      const n = parseFloat(
        String(raw)
          .trim()
          .replace(/\.(?=\d{3}(?:,|$))/g, '')
          .replace(',', '.')
      );
      return isNaN(n) ? null : n;
    };

    const vMatch =
      full.match(new RegExp('valor[\\s\\S]{0,40}?R?\\$?\\s*' + NUM_RE, 'i')) ||
      // Para palavras-chave de transação, exige R$ literal — evita capturar
      // dígitos de CNPJ/CPF que apareçam logo após "Pix Enviado" no layout
      // do BB (onde o valor real está ANTES da palavra-chave).
      full.match(
        new RegExp(
          '(?:transferência|transferencia|pix\\s+(?:enviado|recebido|pago|transferido)|pagamento\\s+realizado)[\\s\\S]{0,80}?R\\$\\s*' +
            NUM_RE,
          'i'
        )
      );
    if (vMatch) {
      const n = _parseV(vMatch[1]);
      if (n && n > 0) result.valor = 'R$ ' + n.toFixed(2).replace('.', ',');
    }

    if (!result.valor) {
      // Pega o primeiro R$ que NÃO seja saldo / tarifa / limite / disponível
      const allMatches = [...full.matchAll(/(.{0,30})R\$\s*([\d.,]+)/gi)];
      for (const m of allMatches) {
        const contexto = (m[1] || '').toLowerCase();
        if (/saldo|tarifa|limite|dispon[ií]vel|cr[eé]dito\s+conce/.test(contexto)) continue;
        const v = _parseV(m[2]);
        if (v && v > 0) {
          result.valor = 'R$ ' + m[2].trim();
          break;
        }
      }
    }

    if (!result.valor) {
      // Último recurso: comportamento original
      const m = full.match(/R\$\s*([\d.,]+)/i);
      if (m) result.valor = 'R$ ' + m[1].trim();
    }

    if (!result.valor) {
      // OCR tolerante: o Tesseract pode ler o "$" como "S", "5", "#",
      // "%", "&", "8", "B" — ou perdê-lo de vez (sobrando só "R 200").
      // Casa apenas LINHA INTEIRA começando com R + símbolo/espaço + número.
      const reTolerant =
        /^[\s>•·●○◯|]*R(?:[\$Ss5%#&8B]\s*|\s+)([\dOo][\dOo.,\s]{0,14})\s*\.?\s*$/gim;
      for (const m of full.matchAll(reTolerant)) {
        const raw = m[1].trim().replace(/[Oo]/g, '0').replace(/\s+/g, '');
        const v = _parseV(raw);
        if (v && v > 0) {
          result.valor = 'R$ ' + raw;
          break;
        }
      }
    }

    if (!result.valor) {
      // Heurística agressiva (último recurso real): percorre as primeiras
      // linhas curtas do documento procurando algo que pareça valor
      // monetário, filtrando CPF/CNPJ/data/hora/ID/agência/conta/CEP.
      // Cobre o caso onde o OCR degradou o "R$" a ponto de nenhuma
      // âncora textual sobreviver — mas o número do valor ainda está lá.
      // Adicionados "banco", "institui[çc][aã]o" e sufixos jurídicos
      // pra evitar capturar "6" de "BANCO C6 S.A." como valor.
      const skipKw =
        /banco|institui[çc][aã]o|\bs\.?\s*a\.?\b|\bltda\b|\beireli\b|\bme\b|CPF|CNPJ|ag[eê]ncia|\bconta\b|\bid\b|transa[çc][aã]o|telefone|\bfone\b|c[eé]p|c[oó]digo|aut[eê]nti|0800|chave|atendimento|ouvidoria/i;
      const lines = full.split(/\r?\n/);
      const max = Math.min(lines.length, 25);
      for (let i = 0; i < max; i++) {
        const t = lines[i].trim();
        if (!t || t.length > 40) continue;
        if (skipKw.test(t)) continue;
        // CPF mascarado/completo: 3+3+3-2 (com asteriscos ou dígitos)
        if (/[\d*]{3}\s*\.\s*[\d*]{3}\s*\.\s*[\d*]{3}\s*-\s*[\d*]{2}/.test(t)) continue;

        const candidates = t.matchAll(/(\d{1,3}(?:[.\s]\d{3})*[,.]\d{2}|\d{1,7})/g);
        for (const c of candidates) {
          const raw = c[1].replace(/\s+/g, '');
          const digits = raw.replace(/[.,]/g, '');
          if (digits.length === 0 || digits.length >= 8) continue;
          // 1 dígito sozinho ("C6", "S2") é quase sempre código, não valor.
          // Pix de R$ 5 inteiros sem ",00" é caso limite aceitável.
          if (digits.length < 2) continue;
          // 4+ dígitos sem separador é provável código (agência/conta/ID)
          if (digits.length >= 4 && !/[.,]/.test(raw)) continue;

          const start = c.index;
          const before = t.slice(Math.max(0, start - 4), start);
          const after = t.slice(start + c[0].length, start + c[0].length + 4);
          // Vizinhança que indica data, ID, telefone, hora, máscara CPF.
          // "3/maio" — o "3" tem "/" em after mas não dígito depois;
          // por isso testamos `^[\/\-]` (qualquer / ou - logo após).
          if (/[\/\-]/.test(before)) continue;
          if (/^[\/\-]/.test(after)) continue;
          if (/\*/.test(before) || /\*/.test(after)) continue;
          if (/^[hH:]/.test(after)) continue;
          if (/[hH:]$/.test(before)) continue;

          const v = _parseV(raw);
          if (!v || v <= 0 || v > 1_000_000) continue;

          result.valor = 'R$ ' + raw;
          break;
        }
        if (result.valor) break;
      }
    }

    // Normaliza para formato BR completo "R$ X,XX". Se o OCR capturou
    // "R$ 200" sem centavos (ex.: Mercado Pago), completa com ",00".
    if (result.valor) {
      const numStr = result.valor.replace(/^R\$?\s*/i, '').trim();
      if (!/[,.]\d{2}$/.test(numStr)) {
        result.valor = 'R$ ' + numStr + ',00';
      }
    }

    // Data com nome do mês: "3/maio/2026", "3 de maio de 2026", "03-mai-2026"
    const MESES_NOME = {
      janeiro: '01',
      jan: '01',
      fevereiro: '02',
      fev: '02',
      marco: '03',
      mar: '03',
      abril: '04',
      abr: '04',
      maio: '05',
      mai: '05',
      junho: '06',
      jun: '06',
      julho: '07',
      jul: '07',
      agosto: '08',
      ago: '08',
      setembro: '09',
      set: '09',
      outubro: '10',
      out: '10',
      novembro: '11',
      nov: '11',
      dezembro: '12',
      dez: '12',
    };
    const dataNomeMes = full.match(
      /\b(\d{1,2})\s*(?:[\/\-]|\sde\s)\s*(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\s*(?:[\/\-]|\sde\s)\s*(\d{4})\b/i
    );
    if (dataNomeMes) {
      const dia = String(dataNomeMes[1]).padStart(2, '0');
      const mesKey = dataNomeMes[2].toLowerCase().replace('ç', 'c');
      const mes = MESES_NOME[mesKey];
      if (mes) result.data = `${dataNomeMes[3]}-${mes}-${dia}`;
    }

    if (!result.data) {
      const dataMatch =
        // Aceita nome completo ou abreviado, com/sem "-feira" e com/sem ponto
        full.match(
          /(?:segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|seg|ter|qua|qui|sex|s[áa]b|dom)\.?\s*(?:-?\s*feira)?[,.]?\s*(\d{2}\/\d{2}\/\d{4})/i
        ) ||
        full.match(
          /data\s+(?:do\s+)?(?:pagamento|dep[oó]sito|pix|transfer[eê]ncia)?\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i
        ) ||
        full.match(/\b(\d{2}\/\d{2}\/\d{4})\b/) ||
        full.match(/\b(\d{4}-\d{2}-\d{2})\b/) ||
        full.match(/\b(\d{2}\/\d{2}\/\d{2})\b/) ||
        // Tolerante a OCR ruim: separadores podem ser ` `, `.`, `-`, `:`
        // ou nada (cupom Cielo "09 05 26", "09.05.26", "09-05-26").
        // Aceita 1-2 dígitos no dia/mês e 2 ou 4 no ano.
        full.match(/\b(\d{1,2})[\s\.\-\/](\d{1,2})[\s\.\-\/](\d{2}|\d{4})\b/);
      if (dataMatch && dataMatch[1]) {
        // 2 formatos: dataMatch[1] tem a string completa (\d{2}\/\d{2}\/...)
        // OU dataMatch[1,2,3] são os 3 grupos (regex tolerante)
        let raw;
        if (dataMatch[2] && dataMatch[3]) {
          // Regex tolerante separou em 3 grupos
          const dd = String(dataMatch[1]).padStart(2, '0');
          const mm = String(dataMatch[2]).padStart(2, '0');
          const yy = dataMatch[3].length === 2 ? `20${dataMatch[3]}` : dataMatch[3];
          // Valida ranges (dd 1-31, mm 1-12, ano razoável)
          const ddN = parseInt(dd, 10);
          const mmN = parseInt(mm, 10);
          if (ddN >= 1 && ddN <= 31 && mmN >= 1 && mmN <= 12) {
            result.data = `${yy}-${mm}-${dd}`;
          }
        } else {
          raw = dataMatch[1];
          if (raw.includes('-')) {
            result.data = raw;
          } else {
            const parts = raw.split('/');
            result.data =
              parts[2].length === 2
                ? `20${parts[2]}-${parts[1]}-${parts[0]}`
                : `${parts[2]}-${parts[1]}-${parts[0]}`;
          }
        }
      }
    }

    const horaMatch =
      full.match(/hor[aá]rio\s+(\d{1,2})h(\d{2})/i) ||
      full.match(/hor[aá]rio\s*[:\-]\s*(\d{1,2}):(\d{2})/i) ||
      full.match(/\b(\d{1,2})h(\d{2})\b/i) ||
      full.match(/[àa]s\s+(\d{1,2}):(\d{2})/i) ||
      // "DD/MM/AAAA - HH:MM" (Bradesco usa hífen entre data e hora)
      full.match(/\d{2}\/\d{2}\/\d{4}[T\s,\-]+(\d{2}):(\d{2})/) ||
      full.match(/\d{4}-\d{2}-\d{2}[T\s]+(\d{2}):(\d{2})/) ||
      // "DD/MM/AA • HH:MM" (Cielo usa bullet/asterisco/separador entre
      // data curta e hora — cupom de cartão de crédito)
      full.match(/\d{2}\/\d{2}\/\d{2}[\sT,\-•·●○*|]+(\d{2}):(\d{2})/) ||
      full.match(/(?:hora|time)\s*[:\-]\s*(\d{1,2}):(\d{2})/i) ||
      // Fallback final: hora isolada HH:MM válida (00:00 a 23:59) em
      // QUALQUER lugar do texto. Usado quando não há prefixo/contexto
      // explícito (cabeçalho de cupom Cielo: "09/05/26 • 11:20").
      full.match(/\b((?:[01]\d|2[0-3])):([0-5]\d)\b/) ||
      // Tolerante a OCR ruim: `:` pode virar `.` ou `;` em scan de
      // baixa qualidade. Aceita HH(.|:|;)MM nas 5 primeiras linhas
      // do cupom (cabeçalho) onde a hora geralmente aparece.
      (() => {
        const topLines = full.split(/\r?\n/).slice(0, 8).join('\n');
        return topLines.match(/\b((?:[01]?\d|2[0-3]))[.:;]([0-5]\d)\b/);
      })();
    if (horaMatch && horaMatch[1] && horaMatch[2]) {
      result.hora =
        String(horaMatch[1]).padStart(2, '0') + ':' + String(horaMatch[2]).padStart(2, '0');
    }

    if (lower.includes('pix')) result.formaPagamento = 'Pix';
    else if (lower.includes('débito') || lower.includes('debito')) result.formaPagamento = 'Débito';
    else if (lower.includes('crédito') || lower.includes('credito'))
      {result.formaPagamento = 'Crédito';}
    else if (lower.includes('dinheiro')) result.formaPagamento = 'Dinheiro';

    const MAQUININHA_BRANDS = [
      ['Laranjinha', /laranjinha|graninha|[lf]?aran[ij]+inha/i],
      ['Stone', /\bstone\b/i],
      ['Cielo', /\bcielo\b/i],
      ['Rede', /\brede\b/i],
      ['PagSeguro', /pagseguro/i],
      ['Getnet', /getnet/i],
      ['SumUp', /sumup/i],
      ['InfinitePay', /infinitepay/i],
      ['Moderninha', /moderninha/i],
      ['Ton', /\bton\b/i],
    ];

    // BANDEIRAS de cartão — capturadas em cupons de crédito/débito.
    // Têm PRIORIDADE sobre MAQUININHA no campo nomeRecebedor (label
    // "Bandeira" na UI). Maquininha continua sendo detectada pra usar
    // como fallback se nenhuma bandeira aparecer no cupom.
    const BANDEIRA_BRANDS = [
      ['Mastercard', /\bmaster[\s\-]?card\b|\bmastercar[dt]\b/i],
      ['Visa', /\bvisa\b/i],
      ['Elo', /\belo\b(?!\s*(?:com|s\.?a\.?))/i],
      ['American Express', /american\s+express|\bamex\b/i],
      ['Hipercard', /hipercard|hiper\s*card/i],
      ['Diners', /diners\s*club|\bdiners\b/i],
      ['Discover', /\bdiscover\b/i],
      ['Cabal', /\bcabal\b/i],
      ['Banescard', /banescard/i],
      ['Sorocred', /sorocred/i],
    ];

    // ── Nome da loja (cupom de crédito) ─────────────────────────────────
    // Prefere a linha IMEDIATAMENTE anterior ao CNPJ (até 3 linhas atrás
    // pra acomodar quebras tipo "CENTRO EDUCACIONAL\nE\nCNPJ...").
    // Filtra linhas curtas (< 3 chars), cabeçalhos genéricos
    // ("VIA LOJA", "VIA CLIENTE", "VIA ESTABELECIMENTO") e marcas de
    // maquininha — bug reportado em prod 2026-05-14 onde "VIA LOJA"
    // virava nomeDepositante.
    const _HEADER_KW = /^(via\s+(?:loja|cliente|estabelecimento|comerciante)|cupom\s+fiscal|nfc-?e|recibo|comprovante|via)$/i;
    {
      const lines = full.split(/\r?\n/).map((l) => l.trim());
      let cnpjLineIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (/CN[PF]J|CNPI/i.test(lines[i])) {
          cnpjLineIdx = i;
          break;
        }
      }
      // Detecta linhas que são RUÍDO DE OCR (mistura de chars curtos
      // intercalados com símbolos estranhos: "Een À E /", "@ # $").
      const _isOcrNoise = (s) => {
        if (!s) return true;
        const trimmed = s.trim();
        if (trimmed.length < 3) return true;
        const alphaCount = (trimmed.match(/[A-Za-zÀ-ÿ]/g) || []).length;
        if (alphaCount < 3) return true;
        // Ratio: chars alfa devem ser pelo menos 65% do total
        if (alphaCount / trimmed.length < 0.65) return true;
        // Símbolos que NÃO aparecem em nome de empresa: / \ | * ? ! # @ ¥
        if (/[\/\\|*?!#@¥]/.test(trimmed)) return true;
        // Exige pelo menos UMA palavra com 4+ chars alfa contíguos
        // (filtra "Een À E /" que só tem palavras de 1-3 chars).
        if (!/[A-Za-zÀ-ÿ]{4,}/.test(trimmed)) return true;
        return false;
      };

      if (cnpjLineIdx > 0) {
        // Coleta até 3 linhas anteriores ao CNPJ, concatena as que parecem
        // continuação do nome (curtas, em caixa alta) na mesma string.
        const candidatos = [];
        for (let j = cnpjLineIdx - 1; j >= Math.max(0, cnpjLineIdx - 3); j--) {
          const ln = lines[j];
          if (!ln) continue;
          if (_HEADER_KW.test(ln)) continue;
          if (MAQUININHA_BRANDS.some(([, re]) => re.test(ln))) continue;
          if (BANDEIRA_BRANDS.some(([, re]) => re.test(ln))) continue;
          if (/^\d/.test(ln)) continue;
          if (ln.length < 2) continue;
          // Filtra linhas curtas (1-3 chars) que NÃO sejam pura letra
          // maiúscula (acomoda "E" como continuação válida de nome).
          if (ln.length <= 3 && !/^[A-ZÀ-Þ]+$/.test(ln)) continue;
          if (_isOcrNoise(ln)) continue;
          candidatos.unshift(ln);
        }
        if (candidatos.length) {
          // Junta as linhas vizinhas. Linhas curtas (1-2 chars) costumam
          // ser continuação ("CENTRO EDUCACIONAL" + "E" -> mesma razão)
          const loja = candidatos.join(' ').replace(/\s{2,}/g, ' ').trim();
          const isBrand = MAQUININHA_BRANDS.some(([, re]) => re.test(loja));
          if (!isBrand && loja.length >= 3) {
            result.nomeDepositante = toTitleCase(loja);
          }
        }
      }
    }
    // Fallback: regex original (texto + CNPJ na mesma linha) — útil pra
    // cupons que têm "EMPRESA LTDA CNPJ:..." em uma linha só.
    if (!result.nomeDepositante) {
      const lojaLineMatch = full.match(
        /([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 &.,'"|-]{2,50})\s+(?:CNPJ|CNPI|CNPE)\s*[:.]?\s*\d/i
      );
      if (lojaLineMatch && lojaLineMatch[1]) {
        const loja = lojaLineMatch[1].trim().replace(/^[\s|;"'(]+|[\s|;"')=]+$/g, '');
        const isBrand = MAQUININHA_BRANDS.some(([, re]) => re.test(loja));
        const isHeader = _HEADER_KW.test(loja);
        if (!isBrand && !isHeader && loja.length >= 3) {
          result.nomeDepositante = toTitleCase(loja);
        }
      }
    }

    // BANDEIRA tem prioridade sobre MAQUININHA pro nomeRecebedor.
    // Ex: cupom Cielo + Mastercard → mostra "Mastercard" (bandeira).
    // Se o cupom só tem maquininha sem bandeira, ainda mostra a
    // maquininha (Cielo) — melhor que ficar vazio. A presença de
    // qualquer dos dois também garante formaPagamento = Crédito.
    const bandeiraEntry = BANDEIRA_BRANDS.find(([, re]) => re.test(full));
    const maqEntry = MAQUININHA_BRANDS.find(([, re]) => re.test(full));
    if (bandeiraEntry) {
      result.nomeRecebedor = bandeiraEntry[0];
      result.formaPagamento = result.formaPagamento || 'Crédito';
    } else if (maqEntry) {
      result.nomeRecebedor = maqEntry[0];
      result.formaPagamento = result.formaPagamento || 'Crédito';
    }

    const NOME_PAT = '((?:[A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇ][A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇa-záéíóúàâêôãõüç]* ?){2,9})';
    const NOME_PAT_LOOSE = '((?:[A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇ][A-Za-záéíóúàâêôãõüç]* ?){2,9})';

    const blocoPagou =
      full.match(new RegExp(`quem\\s+pagou[\\s\\S]{0,300}?nome\\s+${NOME_PAT}`, 'i')) ||
      full.match(new RegExp(`pagador[\\s\\S]{0,150}?nome\\s*[:\\-]?\\s*${NOME_PAT_LOOSE}`, 'i')) ||
      full.match(
        new RegExp(`(?:origem|remetente)[\\s\\S]{0,150}?nome\\s*[:\\-]?\\s*${NOME_PAT_LOOSE}`, 'i')
      ) ||
      full.match(new RegExp(`\\bde\\s*[:\\-]?\\s*\\n+\\s*${NOME_PAT}`, 'i')) ||
      full.match(new RegExp(`remetente\\s*[:\\-]\\s*${NOME_PAT_LOOSE}`, 'i')) ||
      full.match(new RegExp(`enviado\\s+por\\s*[:\\-]?\\s*${NOME_PAT_LOOSE}`, 'i')) ||
      full.match(new RegExp(`pago\\s+por\\s*[:\\-]?\\s*${NOME_PAT_LOOSE}`, 'i')) ||
      // Adicionados:
      full.match(
        new RegExp(
          `conta\\s+(?:de\\s+)?origem[\\s\\S]{0,200}?(?:nome\\s*[:\\-]?\\s*)?${NOME_PAT_LOOSE}`,
          'i'
        )
      ) ||
      full.match(new RegExp(`pagador\\s*[:\\-]\\s*${NOME_PAT_LOOSE}`, 'i')) ||
      full.match(
        new RegExp(`debitado\\s+(?:de|na\\s+conta\\s+de)\\s*[:\\-]?\\s*${NOME_PAT_LOOSE}`, 'i')
      ) ||
      // BB usa "Pagador\nNome" sem dois-pontos nem rótulo "Nome:"
      full.match(new RegExp(`pagador\\s*\\n+\\s*${NOME_PAT_LOOSE}`, 'i'));
    if (blocoPagou && blocoPagou[1]) {
      const nome = toTitleCase(blocoPagou[1].trim().replace(/\s{2,}/g, ' '));
      result.nomeAluno = nome;
      result.nomeDepositante = nome;
    }

    const instPagouMatch =
      full.match(/quem\s+pagou[\s\S]{0,400}?institui[çc][aã]o\s+([\wÀ-ÿ .,-]{3,40})/i) ||
      full.match(/\bde\b[\s\S]{0,250}?institui[çc][aã]o\s*[:\-]?\s*([\wÀ-ÿ .,-]{3,40})/i) ||
      full.match(
        /pagador[\s\S]{0,200}?(?:banco|institui[çc][aã]o)\s*[:\-]?\s*([\wÀ-ÿ .,-]{3,40})/i
      ) ||
      full.match(
        /(?:origem|remetente)[\s\S]{0,200}?(?:banco|institui[çc][aã]o)\s*[:\-]?\s*([\wÀ-ÿ .,-]{3,40})/i
      );
    if (instPagouMatch && instPagouMatch[1]) {
      result.bancoDepositante = this.normalizarBanco(instPagouMatch[1].trim());
    }

    const blocoRecebeu =
      full.match(new RegExp(`quem\\s+recebeu[\\s\\S]{0,300}?nome\\s+${NOME_PAT}`, 'i')) ||
      full.match(
        new RegExp(`favorecido[\\s\\S]{0,150}?nome\\s*[:\\-]?\\s*${NOME_PAT_LOOSE}`, 'i')
      ) ||
      full.match(
        new RegExp(`benefici[aá]rio[\\s\\S]{0,150}?nome\\s*[:\\-]?\\s*${NOME_PAT_LOOSE}`, 'i')
      ) ||
      full.match(
        new RegExp(`destinat[aá]rio[\\s\\S]{0,150}?nome\\s*[:\\-]?\\s*${NOME_PAT_LOOSE}`, 'i')
      ) ||
      full.match(new RegExp(`\\bpara\\s*[:\\-]?\\s*\\n+\\s*${NOME_PAT}`, 'i')) ||
      full.match(new RegExp(`favorecido\\s*[:\\-]\\s*${NOME_PAT_LOOSE}`, 'i')) ||
      full.match(new RegExp(`benefici[aá]rio\\s*[:\\-]\\s*${NOME_PAT_LOOSE}`, 'i')) ||
      // Adicionados (Santander/Caixa "Recebedor", PicPay "Recebido por",
      // BB "Crédito a", "Conta destino"):
      full.match(
        new RegExp(`recebedor[\\s\\S]{0,150}?nome\\s*[:\\-]?\\s*${NOME_PAT_LOOSE}`, 'i')
      ) ||
      full.match(new RegExp(`recebedor\\s*[:\\-]\\s*${NOME_PAT_LOOSE}`, 'i')) ||
      full.match(new RegExp(`recebido\\s+por\\s*[:\\-]?\\s*${NOME_PAT_LOOSE}`, 'i')) ||
      // "Crédito a [Nome]" do BB. PRECISA de dois-pontos ou nome composto
      // pra evitar capturar "CREDITO A VISTA" / "CREDITO A PRAZO" (forma
      // de pagamento em cupom de cartão) como nome do recebedor.
      // Exige rótulo explícito (`:` ou `-`) OU nome com 2+ palavras
      // (que não inclui as palavras-reservadas vista/prazo).
      full.match(
        new RegExp(
          `cr[eé]dito\\s+a\\s*[:\\-]\\s*${NOME_PAT_LOOSE}|cr[eé]dito\\s+a\\s+(?!vista\\b|prazo\\b)((?:[A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇ][A-Za-záéíóúàâêôãõüç]* ){2,8}[A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇ][A-Za-záéíóúàâêôãõüç]*)`,
          'i'
        )
      ) ||
      full.match(
        new RegExp(`conta\\s+destino[\\s\\S]{0,200}?(?:nome\\s*[:\\-]?\\s*)?${NOME_PAT_LOOSE}`, 'i')
      ) ||
      // BB usa "Recebedor\nNome" sem dois-pontos nem rótulo "Nome:"
      full.match(new RegExp(`recebedor\\s*\\n+\\s*${NOME_PAT_LOOSE}`, 'i'));
    if (blocoRecebeu && (blocoRecebeu[1] || blocoRecebeu[2])) {
      const nomeRaw = blocoRecebeu[1] || blocoRecebeu[2];
      result.nomeRecebedor = toTitleCase(nomeRaw.trim().replace(/\s{2,}/g, ' '));
    }

    const instRecebeuMatch =
      full.match(/quem\s+recebeu[\s\S]{0,400}?institui[çc][aã]o\s+([\wÀ-ÿ .,-]{3,40})/i) ||
      full.match(/\bpara\b[\s\S]{0,250}?institui[çc][aã]o\s*[:\-]?\s*([\wÀ-ÿ .,-]{3,40})/i) ||
      full.match(
        /favorecido[\s\S]{0,200}?(?:banco|institui[çc][aã]o)\s*[:\-]?\s*([\wÀ-ÿ .,-]{3,40})/i
      ) ||
      full.match(
        /benefici[aá]rio[\s\S]{0,200}?(?:banco|institui[çc][aã]o)\s*[:\-]?\s*([\wÀ-ÿ .,-]{3,40})/i
      ) ||
      full.match(
        /destinat[aá]rio[\s\S]{0,200}?(?:banco|institui[çc][aã]o)\s*[:\-]?\s*([\wÀ-ÿ .,-]{3,40})/i
      ) ||
      full.match(
        /recebedor[\s\S]{0,200}?(?:banco|institui[çc][aã]o)\s*[:\-]?\s*([\wÀ-ÿ .,-]{3,40})/i
      );
    if (instRecebeuMatch && instRecebeuMatch[1]) {
      result.bancoRecebedor = this.normalizarBanco(instRecebeuMatch[1].trim());
    }

    if (!result.bancoDepositante || !result.bancoRecebedor) {
      const bancos = [
        ['Inter', /\bbanco\s+inter\b|\binter\s+s\.?a\.?\b/i],
        ['Nubank', /nubank|\bnu\s+pagamentos\b/i],
        ['Itaú', /ita[uú](?:\s+unibanco)?/i],
        ['Bradesco', /bradesco(?:\s+s\.?a\.?)?|bradescard/i],
        ['Caixa', /caixa\s+econ|\bcef\b/i],
        ['Banco do Brasil', /banco\s+do\s+brasil|\bBB\b/i],
        ['Santander', /santander/i],
        // Cobre "C6 Bank", "C6 S.A.", "BANCO C6 S.A." (Mercado Pago/PIX)
        ['C6', /\bc6\s+(?:bank|s\.?a\.?)\b|\bbanco\s+c6\b/i],
        ['PicPay', /picpay/i],
        ['Mercado Pago', /mercado\s+pago/i],
        ['Sicoob', /sicoob/i],
        ['Sicredi', /sicredi/i],
        ['BTG', /btg\s+pactual/i],
        ['Neon', /\bneon\b/i],
        ['Next', /\bnext\b/i],
        ['Original', /banco\s+original/i],
        // Bancos adicionados na revisão de cobertura PIX
        ['Banrisul', /banrisul/i],
        ['Banpará', /banpar[áa]/i],
        ['BMG', /\bbmg\b/i],
        ['Pan', /banco\s+pan|\bpan\s+s\.?a\.?\b/i],
        ['Will Bank', /will\s+bank|\bwill\b/i],
        ['XP', /\bxp\s+(?:investimentos|inc|bank)\b/i],
        ['Cora', /\bcora\b/i],
        ['Safra', /banco\s+safra|\bsafra\s+s\.?a\.?\b/i],
        ['Daycoval', /daycoval/i],
        ['Modal', /banco\s+modal/i],
        ['ABC Brasil', /abc\s+brasil/i],
        ['Banco24Horas', /banco24horas|banco\s+24\s+horas/i],
      ];
      // Acha todas as ocorrências de banco no texto
      const found = [];
      for (const [nome, re] of bancos) {
        const m = full.match(re);
        if (m) found.push({ nome, pos: m.index });
      }
      found.sort((a, b) => a.pos - b.pos);

      // ── ESTRATÉGIA 1: PROXIMIDADE AOS RÓTULOS ────────────────────────
      // Comprovantes do app do RECEBEDOR (ex: Inter recebendo) listam
      // o banco DELE primeiro (no topo) e o do pagador depois.
      // A regra antiga "primeiro banco = pagador" invertia esses casos
      // (bug reportado em prod 2026-05-14). Solução: pra cada banco
      // encontrado, olhar QUAL rótulo (pagador/recebedor) está mais
      // próximo ANTES dele e classificar baseado nisso.
      //
      // Rótulos restritivos (evita falsos positivos com palavras comuns
      // como "de" e "para" sem contexto financeiro).
      const ROT_PAG =
        /(?:pagador|origem|remetente|debitado|quem\s+pagou|pago\s+por|enviado\s+por|conta\s+(?:de\s+)?origem|^\s*de\s*[:\-]|\bde\s*[:\-])/gim;
      const ROT_REC =
        /(?:favorecido|benefici[áa]rio|destinat[áa]rio|recebedor|recebido\s+por|cr[eé]dito\s+a|conta\s+destino|quem\s+recebeu|^\s*para\s*[:\-]|\bpara\s*[:\-])/gim;

      const ocPag = [...full.matchAll(ROT_PAG)].map((m) => m.index);
      const ocRec = [...full.matchAll(ROT_REC)].map((m) => m.index);

      const _maisProximoAntes = (occurrences, bankPos) => {
        let best = null;
        for (const idx of occurrences) {
          const dist = bankPos - idx;
          if (dist >= 0 && dist <= 300 && (best === null || dist < best)) {
            best = dist;
          }
        }
        return best;
      };

      const classificados = found.map((b) => {
        const dPag = _maisProximoAntes(ocPag, b.pos);
        const dRec = _maisProximoAntes(ocRec, b.pos);
        let tipo = null;
        if (dPag !== null && (dRec === null || dPag < dRec)) tipo = 'pag';
        else if (dRec !== null && (dPag === null || dRec < dPag)) tipo = 'rec';
        return { ...b, tipo };
      });

      const primeiroPag = classificados.find((b) => b.tipo === 'pag');
      const primeiroRec = classificados.find((b) => b.tipo === 'rec' && (!primeiroPag || b.nome !== primeiroPag.nome));

      if (!result.bancoDepositante && primeiroPag) {
        result.bancoDepositante = primeiroPag.nome;
      }
      if (!result.bancoRecebedor && primeiroRec) {
        result.bancoRecebedor = primeiroRec.nome;
      }

      // ── ESTRATÉGIA 2: ORDEM DE APARIÇÃO (fallback) ──────────────────
      // Pros comprovantes sem rótulos explícitos (ex: Mercado Pago só
      // tem "De / Para" sem dois-pontos, ou layout livre): mantém o
      // comportamento histórico — primeiro banco do texto vira pagador.
      if (!result.bancoDepositante || !result.bancoRecebedor) {
        const ordemAparicao = [];
        const seen = new Set();
        for (const f of found) {
          if (!seen.has(f.nome)) {
            seen.add(f.nome);
            ordemAparicao.push(f.nome);
          }
        }
        if (!result.bancoDepositante && ordemAparicao[0]) {
          result.bancoDepositante = ordemAparicao[0];
        }
        if (!result.bancoRecebedor) {
          for (const nome of ordemAparicao) {
            if (nome !== result.bancoDepositante) {
              result.bancoRecebedor = nome;
              break;
            }
          }
        }
      }
    }

    return result;
  }

  normalizarBanco(str) {
    const mapa = [
      [/inter/i, 'Inter'],
      [/bradesco/i, 'Bradesco'],
      [/ita[uú]/i, 'Itaú'],
      [/nubank|\bnu\s+pag/i, 'Nubank'],
      [/caixa/i, 'Caixa'],
      [/brasil/i, 'Banco do Brasil'],
      [/santander/i, 'Santander'],
      [/c6/i, 'C6'],
      [/picpay/i, 'PicPay'],
      [/mercado/i, 'Mercado Pago'],
      [/sicoob/i, 'Sicoob'],
      [/sicredi/i, 'Sicredi'],
      [/btg/i, 'BTG'],
      [/\bneon\b/i, 'Neon'],
      [/\bnext\b/i, 'Next'],
      [/original/i, 'Original'],
      // Bancos adicionados
      [/banrisul/i, 'Banrisul'],
      [/banpar[áa]/i, 'Banpará'],
      [/\bbmg\b/i, 'BMG'],
      [/\bpan\b/i, 'Pan'],
      [/will/i, 'Will Bank'],
      [/\bxp\b/i, 'XP'],
      [/\bcora\b/i, 'Cora'],
      [/safra/i, 'Safra'],
      [/daycoval/i, 'Daycoval'],
      [/modal/i, 'Modal'],
      [/abc/i, 'ABC Brasil'],
    ];
    for (const [re, nome] of mapa) if (re.test(str)) return nome;
    return str;
  }

  confirmar() {
    this.modal.close('ocrModal');
    const extracted = this.ocrExtracted;
    const clearErr = (id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = '';
    };
    if (extracted.nomeAluno) {
      const firstRow = document.querySelector('#alunosContainer .aluno-row');
      if (firstRow) {
        const el = document.getElementById(`alunoNome_${firstRow.dataset.alunoId}`);
        if (el) {
          el.value = extracted.nomeAluno;
          clearErr(`alunoNomeError_${firstRow.dataset.alunoId}`);
        }
      }
    }
    if (extracted.nomeDepositante) {
      setInput('nomeDepositante', extracted.nomeDepositante);
      clearErr('nomeDepositanteError');
    }
    if (extracted.nomeRecebedor) {
      setInput('nomeRecebedor', extracted.nomeRecebedor);
      clearErr('nomeRecebedorError');
    }
    if (extracted.bancoDepositante) {
      setInput('bancoDepositante', extracted.bancoDepositante);
      clearErr('bancoDepositanteError');
    }
    if (extracted.bancoRecebedor) {
      setInput('bancoRecebedor', extracted.bancoRecebedor);
      clearErr('bancoRecebedorError');
    }
    if (extracted.data) {
      setInput('dataDeposito', isoToDateInput(extracted.data));
      clearErr('dataError');
    }
    if (extracted.hora) setInput('horaDeposito', extracted.hora);
    if (extracted.valor) {
      document.getElementById('valorEntrada').value = extracted.valor.replace('R$ ', '');
      clearErr('valorError');
    }
    if (extracted.formaPagamento && this._entradaPage) {
      document.querySelectorAll('#paymentTypes .payment-btn').forEach((btn) => {
        if (btn.dataset.value === extracted.formaPagamento) this._entradaPage.selectPayment(btn);
      });
      this._entradaPage.lockPayment();
    }
    if (this._entradaPage) this._entradaPage.switchTab('manual');
    this._abrirModalDados();
  }

  _abrirModalDados() {
    const e = this.ocrExtracted;
    const labels = {
      nomeAluno: 'Aluno',
      nomeDepositante: 'Depositante',
      valor: 'Valor',
      data: 'Data',
      hora: 'Hora',
      formaPagamento: 'Pagamento',
    };
    const escH = (s) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    document.getElementById('ocrDadosSummary').innerHTML =
      Object.keys(labels)
        .filter((k) => e[k])
        .map(
          (k) => `<div class="ocr-row">
        <span class="ocr-row-label">${escH(labels[k])}</span>
        <span class="ocr-row-value">${escH(e[k])}</span>
      </div>`
        )
        .join('') ||
      '<p style="padding:16px;color:#aaa;text-align:center">Nenhum dado extraído.</p>';
    this.modal.open('ocrDadosModal');
  }

  closeModal() {
    this.modal.close('ocrModal');
  }
}
