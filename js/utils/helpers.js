function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toTitleCase(str) {
  return str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function truncate(str, max) {
  if (!str) return '—';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function setInput(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s  = document.createElement('script');
    s.src    = src;
    s.onload  = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function onlyNumbers(input) {
  input.value = input.value.replace(/\D/g, '');
}

function clearFieldError(id) {
  const el = document.getElementById(id);
  if (el) el.textContent = '';
}

function badgePagamento(tipo) {
  const map = { Pix: 'pix', Débito: 'debito', Crédito: 'credito', Dinheiro: 'dinheiro' };
  const cls = map[tipo] || 'pix';
  return `<span class="badge badge--${cls}">${escHtml(tipo || '—')}</span>`;
}
