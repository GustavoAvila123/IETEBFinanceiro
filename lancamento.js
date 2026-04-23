/* ─── IETEB — Lançamento de Entradas ─── */

// ── Igrejas ───────────────────────────────────────────────────────────────────
const CHURCHES = [
  "Sem Igreja",
  "Ad Brás Osasco 1 de Maio",
  "Ad Brás Osasco Açucara",
  "Ad Brás Osasco Bandeiras",
  "Ad Brás Osasco Bonança",
  "Ad Brás Osasco Conceição",
  "Ad Brás Osasco Conj. Metalúrgicos",
  "Ad Brás Osasco Corrego Rico",
  "Ad Brás Osasco Flamenguinho",
  "Ad Brás Osasco Flor da Primavera",
  "Ad Brás Osasco Guanabara",
  "Ad Brás Osasco Helena Maria I",
  "Ad Brás Osasco Helena Maria II",
  "Ad Brás Osasco Jandaia",
  "Ad Brás Osasco Jd D'Abril SP",
  "Ad Brás Osasco Jd D'Abril Osasco",
  "Ad Brás Osasco Joelma",
  "Ad Brás Osasco Jussara",
  "Ad Brás Osasco Munhoz Junior",
  "Ad Brás Osasco Mutinga I",
  "Ad Brás Osasco Mutinga II",
  "Ad Brás Osasco Mutinga Ômega",
  "Ad Brás Osasco Novo Horizonte",
  "Ad Brás Osasco Novo Osasco",
  "Ad Brás Osasco Padroeira II",
  "Ad Brás Osasco Parque Imperial I",
  "Ad Brás Osasco Parque Imperial II",
  "Ad Brás Osasco Piratininga",
  "Ad Brás Osasco Portela",
  "Ad Brás Osasco Presidente Altino",
  "Ad Brás Osasco Quitaúna",
  "Ad Brás Osasco Recanto das Rosas 1",
  "Ad Brás Osasco Samambaia",
  "Ad Brás Osasco Santa Maria",
  "Ad Brás Osasco Santo Antonio",
  "Ad Brás Osasco Sede",
  "Ad Brás Osasco São João da Bela Vista",
  "Ad Brás Osasco São Vitor",
  "Ad Brás Osasco Teresa",
  "Ad Brás Osasco Três Montanhas",
  "Ad Brás Osasco Vila Dirce",
  "Ad Brás Osasco Vila dos Andrades",
  "Ad Brás Osasco Vila Menck",
  "Ad Brás Osasco Vila Simões",
  "Ad Brás Osasco Ypê",
];

// ── Firebase ──────────────────────────────────────────────────────────────────
const _fbConfig = {
  apiKey:            'AIzaSyAH6mxJzzI1vOryKrw7DXNzODLOq2ZtFls',
  authDomain:        'ieteb-financeiro.firebaseapp.com',
  projectId:         'ieteb-financeiro',
  storageBucket:     'ieteb-financeiro.firebasestorage.app',
  messagingSenderId: '514664099454',
  appId:             '1:514664099454:web:72177a3d36afc85782b22f',
};

let _db      = null;
let _storage = null;

function initFirebase() {
  try {
    if (typeof firebase === 'undefined') return;
    if (!firebase.apps.length) firebase.initializeApp(_fbConfig);
    _db      = firebase.firestore();
    _storage = firebase.storage();
  } catch (e) {
    console.warn('Firebase init:', e);
  }
}

async function uploadComprovante(colName, id, dataUrl) {
  if (!_db || !_storage || !dataUrl) return;
  try {
    const res  = await fetch(dataUrl);
    const blob = await res.blob();
    const ext  = blob.type.includes('pdf') ? 'pdf' : 'jpg';
    const ref  = _storage.ref(`comprovantes/${colName}/${id}.${ext}`);
    await ref.put(blob);
    const url = await ref.getDownloadURL();
    await _db.collection(colName).doc(String(id)).update({ comprovanteUrl: url, temComprovante: true });
  } catch (e) {
    console.warn('Storage upload error:', e);
  }
}

// Comprime imagem para caber no limite de 1 MB do Firestore.
// Tenta 800px/65% primeiro; se ainda for grande, 600px/50%.
function compressImage(dataUrl) {
  const LIMIT = 400000;
  if (!dataUrl) return Promise.resolve(null);
  if (dataUrl.startsWith('data:application/pdf'))
    return Promise.resolve(dataUrl.length < LIMIT ? dataUrl : null);
  const tryC = (maxW, q) => new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const s = Math.min(1, maxW / Math.max(img.width, 1));
      c.width  = Math.round(img.width  * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const out = c.toDataURL('image/jpeg', q);
      res(out.length < LIMIT ? out : null);
    };
    img.onerror = () => res(null);
    img.src = dataUrl;
  });
  return tryC(800, 0.65).then(r => r || tryC(600, 0.50));
}

async function saveToFirestore(colName, data) {
  if (!_db) return;
  try {
    const { comprovante, ...doc } = data;
    doc.temComprovante = !!comprovante;
    if (comprovante) {
      const compressed = await compressImage(comprovante);
      if (compressed) doc.comprovante = compressed;
    }
    _db.collection(colName).doc(String(doc.id)).set(doc)
      .catch(e => console.warn('Firestore write error:', e));
  } catch (e) {
    console.warn('Firestore save error:', e);
  }
}

function deleteFromFirestore(colName, id) {
  if (!_db) return;
  _db.collection(colName).doc(String(id)).delete()
    .catch(e => console.warn('Firestore delete error:', e));
}

async function loadFromFirestore() {
  if (!_db) { initHome(); return; }
  try {
    const [entSnap, saiSnap] = await Promise.all([
      _db.collection('Entradas').get(),
      _db.collection('Saídas').get()
    ]);

    // Entradas — preserva comprovantes locais
    const localEnt = JSON.parse(localStorage.getItem('ieteb_lancamentos') || '[]');
    const localEntMap = {};
    localEnt.forEach(r => { localEntMap[r.id] = r; });

    const fsEntradas = entSnap.docs.map(d => {
      const doc   = d.data();
      const local = localEntMap[doc.id];
      if (local && local.comprovante)          doc.comprovante = local.comprovante;
      else if (!doc.comprovante && doc.comprovanteUrl) doc.comprovante = doc.comprovanteUrl;
      return doc;
    });
    fsEntradas.sort((a, b) => b.id - a.id);
    localStorage.setItem('ieteb_lancamentos', JSON.stringify(fsEntradas));

    // Saídas — preserva comprovantes locais
    const localSai = JSON.parse(localStorage.getItem('ieteb_saidas') || '[]');
    const localSaiMap = {};
    localSai.forEach(r => { localSaiMap[r.id] = r; });

    const fsSaidas = saiSnap.docs.map(d => {
      const doc   = d.data();
      const local = localSaiMap[doc.id];
      if (local && local.comprovante)          doc.comprovante = local.comprovante;
      else if (!doc.comprovante && doc.comprovanteUrl) doc.comprovante = doc.comprovanteUrl;
      return doc;
    });
    fsSaidas.sort((a, b) => b.id - a.id);
    localStorage.setItem('ieteb_saidas', JSON.stringify(fsSaidas));

  } catch (e) {
    console.warn('Firestore load error:', e);
  }
  initHome();
}

// ── Estado ────────────────────────────────────────────────────────────────────
let currentFile       = null;
let currentFileDataUrl= null;
let ocrExtracted      = {};
let reportData        = [];
let filteredData      = [];
let currentPage       = 1;
const PAGE_SIZE       = 10;
let tipoRelatorio     = '';
let nextAlunoId       = 0;

// ═══════════════════════════════════════════════════════════════════════════════
// NAVEGAÇÃO
// ═══════════════════════════════════════════════════════════════════════════════
function showPage(page) {
  ['home','lancamentos','saidas','relatorios','caixa','dashboard'].forEach(p => {
    document.getElementById('page' + p.charAt(0).toUpperCase() + p.slice(1))
      .classList.toggle('page-content--hidden', p !== page);
    document.getElementById('nav'  + p.charAt(0).toUpperCase() + p.slice(1))
      .classList.toggle('nav-item--active', p === page);
  });
  const titles = { home: 'Home', lancamentos: 'Entradas', saidas: 'Saídas', relatorios: 'Relatórios', caixa: 'Caixa', dashboard: 'Dashboard' };
  document.getElementById('topbarTitle').textContent = titles[page] || 'IETEB';

  if (page === 'home')       { window.scrollTo(0, 0); initHome(); }
  if (page === 'relatorios') carregarRelatorio();
  if (page === 'caixa')      initCaixa();
  if (page === 'dashboard')  initDashboard();
  closeSidebar();
}

function initHome() {
  const now  = new Date();
  const h    = now.getHours();
  const gr   = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  document.getElementById('homeGreeting').textContent = `${gr}, Admin!`;
  document.getElementById('homeDate').textContent = now.toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  const year  = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const ini   = `${year}-${month}-01`;
  const fim   = `${year}-${month}-${String(new Date(year, now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;

  const entradas = JSON.parse(localStorage.getItem('ieteb_lancamentos') || '[]')
    .filter(i => i.dataDeposito >= ini && i.dataDeposito <= fim);
  const saidas   = JSON.parse(localStorage.getItem('ieteb_saidas')      || '[]')
    .filter(i => i.data >= ini && i.data <= fim);

  const totalE = entradas.reduce((s, i) => s + parseBRL(i.valor), 0);
  const totalS = saidas.reduce((s, i) => s + parseBRL(i.valor), 0);
  const saldo  = totalE - totalS;

  document.getElementById('homeStatEntradas').textContent = `R$ ${formatBRL(totalE)}`;
  document.getElementById('homeStatSaidas').textContent   = `R$ ${formatBRL(totalS)}`;
  const saldoEl = document.getElementById('homeStatSaldo');
  saldoEl.textContent = `R$ ${formatBRL(saldo)}`;
  saldoEl.style.color = saldo >= 0 ? '' : 'var(--danger)';
}

function openSidebar() {
  document.getElementById('sidebar').classList.add('sidebar--open');
  document.getElementById('sidebarOverlay').classList.add('sidebar-overlay--show');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('sidebar--open');
  document.getElementById('sidebarOverlay').classList.remove('sidebar-overlay--show');
  document.body.style.overflow = '';
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABAS (Lançamentos)
// ═══════════════════════════════════════════════════════════════════════════════
function switchTab(tab) {
  const isManual = tab === 'manual';
  document.getElementById('panelManual').classList.toggle('tab-panel--hidden', !isManual);
  document.getElementById('panelUpload').classList.toggle('tab-panel--hidden', isManual);
  document.getElementById('tabManual').classList.toggle('tab-btn--active', isManual);
  document.getElementById('tabUpload').classList.toggle('tab-btn--active', !isManual);
  document.getElementById('tabManual').setAttribute('aria-selected', isManual);
  document.getElementById('tabUpload').setAttribute('aria-selected', !isManual);

  // Oculta/mostra botão Limpar
  document.getElementById('btnLimpar').style.display = isManual ? '' : 'none';
}

// ═══════════════════════════════════════════════════════════════════════════════
// DROPDOWN IGREJAS
// ═══════════════════════════════════════════════════════════════════════════════
function buildChurchDropdown(filter) {
  const dd       = document.getElementById('churchDropdown');
  const selected = document.getElementById('igreja').value;
  const term     = (filter || '').toLowerCase().trim();
  const list     = term ? CHURCHES.filter(c => c.toLowerCase().includes(term)) : CHURCHES;

  if (!list.length) {
    dd.innerHTML = '<div class="church-option" style="color:#8090b0;cursor:default">Nenhuma encontrada</div>';
    return;
  }

  dd.innerHTML = list.map(c => {
    const sel = c === selected;
    const safe = c.replace(/'/g, "\\'");
    return `<div class="church-option${sel ? ' church-option--selected' : ''}"
      tabindex="0"
      onclick="selectChurch('${safe}')"
      onkeydown="if(event.key==='Enter'||event.key===' ')selectChurch('${safe}')">
      ${escHtml(c)}
    </div>`;
  }).join('');
}

function openChurchDropdown() {
  buildChurchDropdown(document.getElementById('igrejaSearch').value);
  document.getElementById('churchDropdown').classList.add('church-dropdown--open');
  document.addEventListener('mousedown', closeChurchDropdownOutside);
}

function closeChurchDropdownOutside(e) {
  const wrap = document.querySelector('.select-search-wrap');
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById('churchDropdown').classList.remove('church-dropdown--open');
    document.removeEventListener('mousedown', closeChurchDropdownOutside);
  }
}

function filterChurches(val) {
  buildChurchDropdown(val);
  document.getElementById('churchDropdown').classList.add('church-dropdown--open');
  document.getElementById('igreja').value = '';
}

function selectChurch(value) {
  document.getElementById('igreja').value = value;
  document.getElementById('igrejaSearch').value = value;
  document.getElementById('churchDropdown').classList.remove('church-dropdown--open');
  document.getElementById('igrejaError').textContent = '';
  document.removeEventListener('mousedown', closeChurchDropdownOutside);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGAMENTO
// ═══════════════════════════════════════════════════════════════════════════════
function lockPayment() {
  document.getElementById('paymentTypes').classList.add('payment-types--locked');
}

function unlockPayment() {
  document.getElementById('paymentTypes').classList.remove('payment-types--locked');
}

function selectPayment(btn) {
  document.querySelectorAll('#paymentTypes .payment-btn').forEach(b => b.classList.remove('payment-btn--active'));
  btn.classList.add('payment-btn--active');
  document.getElementById('formaPagamento').value = btn.dataset.value;
  document.getElementById('pagamentoError').textContent = '';
  ajustarFormPorPagamento(btn.dataset.value);
  lockPayment();
}

// Altera apenas o nó de texto de um label, preservando <span class="required">
function setLabelText(id, texto) {
  const el = document.getElementById(id);
  if (!el) return;
  const tn = Array.from(el.childNodes).find(n => n.nodeType === 3); // TEXT_NODE
  if (tn) tn.nodeValue = texto;
  else    el.insertBefore(document.createTextNode(texto), el.firstChild);
}

function ajustarFormPorPagamento(tipo) {
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
    // Crédito e Débito: sem campos de banco
    rowBancos.appendChild(grupoBancoRec);
    rowBancos.style.display = 'none';
  } else {
    rowBancos.appendChild(grupoBancoRec);
    rowBancos.style.display = '';
  }

  // ── Labels e placeholders dinâmicos ───────────────────────────────────────
  const inputNomeDepo = document.getElementById('nomeDepositante');
  const inputNomeRec  = document.getElementById('nomeRecebedor');
  const labelHora     = document.getElementById('labelHoraDeposito');

  if (isCredito || isDebito) {
    setLabelText('labelNomeDepositante', 'Nome da Loja ');
    setLabelText('labelNomeRecebedor',   'Maquininha ');
    setLabelText('labelDataDeposito',    'Data da Transação ');
    if (labelHora) labelHora.textContent = 'Hora da Transação';
    if (inputNomeDepo) inputNomeDepo.placeholder = 'Nome do estabelecimento';
    if (inputNomeRec)  inputNomeRec.placeholder  = 'Ex: Laranjinha, Stone, Cielo...';
  } else {
    setLabelText('labelNomeDepositante', 'Nome do Depositante ');
    setLabelText('labelNomeRecebedor',   'Nome de Quem Recebeu ');
    setLabelText('labelDataDeposito',    isDinheiro ? 'Data do Pagamento ' : 'Data do Depósito ');
    if (labelHora) labelHora.textContent = 'Hora do Depósito';
    if (inputNomeDepo) inputNomeDepo.placeholder = 'Quem realizou o pagamento';
    if (inputNomeRec)  inputNomeRec.placeholder  = 'Quem recebeu o valor';
  }

  // ── Banco Recebedor ───────────────────────────────────────────────────────
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

// ═══════════════════════════════════════════════════════════════════════════════
// MÁSCARA MOEDA
// ═══════════════════════════════════════════════════════════════════════════════
function maskCurrency(input) {
  let raw = input.value.replace(/\D/g, '');
  if (!raw) { input.value = ''; return; }
  raw = String(parseInt(raw, 10));
  if (raw.length === 1) raw = '0' + raw;
  const cents     = raw.slice(-2);
  const reais     = raw.slice(0, -2) || '0';
  const formatted = parseInt(reais, 10).toLocaleString('pt-BR');
  input.value     = formatted + ',' + cents;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UPLOAD / DRAG & DROP
// ═══════════════════════════════════════════════════════════════════════════════
function onDragOver(e) {
  e.preventDefault();
  document.getElementById('dropZone').classList.add('upload-area--dragover');
}

function onDragLeave() {
  document.getElementById('dropZone').classList.remove('upload-area--dragover');
}

function onDrop(e) {
  e.preventDefault();
  document.getElementById('dropZone').classList.remove('upload-area--dragover');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
}

function onFileSelected(input) {
  const file = input.files[0];
  if (file) handleFile(file);
}

function handleFile(file) {
  const allowed = ['image/png','image/jpeg','image/jpg','image/gif','image/webp','application/pdf'];
  if (!allowed.includes(file.type)) {
    showToast('Formato não suportado. Use imagem ou PDF.', 'error');
    return;
  }
  currentFile = file;
  document.getElementById('previewFileName').textContent = file.name;
  document.getElementById('uploadPreview').style.display = 'block';

  const img = document.getElementById('previewImg');
  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = e => {
      currentFileDataUrl = e.target.result;
      img.src = e.target.result;
      img.style.display = 'block';
    };
    reader.readAsDataURL(file);
  } else {
    img.style.display = 'none';
    currentFileDataUrl = null;
  }

  document.getElementById('btnLerComprovante').style.display = 'flex';
  lockPayment();
}

function removeFile() {
  currentFile        = null;
  currentFileDataUrl = null;
  document.getElementById('uploadPreview').style.display  = 'none';
  document.getElementById('previewImg').style.display     = 'none';
  document.getElementById('previewImg').src               = '';
  document.getElementById('previewFileName').textContent  = '';
  document.getElementById('btnLerComprovante').style.display = 'none';
  document.getElementById('ocrStatus').style.display      = 'none';
  document.getElementById('fileInput').value              = '';
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEITURA DE COMPROVANTE (OCR)
// ═══════════════════════════════════════════════════════════════════════════════
async function lerComprovante() {
  if (!currentFile) return;
  setOcrStatus(true, 'Carregando arquivo...');
  try {
    if (currentFile.type === 'application/pdf') {
      await extrairDoPdf();
    } else {
      await extrairDaImagem();
    }
  } catch (err) {
    setOcrStatus(false);
    showToast('Não foi possível ler o comprovante. Preencha manualmente.', 'error');
    console.error(err);
  }
}

// Pré-processa a imagem para OCR:
// - Escala para mínimo 2000px (melhora precisão do Tesseract)
// - Apaga pixels rosa/avermelhados (texto de fundo de cupons térmicos "Powered by Rede")
async function preprocessImageForOcr(file) {
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
          // Pixels rosa/avermelhados (texto de fundo térmico "Powered by Rede") → branco
          if (r > g + 20 && r > b + 15 && r > 130) {
            gray = 255;
          } else {
            gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
          }
          // Boost de contraste (melhora leitura de cupons térmicos amassados)
          gray = Math.min(255, Math.max(0, (gray - 128) * 1.8 + 128));
          d[i] = d[i + 1] = d[i + 2] = gray;
        }
        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/png')); // dataURL evita problemas de Blob cross-origin
      } catch (err) {
        reject(err);
      }
    };
    img.src = url;
  });
}

async function extrairDaImagem() {
  setOcrStatus(true, 'Iniciando reconhecimento de texto...');
  if (typeof Tesseract === 'undefined') {
    await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
  }
  setOcrStatus(true, 'Processando imagem...');
  let fileParaOcr = currentFile;
  try {
    fileParaOcr = await preprocessImageForOcr(currentFile);
    console.log('[OCR] Pré-processamento aplicado com sucesso');
  } catch (e) {
    console.warn('[OCR] Pré-processamento falhou, usando imagem original:', e);
  }
  setOcrStatus(true, 'Lendo o comprovante (pode levar alguns segundos)...');
  const result = await Tesseract.recognize(fileParaOcr, 'por', {
    logger: m => {
      if (m.status === 'recognizing text') {
        const pct = Math.round((m.progress || 0) * 100);
        setOcrStatus(true, `Lendo comprovante... ${pct}%`);
      }
    }
  });
  setOcrStatus(false);
  parseAndShowOcr(result.data.text);
}

async function extrairDoPdf() {
  setOcrStatus(true, 'Lendo PDF...');
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
  setOcrStatus(false);
  parseAndShowOcr(fullText);
}

function parseAndShowOcr(text) {
  console.log('[OCR] Texto bruto extraído:\n', text);
  const extracted = extractFieldsFromText(text);
  console.log('[OCR] Campos extraídos:', extracted);
  ocrExtracted = extracted;

  // Determina forma de pagamento: do OCR ou do botão já selecionado
  const fp = extracted.formaPagamento || document.getElementById('formaPagamento').value;
  const isCredito  = fp === 'Crédito';
  const isDinheiro = fp === 'Dinheiro';

  const labels = {
    nomeAluno:        'Nome do Aluno',
    nomeDepositante:  isCredito  ? 'Nome da Loja'       : 'Depositante',
    nomeRecebedor:    isCredito  ? 'Maquininha'          : 'Quem Recebeu',
    bancoDepositante: 'Banco Depositante',
    bancoRecebedor:   'Banco Recebedor',
    valor:            'Valor',
    data:             isCredito  ? 'Data da Transação'  : isDinheiro ? 'Data do Pagamento'  : 'Data',
    hora:             isCredito  ? 'Hora da Transação'  : isDinheiro ? 'Hora do Pagamento'  : 'Hora',
    formaPagamento:   'Forma de Pagamento',
  };

  // Crédito: oculta campos de banco (não existem nessa tela)
  const camposVisiveis = isCredito
    ? ['nomeAluno','nomeDepositante','nomeRecebedor','valor','data','hora','formaPagamento']
    : Object.keys(labels);

  document.getElementById('ocrSummary').innerHTML = camposVisiveis.map(k =>
    `<div class="ocr-row">
      <span class="ocr-row-label">${labels[k]}</span>
      <span class="ocr-row-value">${escHtml(extracted[k] || '—')}</span>
    </div>`
  ).join('');

  document.getElementById('ocrModal').style.display = 'flex';
}

function extractFieldsFromText(text) {
  const result = {};
  const full   = text;
  const lower  = full.toLowerCase();

  // ── VALOR ────────────────────────────────────────────────────────────────
  const valorMatch = full.match(/R\$\s*([\d.,]+)/i);
  if (valorMatch) result.valor = 'R$ ' + valorMatch[1].trim();

  // ── DATA — suporta "Sexta, 10/04/2026", ISO, e DD/MM/YY (maquininha) ─────
  const dataMatch =
    full.match(/(?:segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)[,.]?\s*(\d{2}\/\d{2}\/\d{4})/i) ||
    full.match(/data\s+(?:do\s+)?(?:pagamento|dep[oó]sito)?\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i) ||
    full.match(/\b(\d{2}\/\d{2}\/\d{4})\b/) ||
    full.match(/\b(\d{4}-\d{2}-\d{2})\b/)   ||
    full.match(/\b(\d{2}\/\d{2}\/\d{2})\b/);   // DD/MM/YY (maquininha)
  if (dataMatch && dataMatch[1]) {
    const raw = dataMatch[1];
    if (raw.includes('-')) {
      result.data = raw;
    } else {
      const parts = raw.split('/');
      if (parts[2].length === 2) {
        result.data = `20${parts[2]}-${parts[1]}-${parts[0]}`;
      } else {
        result.data = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }
  }

  // ── HORA — suporta "10h39" (Inter/Nubank), "10:39", "às 17:26:55" (Itaú) ──
  const horaMatch =
    full.match(/hor[aá]rio\s+(\d{1,2})h(\d{2})/i)                  ||  // "Horário 10h39"
    full.match(/hor[aá]rio\s*[:\-]\s*(\d{1,2}):(\d{2})/i)          ||  // "Horário: 10:39"
    full.match(/\b(\d{1,2})h(\d{2})\b/i)                           ||  // qualquer "10h39"
    full.match(/[àa]s\s+(\d{1,2}):(\d{2})/i)                       ||  // "às 17:26" / "as 17:26" (Itaú)
    full.match(/\d{2}\/\d{2}\/\d{4}[T\s,]+(\d{2}):(\d{2})/)        ||  // data seguida de hora
    full.match(/\d{4}-\d{2}-\d{2}[T\s]+(\d{2}):(\d{2})/)           ||  // ISO: 2026-04-09T17:26
    full.match(/(?:hora|time)\s*[:\-]\s*(\d{1,2}):(\d{2})/i);          // label genérica

  if (horaMatch && horaMatch[1] && horaMatch[2]) {
    result.hora = String(horaMatch[1]).padStart(2,'0') + ':' + String(horaMatch[2]).padStart(2,'0');
  }

  // ── TIPO DE PAGAMENTO ─────────────────────────────────────────────────────
  if      (lower.includes('pix'))                                   result.formaPagamento = 'Pix';
  else if (lower.includes('débito') || lower.includes('debito'))    result.formaPagamento = 'Débito';
  else if (lower.includes('crédito') || lower.includes('credito'))  result.formaPagamento = 'Crédito';
  else if (lower.includes('dinheiro'))                              result.formaPagamento = 'Dinheiro';

  // ── MAQUININHA — detecta bandeira e nome da loja ──────────────────────────
  // OCR frequentemente distorce nomes (ex: "laranjinha" → "graninha" ou "fAraniinha")
  const MAQUININHA_BRANDS = [
    ['Laranjinha',  /laranjinha|graninha|[lf]?aran[ij]+inha/i], // cobre leituras distorcidas
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

  // Nome da loja: texto imediatamente antes de CNPJ/CNPI na mesma linha
  // Separado da detecção de marca para funcionar mesmo quando a marca não é reconhecida
  const lojaLineMatch =
    full.match(/([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 &.,'"|-]{1,50})\s+(?:CNPJ|CNPI|CNPE)\s*[:.]?\s*\d/i) ||
    full.match(/([A-Z][A-Z0-9 &.,'-]{2,50})\s*\n[\s\S]{0,80}?(?:CNPJ|CNPI)/im);
  if (lojaLineMatch && lojaLineMatch[1]) {
    const loja = lojaLineMatch[1].trim().replace(/^[\s|;"'(]+|[\s|;"')=]+$/g, '');
    const isBrand = MAQUININHA_BRANDS.some(([, re]) => re.test(loja));
    if (!isBrand && loja.length >= 2) result.nomeDepositante = toTitleCase(loja);
  }

  const brandEntry = MAQUININHA_BRANDS.find(([, re]) => re.test(full));
  if (brandEntry) {
    result.nomeRecebedor  = brandEntry[0];
    result.formaPagamento = result.formaPagamento || 'Crédito';
  }

  // Padrão de nome próprio: permite palavras de 1+ chars (ex: "P" em "SANTOS P OLIVEIRA")
  const NOME_PAT       = '((?:[A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇ][A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇa-záéíóúàâêôãõüç]* ?){2,9})';
  const NOME_PAT_LOOSE = '((?:[A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇ][A-Za-záéíóúàâêôãõüç]* ?){2,9})';

  // ── NOME DE QUEM PAGOU → Nome do Aluno + Nome do Depositante ─────────────
  // Inter:    "Quem pagou … Nome LAUDICEA DE JESUS OLIVEIRA"
  // Bradesco: "Pagador\nNome: [NAME]" ou "Origem\nNome: [NAME]"
  // Itaú:     "De\nNome [NAME]" ou "Remetente [NAME]" ou "Enviado por [NAME]"
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

  // ── BANCO DE QUEM PAGOU → Banco Depositante ──────────────────────────────
  const instPagouMatch =
    full.match(/quem\s+pagou[\s\S]{0,400}?institui[çc][aã]o\s+([\wÀ-ÿ .,-]{3,40})/i) ||
    full.match(/\bde\b[\s\S]{0,250}?institui[çc][aã]o\s*[:\-]?\s*([\wÀ-ÿ .,-]{3,40})/i)  ||  // Itaú: "De\n...\nInstituição:"
    full.match(/pagador[\s\S]{0,200}?(?:banco|institui[çc][aã]o)\s*[:\-]?\s*([\wÀ-ÿ .,-]{3,30})/i) ||
    full.match(/(?:origem|remetente)[\s\S]{0,200}?(?:banco|institui[çc][aã]o)\s*[:\-]?\s*([\wÀ-ÿ .,-]{3,30})/i);
  if (instPagouMatch && instPagouMatch[1]) {
    result.bancoDepositante = normalizarBanco(instPagouMatch[1].trim());
  }

  // ── NOME DE QUEM RECEBEU → Campo nomeRecebedor ───────────────────────────
  // Inter:    "Quem recebeu … Nome [NAME]"
  // Bradesco: "Favorecido\nNome: [NAME]" ou "Beneficiário\nNome: [NAME]"
  // Itaú:     "Para\nNome [NAME]" ou "Destinatário [NAME]"
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

  // ── BANCO DE QUEM RECEBEU → Banco Recebedor ──────────────────────────────
  const instRecebeuMatch =
    full.match(/quem\s+recebeu[\s\S]{0,400}?institui[çc][aã]o\s+([\wÀ-ÿ .,-]{3,40})/i) ||
    full.match(/\bpara\b[\s\S]{0,250}?institui[çc][aã]o\s*[:\-]?\s*([\wÀ-ÿ .,-]{3,40})/i) ||  // Itaú: "Para\n...\nInstituição:"
    full.match(/favorecido[\s\S]{0,200}?(?:banco|institui[çc][aã]o)\s*[:\-]?\s*([\wÀ-ÿ .,-]{3,30})/i) ||
    full.match(/benefici[aá]rio[\s\S]{0,200}?(?:banco|institui[çc][aã]o)\s*[:\-]?\s*([\wÀ-ÿ .,-]{3,30})/i) ||
    full.match(/destinat[aá]rio[\s\S]{0,200}?(?:banco|institui[çc][aã]o)\s*[:\-]?\s*([\wÀ-ÿ .,-]{3,30})/i);
  if (instRecebeuMatch && instRecebeuMatch[1]) {
    result.bancoRecebedor = normalizarBanco(instRecebeuMatch[1].trim());
  }

  // ── FALLBACK: detecta bancos pelo nome quando sem seções estruturadas ─────
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

function normalizarBanco(str) {
  const mapa = [
    [/inter/i,           'Inter'],
    [/bradesco/i,        'Bradesco'],
    [/ita[uú]/i,         'Itaú'],
    [/nubank/i,          'Nubank'],
    [/caixa/i,           'Caixa'],
    [/brasil/i,          'Banco do Brasil'],
    [/santander/i,       'Santander'],
    [/c6/i,              'C6'],
    [/picpay/i,          'PicPay'],
    [/mercado/i,         'Mercado Pago'],
    [/sicoob/i,          'Sicoob'],
    [/sicredi/i,         'Sicredi'],
    [/btg/i,             'BTG'],
    [/neon/i,            'Neon'],
    [/next/i,            'Next'],
    [/original/i,        'Original'],
  ];
  for (const [re, nome] of mapa) if (re.test(str)) return nome;
  return str;
}

function confirmarOcr() {
  closeOcrModal();
  if (ocrExtracted.nomeAluno) {
    const firstRow = document.querySelector('#alunosContainer .aluno-row');
    if (firstRow) {
      const el = document.getElementById(`alunoNome_${firstRow.dataset.alunoId}`);
      if (el) el.value = ocrExtracted.nomeAluno;
    }
  }
  if (ocrExtracted.nomeDepositante)  setInput('nomeDepositante',  ocrExtracted.nomeDepositante);
  if (ocrExtracted.nomeRecebedor)    setInput('nomeRecebedor',    ocrExtracted.nomeRecebedor);
  if (ocrExtracted.bancoDepositante) setInput('bancoDepositante', ocrExtracted.bancoDepositante);
  if (ocrExtracted.bancoRecebedor)   setInput('bancoRecebedor',   ocrExtracted.bancoRecebedor);
  if (ocrExtracted.data)             setInput('dataDeposito',     isoToDateInput(ocrExtracted.data));
  if (ocrExtracted.hora)             setInput('horaDeposito',     ocrExtracted.hora);
  if (ocrExtracted.valor) {
    document.getElementById('valorEntrada').value = ocrExtracted.valor.replace('R$ ', '');
  }
  if (ocrExtracted.formaPagamento) {
    document.querySelectorAll('#paymentTypes .payment-btn').forEach(btn => {
      if (btn.dataset.value === ocrExtracted.formaPagamento) selectPayment(btn);
    });
  }
  switchTab('manual');
  showToast('Formulário preenchido! Revise os dados e salve.', 'success');
}

function closeOcrModal(e) {
  if (e && e.target !== document.getElementById('ocrModal')) return;
  document.getElementById('ocrModal').style.display = 'none';
}

// ═══════════════════════════════════════════════════════════════════════════════
// ALUNOS DINÂMICOS
// ═══════════════════════════════════════════════════════════════════════════════
function buildAlunoRowHTML(id, isFirst) {
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
      <input type="text" class="form-input" id="alunoNome_${id}"
             placeholder="Nome completo do aluno" />
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

function initAlunosContainer() {
  nextAlunoId = 0;
  document.getElementById('alunosContainer').innerHTML = buildAlunoRowHTML(nextAlunoId++, true);
}

function addAlunoRow() {
  const id = nextAlunoId++;
  document.getElementById('alunosContainer').insertAdjacentHTML('beforeend', buildAlunoRowHTML(id, false));
}

function removeAlunoRow(id) {
  const row = document.getElementById(`alunoRow_${id}`);
  if (row) row.remove();
}

function getAlunosData() {
  return Array.from(document.querySelectorAll('#alunosContainer .aluno-row')).map(row => {
    const id = row.dataset.alunoId;
    return {
      nome:    document.getElementById(`alunoNome_${id}`).value.trim(),
      parcela: document.getElementById(`alunoParcela_${id}`).value.trim(),
    };
  });
}

function validateAlunos() {
  let ok = true;
  document.getElementById('alunosError').textContent = '';
  document.querySelectorAll('#alunosContainer .aluno-row').forEach(row => {
    const id       = row.dataset.alunoId;
    const nome     = document.getElementById(`alunoNome_${id}`).value.trim();
    const parcela  = document.getElementById(`alunoParcela_${id}`).value.trim();
    const nomeErr  = document.getElementById(`alunoNomeError_${id}`);
    const parErr   = document.getElementById(`alunoParcelaError_${id}`);
    if (!nome)    { nomeErr.textContent = 'Informe o nome do aluno.'; ok = false; }
    else            nomeErr.textContent = '';
    if (!parcela) { parErr.textContent  = 'Informe a parcela.';       ok = false; }
    else            parErr.textContent  = '';
  });
  return ok;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDAÇÃO
// ═══════════════════════════════════════════════════════════════════════════════
function validate() {
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

  if (!validateAlunos()) ok = false;

  return ok;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SALVAR
// ═══════════════════════════════════════════════════════════════════════════════
function salvarLancamento() {
  if (!validate()) {
    showToast('Preencha os campos obrigatórios.', 'error');
    return;
  }

  const alunos = getAlunosData();
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
    comprovante:     currentFileDataUrl || null,
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
  novosRegistros.forEach(r => saveToFirestore('Entradas', r));

  const msg = alunos.length > 1
    ? `${alunos.length} lançamentos salvos com sucesso!`
    : 'Lançamento salvo com sucesso!';
  showToast(msg, 'success');
  limparFormulario();
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIMPAR FORMULÁRIO
// ═══════════════════════════════════════════════════════════════════════════════
function limparFormulario() {
  ['curso','nomeDepositante','nomeRecebedor','bancoDepositante',
   'bancoRecebedor','valorEntrada','dataDeposito','horaDeposito',
   'observacao','formaPagamento'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  document.getElementById('igreja').value      = '';
  document.getElementById('igrejaSearch').value = '';
  document.querySelectorAll('.payment-btn').forEach(b => b.classList.remove('payment-btn--active'));
  unlockPayment();
  ajustarFormPorPagamento('');
  ['cursoError','igrejaError','pagamentoError','nomeDepositanteError',
   'nomeRecebedorError','bancoDepositanteError','bancoRecebedorError','valorError','dataError','alunosError']
    .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = ''; });

  initAlunosContainer();
  removeFile();
}

// ═══════════════════════════════════════════════════════════════════════════════
// RELATÓRIOS
// ═══════════════════════════════════════════════════════════════════════════════
function getCurrentMonthRange() {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth();
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  const toISO = d => d.toISOString().slice(0, 10);
  return { de: toISO(first), ate: toISO(last) };
}

function onTipoRelatorioChange(tipo) {
  tipoRelatorio = tipo;

  document.getElementById('tipoBtnEntradas').classList.toggle('tipo-btn--active', tipo === 'entradas');
  document.getElementById('tipoBtnSaidas').classList.toggle('tipo-btn--active',   tipo === 'saidas');

  // Filtro de Curso só faz sentido para Entradas
  document.getElementById('filtroCursoGrupo').style.display = tipo === 'saidas' ? 'none' : '';
  if (tipo === 'saidas') document.getElementById('filtroCurso').value = '';

  // Preenche o mês vigente automaticamente
  const { de, ate } = getCurrentMonthRange();
  document.getElementById('filtroDataDe').value  = isoToDateInput(de);
  document.getElementById('filtroDataAte').value = isoToDateInput(ate);

  // Mostra seções de resultado
  document.getElementById('reportTipoPrompt').style.display = 'none';
  document.getElementById('reportFilters').style.display    = '';
  document.getElementById('reportActions').style.display    = '';
  document.getElementById('tableWrap').style.display        = '';
  document.getElementById('pagination').style.display       = '';

  carregarRelatorio();
}

function carregarRelatorio() {
  if (!tipoRelatorio) {
    document.getElementById('reportTipoPrompt').style.display = '';
    document.getElementById('reportFilters').style.display    = 'none';
    document.getElementById('reportActions').style.display    = 'none';
    document.getElementById('tableWrap').style.display        = 'none';
    document.getElementById('pagination').style.display       = 'none';
    return;
  }
  const storageKey = tipoRelatorio === 'saidas' ? 'ieteb_saidas' : 'ieteb_lancamentos';
  reportData = JSON.parse(localStorage.getItem(storageKey) || '[]');
  aplicarFiltros();
}

function onFiltroDeChange() {
  const de    = dateInputToISO(document.getElementById('filtroDataDe').value);
  const ateEl = document.getElementById('filtroDataAte');
  const ate   = dateInputToISO(ateEl.value);
  if (de && ate && ate < de) {
    ateEl.value = '';
    document.getElementById('filtroDataModal').style.display = 'flex';
    return;
  }
  aplicarFiltros();
}

function onFiltroAteChange() {
  const de  = dateInputToISO(document.getElementById('filtroDataDe').value);
  const ate = dateInputToISO(document.getElementById('filtroDataAte').value);
  if (de && ate && ate < de) {
    document.getElementById('filtroDataAte').value = '';
    document.getElementById('filtroDataModal').style.display = 'flex';
    return;
  }
  aplicarFiltros();
}

function fecharFiltroDataModal() {
  document.getElementById('filtroDataModal').style.display = 'none';
  const ate = document.getElementById('filtroDataAte');
  ate.value = '';
  ate.focus();
}

function aplicarFiltros() {
  const de        = dateInputToISO(document.getElementById('filtroDataDe').value);
  const ate       = dateInputToISO(document.getElementById('filtroDataAte').value);
  const curso     = document.getElementById('filtroCurso').value;
  const pagamento = document.getElementById('filtroPagamento').value;
  const isSaidas  = tipoRelatorio === 'saidas';

  filteredData = reportData.filter(item => {
    const itemDate = isSaidas ? item.data : item.dataDeposito;
    if (de  && itemDate < de)  return false;
    if (ate && itemDate > ate) return false;
    if (!isSaidas && curso && item.curso !== curso) return false;
    if (pagamento && item.formaPagamento !== pagamento) return false;
    return true;
  });

  currentPage = 1;
  renderTabela();
  renderPaginacao();
  document.getElementById('reportCount').textContent =
    `${filteredData.length} registro${filteredData.length !== 1 ? 's' : ''}`;
}

function limparFiltros() {
  document.getElementById('filtroDataDe').value    = '';
  document.getElementById('filtroDataAte').value   = '';
  document.getElementById('filtroCurso').value     = '';
  document.getElementById('filtroPagamento').value = '';
  aplicarFiltros();
}

function renderTabela() {
  const tbody = document.getElementById('reportTableBody');
  const empty = document.getElementById('tableEmpty');
  const start = (currentPage - 1) * PAGE_SIZE;
  const page  = filteredData.slice(start, start + PAGE_SIZE);

  // Atualiza o cabeçalho conforme o tipo
  const thead = document.getElementById('reportThead');
  if (tipoRelatorio === 'saidas') {
    thead.innerHTML = `<tr>
      <th>Data</th><th>Hora</th>
      <th>Categoria</th><th>Fornecedor</th>
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

  if (!filteredData.length) {
    tbody.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }

  const deleteIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14H6L5 6"/>
    <path d="M10 11v6M14 11v6"/>
    <path d="M9 6V4h6v2"/>
  </svg>`;
  const viewIcon = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>`;

  empty.style.display = 'none';
  tbody.innerHTML = page.map((item, idx) => {
    const badge     = badgePagamento(item.formaPagamento);
    const globalIdx = (currentPage - 1) * PAGE_SIZE + idx;
    const imgCell   = item.comprovante
      ? `<button class="btn-comprovante" onclick="verComprovante(${globalIdx})" title="Ver">${viewIcon} Ver</button>`
      : `<span class="no-comprovante">—</span>`;
    const delBtn = `<button class="btn-delete-row" onclick="pedirExclusao(${globalIdx})" title="Excluir">${deleteIcon}</button>`;

    if (tipoRelatorio === 'saidas') {
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

function renderPaginacao() {
  const total = Math.ceil(filteredData.length / PAGE_SIZE);
  const el    = document.getElementById('pagination');

  if (total <= 1) { el.innerHTML = ''; return; }

  let html = `<button class="page-btn" onclick="goPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>‹</button>`;

  for (let i = 1; i <= total; i++) {
    if (total > 7 && Math.abs(i - currentPage) > 2 && i !== 1 && i !== total) {
      if (i === currentPage - 3 || i === currentPage + 3)
        html += `<span style="padding:0 4px;color:#8090b0">…</span>`;
      continue;
    }
    html += `<button class="page-btn${i === currentPage ? ' page-btn--active' : ''}"
      onclick="goPage(${i})">${i}</button>`;
  }

  html += `<button class="page-btn" onclick="goPage(${currentPage + 1})" ${currentPage === total ? 'disabled' : ''}>›</button>`;
  el.innerHTML = html;
}

function goPage(p) {
  const total = Math.ceil(filteredData.length / PAGE_SIZE);
  if (p < 1 || p > total) return;
  currentPage = p;
  renderTabela();
  renderPaginacao();
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTAÇÃO — PDF (via impressão nativa do browser)
// ═══════════════════════════════════════════════════════════════════════════════
function exportarPDF() {
  if (!filteredData.length) {
    showToast('Nenhum registro para imprimir.', 'error');
    return;
  }

  const agora    = new Date().toLocaleString('pt-BR');
  const isSaidas = tipoRelatorio === 'saidas';
  const titulo   = isSaidas ? 'Relatório de Saídas' : 'Relatório de Lançamentos';

  let cabecalho, linhas;
  if (isSaidas) {
    cabecalho = `<th>Data</th><th>Hora</th><th>Categoria</th><th>Fornecedor</th><th>Pagamento</th><th>Valor</th>`;
    linhas = filteredData.map(item => {
      const data = item.data ? item.data.split('-').reverse().join('/') : '—';
      return `<tr>
        <td>${data}</td><td>${item.hora || '—'}</td>
        <td>${escHtml(item.categoria || '—')}</td>
        <td>${escHtml(item.fornecedor || '—')}</td>
        <td>${escHtml(item.formaPagamento || '—')}</td>
        <td>R$ ${escHtml(item.valor || '0,00')}</td>
      </tr>`;
    }).join('');
  } else {
    cabecalho = `<th>Data</th><th>Hora</th><th>Aluno</th><th>Curso</th><th>Igreja</th>
      <th>Pagamento</th><th>Depositante</th><th>Banco Dep.</th><th>Banco Rec.</th><th>Valor</th>`;
    linhas = filteredData.map(item => {
      const data = item.dataDeposito ? item.dataDeposito.split('-').reverse().join('/') : '—';
      return `<tr>
        <td>${data}</td><td>${item.horaDeposito || '—'}</td>
        <td>${escHtml(item.nomeAluno || '—')}</td>
        <td>${escHtml(item.curso || '—')}</td>
        <td>${escHtml(item.igreja || '—')}</td>
        <td>${escHtml(item.formaPagamento || '—')}</td>
        <td>${escHtml(item.nomeDepositante || '—')}</td>
        <td>${escHtml(item.bancoDepositante || '—')}</td>
        <td>${escHtml(item.bancoRecebedor || '—')}</td>
        <td>R$ ${escHtml(item.valor || '0,00')}</td>
      </tr>`;
    }).join('');
  }

  document.getElementById('printArea').innerHTML = `
    <div class="print-header">
      <h1>IETEB — ${titulo}</h1>
      <p>Gerado em: ${agora} &nbsp;|&nbsp; Total: ${filteredData.length} registro(s)</p>
    </div>
    <table class="print-table">
      <thead><tr>${cabecalho}</tr></thead>
      <tbody>${linhas}</tbody>
    </table>
    <div class="print-footer">IETEB — Centro Educacional Teológico</div>
  `;

  window.print();
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTAÇÃO — EXCEL (CSV → .xlsx nativo via SheetJS)
// ═══════════════════════════════════════════════════════════════════════════════
async function exportarExcel() {
  if (!filteredData.length) {
    showToast('Nenhum registro para exportar.', 'error');
    return;
  }

  if (typeof XLSX === 'undefined') {
    showToast('Carregando biblioteca, aguarde...', '');
    await loadScript('https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js');
  }

  const isSaidas = tipoRelatorio === 'saidas';
  const agora    = new Date().toISOString().slice(0, 10);

  let headers, rows, sheetName, fileName, colWidths;
  if (isSaidas) {
    headers   = ['Data','Hora','Categoria','Fornecedor','Forma de Pagamento','Valor','Observação'];
    rows      = filteredData.map(item => [
      item.data ? item.data.split('-').reverse().join('/') : '',
      item.hora || '',
      item.categoria || '',
      item.fornecedor || '',
      item.formaPagamento || '',
      `R$ ${item.valor || '0,00'}`,
      item.observacao || '',
    ]);
    sheetName = 'Saídas';
    fileName  = `IETEB_Saidas_${agora}.xlsx`;
    colWidths = [8,6,24,28,12,10,24];
  } else {
    headers   = ['Data','Hora','Nome do Aluno','Curso','Igreja','Forma de Pagamento','Depositante','Banco Depositante','Banco Recebedor','Valor','Observação'];
    rows      = filteredData.map(item => [
      item.dataDeposito ? item.dataDeposito.split('-').reverse().join('/') : '',
      item.horaDeposito || '',
      item.nomeAluno || '',
      item.curso || '',
      item.igreja || '',
      item.formaPagamento || '',
      item.nomeDepositante || '',
      item.bancoDepositante || '',
      item.bancoRecebedor || '',
      `R$ ${item.valor || '0,00'}`,
      item.observacao || '',
    ]);
    sheetName = 'Lançamentos';
    fileName  = `IETEB_Lancamentos_${agora}.xlsx`;
    colWidths = [8,6,22,20,28,12,20,16,16,10,20];
  }

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  ws['!cols'] = colWidths.map(w => ({ wch: w }));

  XLSX.writeFile(wb, fileName);
  showToast('Excel exportado com sucesso!', 'success');
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════
// EXCLUSÃO DE LANÇAMENTO
// ═══════════════════════════════════════════════════════════════════════════════
let deleteTargetId = null;

function pedirExclusao(idx) {
  const item = filteredData[idx];
  if (!item) return;
  deleteTargetId = item.id;
  document.getElementById('deleteModal').style.display = 'flex';
}

function confirmarExclusao() {
  if (deleteTargetId === null) return;
  const colName    = tipoRelatorio === 'saidas' ? 'Saídas' : 'Entradas';
  const storageKey = tipoRelatorio === 'saidas' ? 'ieteb_saidas' : 'ieteb_lancamentos';
  const todos = JSON.parse(localStorage.getItem(storageKey) || '[]');
  const novos = todos.filter(l => l.id !== deleteTargetId);
  localStorage.setItem(storageKey, JSON.stringify(novos));
  deleteFromFirestore(colName, deleteTargetId);
  deleteTargetId = null;
  closeDeleteModal();
  carregarRelatorio();
  showToast('Registro excluído.', 'success');
}

function closeDeleteModal(e) {
  if (e && e.target !== document.getElementById('deleteModal')) return;
  document.getElementById('deleteModal').style.display = 'none';
  deleteTargetId = null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL COMPROVANTE
// ═══════════════════════════════════════════════════════════════════════════════
function verComprovante(idx) {
  const item = filteredData[idx];
  if (!item || !item.comprovante) return;

  const modal   = document.getElementById('imgModal');
  const imgEl   = document.getElementById('imgModalImg');
  const pdfEl   = document.getElementById('imgModalPdf');
  const emptyEl = document.getElementById('imgModalEmpty');

  imgEl.style.display   = 'none';
  pdfEl.style.display   = 'none';
  emptyEl.style.display = 'none';

  if (item.comprovante.startsWith('data:image')) {
    imgEl.src           = item.comprovante;
    imgEl.style.display = 'block';
  } else if (item.comprovante.startsWith('data:application/pdf')) {
    pdfEl.src           = item.comprovante;
    pdfEl.style.display = 'block';
  } else {
    emptyEl.style.display = 'flex';
  }

  modal.style.display = 'flex';
}

function closeImgModal(e) {
  if (e && e.target !== document.getElementById('imgModal')) return;
  document.getElementById('imgModal').style.display = 'none';
  document.getElementById('imgModalImg').src = '';
  document.getElementById('imgModalPdf').src = '';
}

// ── Só números ────────────────────────────────────────────────────────────────
function onlyNumbers(input) {
  input.value = input.value.replace(/\D/g, '');
}

function badgePagamento(tipo) {
  const map = {
    Pix:      'pix',
    Débito:   'debito',
    Crédito:  'credito',
    Dinheiro: 'dinheiro',
  };
  const cls = map[tipo] || 'pix';
  return `<span class="badge badge--${cls}">${escHtml(tipo || '—')}</span>`;
}

function truncate(str, max) {
  if (!str) return '—';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function setInput(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function setOcrStatus(show, text) {
  const el = document.getElementById('ocrStatus');
  el.style.display = show ? 'flex' : 'none';
  if (text) document.getElementById('ocrStatusText').textContent = text;
}

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = 'toast' + (type ? ` toast--${type}` : '');
  t.classList.add('toast--show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('toast--show'), 3200);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toTitleCase(str) {
  return str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s    = document.createElement('script');
    s.src      = src;
    s.onload   = resolve;
    s.onerror  = reject;
    document.head.appendChild(s);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAIXA
// ═══════════════════════════════════════════════════════════════════════════════
let caixaMes = '';

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function initCaixa() {
  if (!caixaMes) {
    const now = new Date();
    caixaMes  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  renderCaixa();
}

function caixaMesNavegar(delta) {
  const [year, month] = caixaMes.split('-').map(Number);
  const d  = new Date(year, month - 1 + delta, 1);
  caixaMes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  // Limpa filtros de dia ao trocar de mês
  const deEl  = document.getElementById('caixaDiaFiltroDE');
  const ateEl = document.getElementById('caixaDiaFiltroATE');
  if (deEl)  deEl.value  = '';
  if (ateEl) ateEl.value = '';
  document.getElementById('caixaDiaLimpar').style.display = 'none';
  renderCaixa();
}

function clearCaixaDia() {
  document.getElementById('caixaDiaFiltroDE').value  = '';
  document.getElementById('caixaDiaFiltroATE').value = '';
  document.getElementById('caixaDiaLimpar').style.display = 'none';
  renderCaixa();
}

function onCaixaFiltroDeBlur() {
  const deEl  = document.getElementById('caixaDiaFiltroDE');
  const ateEl = document.getElementById('caixaDiaFiltroATE');
  if (deEl.value && ateEl.value && dateInputToISO(ateEl.value) < dateInputToISO(deEl.value)) {
    ateEl.value = '';
    document.getElementById('caixaDataModal').style.display = 'flex';
    return;
  }
  renderCaixa();
}

function onCaixaFiltroAteBlur() {
  const deEl  = document.getElementById('caixaDiaFiltroDE');
  const ateEl = document.getElementById('caixaDiaFiltroATE');
  if (deEl.value && ateEl.value && dateInputToISO(ateEl.value) < dateInputToISO(deEl.value)) {
    ateEl.value = '';
    document.getElementById('caixaDataModal').style.display = 'flex';
    return;
  }
  renderCaixa();
}

// ── Utilitários de data ────────────────────────────────────────────────────────
function dateInputToISO(val) {
  if (!val || val.length < 10) return '';
  const [d, m, y] = val.split('/');
  if (!d || !m || !y || y.length !== 4) return '';
  return `${y}-${m}-${d}`;
}

function isoToDateInput(iso) {
  if (!iso || iso.length < 10) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function onDateInput(el) {
  let digits = el.value.replace(/\D/g, '').slice(0, 8);
  if (digits.length > 4) {
    el.value = `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4)}`;
  } else if (digits.length > 2) {
    el.value = `${digits.slice(0,2)}/${digits.slice(2)}`;
  } else {
    el.value = digits;
  }
}

function onDateBlur(el, callback) {
  let digits = el.value.replace(/\D/g, '');
  if (digits) {
    if (digits.length === 7) digits = '0' + digits;
    if (digits.length === 8) {
      const dd = digits.slice(0,2), mm = digits.slice(2,4), yyyy = digits.slice(4,8);
      const date  = new Date(+yyyy, +mm - 1, +dd);
      const today = new Date(); today.setHours(23, 59, 59, 999);
      const valid = !isNaN(date.getTime()) && date <= today
                    && date.getDate() === +dd && date.getMonth() + 1 === +mm;
      el.value = valid ? `${dd}/${mm}/${yyyy}` : '';
    } else {
      el.value = '';
    }
  }
  if (callback && typeof window[callback] === 'function') window[callback]();
}

function parseBRL(str) {
  if (!str) return 0;
  return parseFloat(String(str).replace(/\./g, '').replace(',', '.')) || 0;
}

function formatBRL(num) {
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getSaldoAbertura() {
  return JSON.parse(localStorage.getItem('ieteb_saldo_abertura') || '{"dinheiro":"","conta":""}');
}


function renderCaixa() {
  const [year, month] = caixaMes.split('-').map(Number);
  document.getElementById('caixaMesLabel').textContent = `${MESES[month - 1]} ${year}`;

  const mesInicio = `${caixaMes}-01`;
  const ultimoDia = new Date(year, month, 0).getDate();
  const mesFim    = `${caixaMes}-${String(ultimoDia).padStart(2, '0')}`;

  // Filtro De / Até
  const deEl  = document.getElementById('caixaDiaFiltroDE');
  const ateEl = document.getElementById('caixaDiaFiltroATE');
  if (deEl)  { deEl.min  = mesInicio; deEl.max  = mesFim; }
  if (ateEl) { ateEl.min = mesInicio; ateEl.max = mesFim; }

  const deISO     = deEl  && deEl.value.length  === 10 ? dateInputToISO(deEl.value)  : '';
  const ateISO    = ateEl && ateEl.value.length === 10 ? dateInputToISO(ateEl.value) : '';
  const filtroDE  = deISO  && deISO  >= mesInicio && deISO  <= mesFim ? deISO  : mesInicio;
  const filtroATE = ateISO && ateISO >= mesInicio && ateISO <= mesFim ? ateISO : mesFim;
  const filtroAtivo = (deEl && deEl.value) || (ateEl && ateEl.value);
  document.getElementById('caixaDiaLimpar').style.display = filtroAtivo ? 'flex' : 'none';

  // Todos os dados históricos
  const todasEntradas = JSON.parse(localStorage.getItem('ieteb_lancamentos') || '[]');
  const todasSaidas   = JSON.parse(localStorage.getItem('ieteb_saidas')      || '[]');

  // Dados ANTERIORES ao mês (para calcular saldo anterior)
  const entradasAnt = todasEntradas.filter(i => i.dataDeposito && i.dataDeposito < mesInicio);
  const saidasAnt   = todasSaidas.filter(i => i.data && i.data < mesInicio);

  // Dados DO período filtrado
  const entradas = todasEntradas.filter(i => i.dataDeposito && i.dataDeposito >= filtroDE && i.dataDeposito <= filtroATE);
  const saidas   = todasSaidas.filter(i => i.data && i.data >= filtroDE && i.data <= filtroATE);

  const sumBy = (arr, tipo) =>
    arr.filter(i => i.formaPagamento === tipo).reduce((s, i) => s + parseBRL(i.valor), 0);

  // Saldo de abertura do sistema
  const ab = getSaldoAbertura();
  const abMaos  = parseBRL(ab.dinheiro);
  const abConta = parseBRL(ab.conta);

  // Saldo do mês anterior (abertura + tudo que aconteceu antes deste mês)
  const antMaos  = abMaos  + sumBy(entradasAnt, 'Dinheiro') - sumBy(saidasAnt, 'Dinheiro');
  const antConta = abConta + sumBy(entradasAnt, 'Pix') + sumBy(entradasAnt, 'Débito') + sumBy(entradasAnt, 'Crédito') - sumBy(saidasAnt, 'Pix');
  const antTotal = antMaos + antConta;

  // Entradas do período
  const eDin = sumBy(entradas, 'Dinheiro');
  const ePix = sumBy(entradas, 'Pix');
  const eDeb = sumBy(entradas, 'Débito');
  const eCre = sumBy(entradas, 'Crédito');
  const eTotal = eDin + ePix + eDeb + eCre;

  // Saídas do período
  const sDin   = sumBy(saidas, 'Dinheiro');
  const sPix   = sumBy(saidas, 'Pix');
  const sTotal = sDin + sPix;

  // Saldo atual
  const saldoMaos  = antMaos  + eDin - sDin;
  const saldoConta = antConta + ePix + eDeb + eCre - sPix;
  const saldoTotal = saldoMaos + saldoConta;

  const cls = v => v >= 0 ? 'caixa-saldo-item-value--positivo' : 'caixa-saldo-item-value--negativo';
  const dot = tipo => `<span class="caixa-dot caixa-dot--${tipo}"></span>`;

  // Rótulos dinâmicos conforme filtro De/Até
  const periodoLabel = filtroAtivo
    ? `de ${deEl.value || isoToDateInput(mesInicio)} até ${ateEl.value || isoToDateInput(mesFim)}`
    : `do Mês`;

  document.getElementById('caixaEntradasHeader').innerHTML = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
    </svg>
    Entradas ${periodoLabel}`;

  document.getElementById('caixaSaidasHeader').innerHTML = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
    </svg>
    Saídas ${periodoLabel}`;

  // Card Saldo Anterior
  document.getElementById('caixaSaldoAnteriorDisplay').innerHTML = `
    <div class="caixa-anterior-item">
      <div class="caixa-saldo-item-label">Em Mãos (Dinheiro)</div>
      <div class="caixa-saldo-item-value ${cls(antMaos)}" style="font-size:1.1rem">R$ ${formatBRL(antMaos)}</div>
    </div>
    <div class="caixa-anterior-sep"></div>
    <div class="caixa-anterior-item">
      <div class="caixa-saldo-item-label">Em Conta (Pix / Déb / Créd)</div>
      <div class="caixa-saldo-item-value ${cls(antConta)}" style="font-size:1.1rem">R$ ${formatBRL(antConta)}</div>
    </div>
    <div class="caixa-anterior-sep"></div>
    <div class="caixa-anterior-item">
      <div class="caixa-saldo-item-label">Total</div>
      <div class="caixa-saldo-item-value ${cls(antTotal)}" style="font-size:1.2rem;font-weight:800">R$ ${formatBRL(antTotal)}</div>
    </div>`;

  // Card Entradas
  document.getElementById('caixaEntradas').innerHTML = `
    <div class="caixa-row"><span class="caixa-row-label">${dot('dinheiro')} Dinheiro</span><span class="caixa-row-value">R$ ${formatBRL(eDin)}</span></div>
    <div class="caixa-row"><span class="caixa-row-label">${dot('pix')} PIX</span><span class="caixa-row-value">R$ ${formatBRL(ePix)}</span></div>
    <div class="caixa-row"><span class="caixa-row-label">${dot('debito')} Débito</span><span class="caixa-row-value">R$ ${formatBRL(eDeb)}</span></div>
    <div class="caixa-row"><span class="caixa-row-label">${dot('credito')} Crédito</span><span class="caixa-row-value">R$ ${formatBRL(eCre)}</span></div>
    <div class="caixa-row caixa-row--total"><span class="caixa-row-label">Total</span><span class="caixa-row-value">R$ ${formatBRL(eTotal)}</span></div>`;

  // Card Saídas
  document.getElementById('caixaSaidas').innerHTML = `
    <div class="caixa-row"><span class="caixa-row-label">${dot('dinheiro')} Dinheiro</span><span class="caixa-row-value">R$ ${formatBRL(sDin)}</span></div>
    <div class="caixa-row"><span class="caixa-row-label">${dot('pix')} PIX</span><span class="caixa-row-value">R$ ${formatBRL(sPix)}</span></div>
    <div class="caixa-row caixa-row--total"><span class="caixa-row-label">Total</span><span class="caixa-row-value">R$ ${formatBRL(sTotal)}</span></div>`;

  // Card Saldo Atual
  document.getElementById('caixaSaldoAtual').innerHTML = `
    <div class="caixa-saldo-item">
      <div class="caixa-saldo-item-label">Em Mãos (Dinheiro)</div>
      <div class="caixa-saldo-item-value ${cls(saldoMaos)}">R$ ${formatBRL(saldoMaos)}</div>
    </div>
    <div class="caixa-saldo-item">
      <div class="caixa-saldo-item-label">Em Conta (Pix / Débito / Crédito)</div>
      <div class="caixa-saldo-item-value ${cls(saldoConta)}">R$ ${formatBRL(saldoConta)}</div>
    </div>
    <div class="caixa-saldo-item caixa-saldo-item--total">
      <div class="caixa-saldo-item-label">Saldo Total</div>
      <div class="caixa-saldo-item-value ${cls(saldoTotal)}">R$ ${formatBRL(saldoTotal)}</div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SAÍDAS
// ═══════════════════════════════════════════════════════════════════════════════
let currentFileSaida        = null;
let currentFileDataUrlSaida = null;
let ocrExtractedSaida       = {};

function switchTabSaida(tab) {
  const isManual = tab === 'manual';
  document.getElementById('panelSaidaManual').classList.toggle('tab-panel--hidden', !isManual);
  document.getElementById('panelSaidaUpload').classList.toggle('tab-panel--hidden', isManual);
  document.getElementById('tabSaidaManual').classList.toggle('tab-btn--active', isManual);
  document.getElementById('tabSaidaUpload').classList.toggle('tab-btn--active', !isManual);
  document.getElementById('tabSaidaManual').setAttribute('aria-selected', isManual);
  document.getElementById('tabSaidaUpload').setAttribute('aria-selected', !isManual);
  document.getElementById('btnLimparSaida').style.display = isManual ? '' : 'none';
}

function lockPaymentSaida() {
  document.getElementById('paymentTypesSaida').classList.add('payment-types--locked');
}

function unlockPaymentSaida() {
  document.getElementById('paymentTypesSaida').classList.remove('payment-types--locked');
}

function selectPaymentSaida(btn) {
  document.querySelectorAll('#paymentTypesSaida .payment-btn').forEach(b => b.classList.remove('payment-btn--active'));
  btn.classList.add('payment-btn--active');
  document.getElementById('saidaFormaPagamento').value = btn.dataset.value;
  document.getElementById('saidaPagamentoError').textContent = '';
  lockPaymentSaida();
}

function onDragOverSaida(e) {
  e.preventDefault();
  document.getElementById('dropZoneSaida').classList.add('upload-area--dragover');
}

function onDragLeaveSaida() {
  document.getElementById('dropZoneSaida').classList.remove('upload-area--dragover');
}

function onDropSaida(e) {
  e.preventDefault();
  document.getElementById('dropZoneSaida').classList.remove('upload-area--dragover');
  const file = e.dataTransfer.files[0];
  if (file) handleFileSaida(file);
}

function onFileSelectedSaida(input) {
  const file = input.files[0];
  if (file) handleFileSaida(file);
}

function handleFileSaida(file) {
  const allowed = ['image/png','image/jpeg','image/jpg','image/gif','image/webp','application/pdf'];
  if (!allowed.includes(file.type)) {
    showToast('Formato não suportado. Use imagem ou PDF.', 'error');
    return;
  }
  currentFileSaida = file;
  document.getElementById('previewFileNameSaida').textContent = file.name;
  document.getElementById('uploadPreviewSaida').style.display = 'block';

  const img = document.getElementById('previewImgSaida');
  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = e => {
      currentFileDataUrlSaida = e.target.result;
      img.src = e.target.result;
      img.style.display = 'block';
    };
    reader.readAsDataURL(file);
  } else {
    img.style.display = 'none';
    currentFileDataUrlSaida = null;
  }

  document.getElementById('btnLerNF').style.display = 'flex';
}

function removeFileSaida() {
  currentFileSaida        = null;
  currentFileDataUrlSaida = null;
  document.getElementById('uploadPreviewSaida').style.display   = 'none';
  document.getElementById('previewImgSaida').style.display      = 'none';
  document.getElementById('previewImgSaida').src                = '';
  document.getElementById('previewFileNameSaida').textContent   = '';
  document.getElementById('btnLerNF').style.display             = 'none';
  document.getElementById('ocrStatusSaida').style.display       = 'none';
  document.getElementById('fileInputSaida').value               = '';
}

async function lerNF() {
  if (!currentFileSaida) return;
  setOcrStatusSaida(true, 'Carregando arquivo...');
  try {
    if (currentFileSaida.type === 'application/pdf') {
      await extrairDoPdfSaida();
    } else {
      await extrairDaImagemSaida();
    }
  } catch (err) {
    setOcrStatusSaida(false);
    showToast('Não foi possível ler a Nota Fiscal. Preencha manualmente.', 'error');
    console.error(err);
  }
}

async function extrairDaImagemSaida() {
  setOcrStatusSaida(true, 'Iniciando reconhecimento de texto...');
  if (typeof Tesseract === 'undefined') {
    await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
  }
  setOcrStatusSaida(true, 'Processando imagem...');
  let fileParaOcr = currentFileSaida;
  try {
    fileParaOcr = await preprocessImageForOcr(currentFileSaida);
  } catch (e) {
    console.warn('[OCR NF] Pré-processamento falhou, usando original:', e);
  }
  setOcrStatusSaida(true, 'Lendo nota fiscal...');
  const result = await Tesseract.recognize(fileParaOcr, 'por', {
    logger: m => {
      if (m.status === 'recognizing text') {
        const pct = Math.round((m.progress || 0) * 100);
        setOcrStatusSaida(true, `Lendo nota fiscal... ${pct}%`);
      }
    }
  });
  setOcrStatusSaida(false);
  parseAndShowOcrSaida(result.data.text);
}

async function extrairDoPdfSaida() {
  setOcrStatusSaida(true, 'Lendo PDF...');
  if (typeof pdfjsLib === 'undefined') {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const arrayBuffer = await currentFileSaida.arrayBuffer();
  const pdf         = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let   fullText    = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map(item => item.str).join(' ') + '\n';
  }
  setOcrStatusSaida(false);
  parseAndShowOcrSaida(fullText);
}

function extractFieldsFromNF(text) {
  const result = {};
  const full   = text;
  const lower  = full.toLowerCase();

  // ── VALOR: padrões específicos + fallback pelo maior número XX,XX ─────────
  const vExato =
    full.match(/valor\s+(?:total|pago|a\s+pagar)\s+r?[s$5]?\s*([0-9]{1,6}[,\.][0-9]{2})/i) ||
    full.match(/total\s+(?:a\s+pagar|geral)?\s*r?[s$5]?\s*[:\-]?\s*([0-9]{1,6}[,\.][0-9]{2})/i) ||
    full.match(/r?\$\s*([0-9]{1,6}[,\.][0-9]{2})/i);
  if (vExato) {
    result.valor = 'R$ ' + vExato[1].trim();
  } else {
    // Fallback: pega TODOS os valores no formato XX,XX e usa o MAIOR (total)
    const todos = [...full.matchAll(/\b([0-9]{1,6},[0-9]{2})\b/g)]
      .map(m => parseFloat(m[1].replace(',', '.')))
      .filter(v => v > 1);
    if (todos.length) {
      const maior = Math.max(...todos);
      result.valor = 'R$ ' + maior.toFixed(2).replace('.', ',');
    }
  }

  // Data
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

  // ── HORA: prioriza timestamp NF (DD/MM/YYYY HH:MM) ──────────────────────
  const horaMatch =
    full.match(/\d{2}\/\d{2}\/\d{4}[\sT,]+(\d{2}):(\d{2})/) ||  // NF: "18/04/2026 20:54"
    full.match(/\d{4}-\d{2}-\d{2}[\sT]+(\d{2}):(\d{2})/)    ||  // ISO
    full.match(/\b(\d{1,2})h(\d{2})\b/i)                     ||  // "10h39"
    full.match(/[àa]s\s+(\d{1,2}):(\d{2})/i)                 ||  // "às 17:26"
    full.match(/(?:hora|time)\s*[:\-]\s*(\d{1,2}):(\d{2})/i);
  if (horaMatch && horaMatch[1] && horaMatch[2]) {
    result.hora = String(horaMatch[1]).padStart(2,'0') + ':' + String(horaMatch[2]).padStart(2,'0');
  }

  // ── FORNECEDOR: múltiplas estratégias em cascata ─────────────────────────
  {
    let nome = null;

    // 1. Nome antes do CNPJ na mesma linha
    const m1 = full.match(/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 &.,'"|-]{3,60})\s+(?:CNPJ|CPF)\s*[:.]?\s*[\d]/i);
    // 2. Nome após número de CNPJ na mesma linha: "CNPJ: XX... NOME"
    const m2 = full.match(/(?:CNPJ|CPF)\s*[:.]?\s*[\d.\/\-]+\s+([A-Z][A-Z0-9 &.,']{3,60})/i);
    // 3. Razão Social explícita
    const m3 = full.match(/raz[aã]o\s+social\s*[:\-]?\s*([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 &.,'|-]{2,60})/i);
    // 4. Nome com sufixo jurídico (LTDA, ME, EIRELI, S.A., etc.)
    const m4 = full.match(/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 &.,']{2,55}(?:\s+(?:LTDA|ME|EPP|EIRELI|S\.?A\.?|S\/A|MICROEMPRESA)))/i);

    if      (m1) nome = m1[1];
    else if (m2) nome = m2[1];
    else if (m3) nome = m3[1];
    else if (m4) nome = m4[1];

    if (nome) {
      const n = nome.trim().replace(/^[\s|;"'(]+|[\s|;"')=]+$/g, '');
      if (n.length >= 3) result.fornecedor = toTitleCase(n);
    }
  }

  // ── FORMA DE PAGAMENTO: cartão crédito/débito, pix, dinheiro ─────────────
  if      (/cart[aã]o\s+de\s+cr[eé]dito|cr[eé]dito/i.test(lower)) result.formaPagamento = 'Crédito';
  else if (/cart[aã]o\s+de\s+d[eé]bito|d[eé]bito/i.test(lower))   result.formaPagamento = 'Débito';
  else if (lower.includes('pix'))                                    result.formaPagamento = 'Pix';
  else if (lower.includes('dinheiro'))                               result.formaPagamento = 'Dinheiro';

  return result;
}

function parseAndShowOcrSaida(text) {
  console.log('[OCR NF] Texto bruto extraído:\n', text);
  const extracted = extractFieldsFromNF(text);
  console.log('[OCR NF] Campos extraídos:', extracted);
  ocrExtractedSaida = extracted;

  const labels = {
    fornecedor: 'Fornecedor',
    valor:      'Valor',
    data:       'Data',
    hora:       'Hora',
  };

  document.getElementById('ocrSummarySaida').innerHTML = Object.keys(labels).map(k =>
    `<div class="ocr-row">
      <span class="ocr-row-label">${labels[k]}</span>
      <span class="ocr-row-value">${escHtml(extracted[k] || '—')}</span>
    </div>`
  ).join('');

  document.getElementById('ocrModalSaida').style.display = 'flex';
}

function confirmarOcrSaida() {
  closeOcrModalSaida();
  if (ocrExtractedSaida.fornecedor)     setInput('saidaFornecedor', ocrExtractedSaida.fornecedor);
  if (ocrExtractedSaida.valor)          document.getElementById('saidaValor').value = ocrExtractedSaida.valor.replace('R$ ', '');
  if (ocrExtractedSaida.data)           setInput('saidaData', isoToDateInput(ocrExtractedSaida.data));
  if (ocrExtractedSaida.hora)           setInput('saidaHora', ocrExtractedSaida.hora);
  switchTabSaida('manual');
  showToast('Formulário preenchido! Revise os dados e salve.', 'success');
}

function closeOcrModalSaida(e) {
  if (e && e.target !== document.getElementById('ocrModalSaida')) return;
  document.getElementById('ocrModalSaida').style.display = 'none';
}

function setOcrStatusSaida(show, text) {
  const el = document.getElementById('ocrStatusSaida');
  el.style.display = show ? 'flex' : 'none';
  if (text) document.getElementById('ocrStatusTextSaida').textContent = text;
}

function validateSaida() {
  let ok = true;
  const checks = [
    { errId: 'saidaCategoriaError',  msg: 'Selecione a categoria.',               val: () => document.getElementById('saidaCategoria').value },
    { errId: 'saidaFornecedorError', msg: 'Informe o fornecedor ou beneficiário.', val: () => document.getElementById('saidaFornecedor').value.trim() },
    { errId: 'saidaPagamentoError',  msg: 'Selecione a forma de pagamento.',       val: () => document.getElementById('saidaFormaPagamento').value },
    { errId: 'saidaValorError',      msg: 'Informe o valor.',                      val: () => document.getElementById('saidaValor').value.trim() },
    { errId: 'saidaDataError',       msg: 'Informe a data.',                       val: () => document.getElementById('saidaData').value },
  ];
  checks.forEach(c => {
    const el = document.getElementById(c.errId);
    if (!c.val()) { el.textContent = c.msg; ok = false; }
    else            el.textContent = '';
  });
  return ok;
}

function salvarSaida() {
  if (!validateSaida()) {
    showToast('Preencha os campos obrigatórios.', 'error');
    return;
  }

  const registro = {
    id:            Date.now(),
    categoria:     document.getElementById('saidaCategoria').value,
    fornecedor:    document.getElementById('saidaFornecedor').value.trim(),
    formaPagamento:document.getElementById('saidaFormaPagamento').value,
    valor:         document.getElementById('saidaValor').value.trim(),
    data:          dateInputToISO(document.getElementById('saidaData').value),
    hora:          document.getElementById('saidaHora').value,
    observacao:    document.getElementById('saidaObservacao').value.trim(),
    comprovante:   currentFileDataUrlSaida || null,
    criadoEm:      new Date().toISOString(),
  };

  const existing = JSON.parse(localStorage.getItem('ieteb_saidas') || '[]');
  existing.unshift(registro);
  localStorage.setItem('ieteb_saidas', JSON.stringify(existing));
  saveToFirestore('Saídas', registro);

  showToast('Saída salva com sucesso!', 'success');
  limparSaida();
}

function limparSaida() {
  ['saidaCategoria','saidaFornecedor','saidaFormaPagamento',
   'saidaValor','saidaData','saidaHora','saidaObservacao'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.querySelectorAll('#paymentTypesSaida .payment-btn').forEach(b => b.classList.remove('payment-btn--active'));
  unlockPaymentSaida();
  ['saidaCategoriaError','saidaFornecedorError','saidaPagamentoError',
   'saidaValorError','saidaDataError'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });
  removeFileSaida();
}

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
let dashMes = '';
const dashCharts = {};

function initDashboard() {
  if (!dashMes) {
    const now = new Date();
    dashMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  renderDashboard();
}

function dashMesNavegar(delta) {
  const [year, month] = dashMes.split('-').map(Number);
  const d = new Date(year, month - 1 + delta, 1);
  dashMes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  renderDashboard();
}

function loadChartJs() {
  return new Promise((resolve, reject) => {
    if (window.Chart) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js';
    s.onload  = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function renderDashboard() {
  const [year, month] = dashMes.split('-').map(Number);
  document.getElementById('dashMesLabel').textContent = `${MESES[month - 1]} ${year}`;

  const mesInicio = `${dashMes}-01`;
  const ultimoDia = new Date(year, month, 0).getDate();
  const mesFim    = `${dashMes}-${String(ultimoDia).padStart(2, '0')}`;

  const todasEntradas = JSON.parse(localStorage.getItem('ieteb_lancamentos') || '[]');
  const todasSaidas   = JSON.parse(localStorage.getItem('ieteb_saidas')      || '[]');

  const entradas = todasEntradas.filter(i => i.dataDeposito && i.dataDeposito >= mesInicio && i.dataDeposito <= mesFim);
  const saidas   = todasSaidas.filter(i => i.data && i.data >= mesInicio && i.data <= mesFim);

  const totalEntradas = entradas.reduce((s, i) => s + parseBRL(i.valor), 0);
  const totalSaidas   = saidas.reduce((s, i) => s + parseBRL(i.valor), 0);
  const saldoMes      = totalEntradas - totalSaidas;

  // Summary cards
  document.getElementById('dashTotalEntradas').textContent = `R$ ${formatBRL(totalEntradas)}`;
  document.getElementById('dashTotalSaidas').textContent   = `R$ ${formatBRL(totalSaidas)}`;
  const saldoEl = document.getElementById('dashSaldoMes');
  saldoEl.textContent = `R$ ${formatBRL(saldoMes)}`;
  saldoEl.style.color = saldoMes >= 0 ? '' : 'var(--danger, #e53e3e)';

  // Agrupar entradas por curso
  const porCurso = {};
  entradas.forEach(i => {
    const cursos = Array.isArray(i.alunos)
      ? i.alunos.map(a => a.curso).filter(Boolean)
      : [i.curso].filter(Boolean);
    cursos.forEach(c => { porCurso[c] = (porCurso[c] || 0) + parseBRL(i.valor) / (cursos.length || 1); });
  });

  // Agrupar saídas por categoria
  const porCategoria = {};
  saidas.forEach(i => {
    const cat = i.categoria || 'Outros';
    porCategoria[cat] = (porCategoria[cat] || 0) + parseBRL(i.valor);
  });

  try {
    await loadChartJs();
  } catch (e) {
    console.error('Falha ao carregar Chart.js', e);
    return;
  }

  renderChartEntradas(porCurso);
  renderChartSaidas(porCategoria);
}

const DASH_COLORS = [
  '#4F81BD','#C0504D','#9BBB59','#8064A2','#4BACC6',
  '#F79646','#2C4770','#7B3F3F','#5A6E3C','#5B3F7A',
];

function renderChartEntradas(porCurso) {
  const wrap  = document.getElementById('wrapEntradasCurso');

  if (dashCharts.entradas) { dashCharts.entradas.destroy(); delete dashCharts.entradas; }

  const labels = Object.keys(porCurso);
  const values = Object.values(porCurso);

  if (!labels.length) {
    wrap.innerHTML = '<div class="dash-empty">Nenhuma entrada neste mês</div>';
    return;
  }

  // Restaurar canvas se foi substituído pelo empty state
  if (!wrap.querySelector('canvas')) {
    wrap.innerHTML = '<canvas id="chartEntradasCurso"></canvas>';
  }

  const ctx = document.getElementById('chartEntradasCurso').getContext('2d');
  const colors = labels.map((_, i) => DASH_COLORS[i % DASH_COLORS.length]);

  dashCharts.entradas = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#fff', hoverOffset: 8 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, padding: 14, font: { size: 12 } },
        },
        tooltip: {
          callbacks: {
            label: ctx => ` R$ ${formatBRL(ctx.parsed)}`,
          },
        },
      },
    },
  });
}

function renderChartSaidas(porCategoria) {
  const wrap   = document.getElementById('wrapDespesasCategoria');

  if (dashCharts.saidas) { dashCharts.saidas.destroy(); delete dashCharts.saidas; }

  const labels = Object.keys(porCategoria).sort((a, b) => porCategoria[b] - porCategoria[a]);
  const values = labels.map(l => porCategoria[l]);

  if (!labels.length) {
    wrap.innerHTML = '<div class="dash-empty">Nenhuma despesa neste mês</div>';
    return;
  }

  if (!wrap.querySelector('canvas')) {
    wrap.innerHTML = '<canvas id="chartDespesasCategoria"></canvas>';
  }

  const ctx = document.getElementById('chartDespesasCategoria').getContext('2d');
  const colors = labels.map((_, i) => DASH_COLORS[i % DASH_COLORS.length]);

  dashCharts.saidas = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` R$ ${formatBRL(ctx.parsed.x)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(0,0,0,0.06)' },
          ticks: {
            callback: v => `R$ ${formatBRL(v)}`,
            font: { size: 11 },
          },
        },
        y: {
          grid: { display: false },
          ticks: { font: { size: 12 } },
        },
      },
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════════════════════
(function checkAuth() {
  if (sessionStorage.getItem('ieteb_auth') === '1') {
    const el = document.getElementById('loginScreen');
    if (el) el.remove();
  }
})();

function openLogoutModal() {
  document.getElementById('logoutModal').style.display = 'flex';
  closeSidebar();
}

function closeLogoutModal(e) {
  if (e && e.target !== document.getElementById('logoutModal')) return;
  document.getElementById('logoutModal').style.display = 'none';
}

function confirmarLogout() {
  sessionStorage.removeItem('ieteb_auth');
  document.getElementById('logoutModal').style.display = 'none';

  // Reconstrói a tela de login e exibe com fade-in
  const ls = document.createElement('div');
  ls.id = 'loginScreen';
  ls.className = 'ls ls--exit';
  ls.innerHTML = `
    <div class="ls-bg">
      <div class="ls-orb ls-orb--1"></div>
      <div class="ls-orb ls-orb--2"></div>
      <div class="ls-orb ls-orb--3"></div>
      <div class="ls-grid"></div>
    </div>
    <div class="ls-card" id="loginCard">
      <div class="ls-card-accent"></div>
      <div class="ls-logo-ring">
        <img src="assets/images/logo-ieteb-moderno.jpg" alt="IETEB" class="ls-logo" />
      </div>
      <div class="ls-header">
        <h1 class="ls-title">Bem-vindo</h1>
        <p class="ls-subtitle">Sistema de Gestão Financeira</p>
      </div>
      <form class="ls-form" onsubmit="handleLogin(event)" novalidate>
        <div class="ls-field">
          <label class="ls-label">Usuário</label>
          <div class="ls-input-wrap">
            <svg class="ls-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <input type="text" id="loginUsuario" class="ls-input" placeholder="Digite seu usuário" autocomplete="username" spellcheck="false" oninput="document.getElementById('loginUsuarioError').textContent=''" />
          </div>
          <span class="ls-field-error" id="loginUsuarioError"></span>
        </div>
        <div class="ls-field">
          <label class="ls-label">Senha</label>
          <div class="ls-input-wrap">
            <svg class="ls-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <input type="password" id="loginSenha" class="ls-input ls-input--pw" placeholder="Digite sua senha" autocomplete="current-password" oninput="document.getElementById('loginSenhaError').textContent=''" />
            <button type="button" class="ls-eye" id="loginEyeBtn" onclick="toggleLoginPw()" title="Mostrar/ocultar senha">
              <svg id="loginEyeIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            </button>
          </div>
          <span class="ls-field-error" id="loginSenhaError"></span>
        </div>
        <div class="ls-error" id="loginError"></div>
        <button type="submit" class="ls-btn" id="loginBtn">
          <span id="loginBtnText">Entrar</span>
          <svg class="ls-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <line x1="5" y1="12" x2="19" y2="12"/>
            <polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>
      </form>
      <div class="ls-footer">IETEB &copy; 2026 &nbsp;·&nbsp; Todos os direitos reservados</div>
    </div>`;
  document.body.appendChild(ls);
  window.scrollTo(0, 0);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => ls.classList.remove('ls--exit'));
  });
}

function handleLogin(e) {
  e.preventDefault();
  const userEl   = document.getElementById('loginUsuario');
  const passEl   = document.getElementById('loginSenha');
  const errEl    = document.getElementById('loginError');
  const userErr  = document.getElementById('loginUsuarioError');
  const passErr  = document.getElementById('loginSenhaError');

  errEl.textContent  = '';
  userErr.textContent = '';
  passErr.textContent = '';

  const user = userEl.value.trim();
  const pass = passEl.value;

  let ok = true;
  if (!user) { userErr.textContent = 'Campo obrigatório.'; ok = false; }
  if (!pass) { passErr.textContent = 'Campo obrigatório.'; ok = false; }
  if (!ok) return;

  if (user === 'Admin' && pass === 'IETEB@2030') {
    sessionStorage.setItem('ieteb_auth', '1');
    const screen = document.getElementById('loginScreen');
    screen.classList.add('ls--exit');
    setTimeout(() => { screen.remove(); window.scrollTo(0, 0); }, 520);
  } else {
    errEl.textContent = 'Ops! Não conseguimos entrar com esses dados. Confirme seu usuário e senha e tente novamente.';
    const card = document.getElementById('loginCard');
    card.classList.remove('ls-card--shake');
    void card.offsetWidth;
    card.classList.add('ls-card--shake');
  }
}

function toggleLoginPw() {
  const input = document.getElementById('loginSenha');
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  document.getElementById('loginEyeIcon').innerHTML = isHidden
    ? `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`
    : `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {

  initFirebase();
  initAlunosContainer();
  loadFromFirestore();

  // Esc fecha modal e sidebar
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.getElementById('churchDropdown').classList.remove('church-dropdown--open');
      document.getElementById('ocrModal').style.display = 'none';
      document.getElementById('ocrModalSaida').style.display = 'none';
      closeImgModal();
      closeDeleteModal();
      fecharFiltroDataModal();
      document.getElementById('caixaDataModal').style.display = 'none';
      document.getElementById('logoutModal').style.display = 'none';
      closeSidebar();
    }
  });
});
