function parseBRL(str) {
  if (!str) return 0;
  return parseFloat(String(str).replace(/\./g, '').replace(',', '.')) || 0;
}

function formatBRL(num) {
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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
    el.value = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  } else if (digits.length > 2) {
    el.value = `${digits.slice(0, 2)}/${digits.slice(2)}`;
  } else {
    el.value = digits;
  }
}

function onDateBlur(el, callback, allowFuture) {
  let digits = el.value.replace(/\D/g, '');
  if (digits) {
    if (digits.length === 7) digits = '0' + digits;
    if (digits.length === 8) {
      const dd   = digits.slice(0, 2), mm = digits.slice(2, 4), yyyy = digits.slice(4, 8);
      const date  = new Date(+yyyy, +mm - 1, +dd);
      const today = new Date(); today.setHours(23, 59, 59, 999);
      const valid = !isNaN(date.getTime())
                    && (allowFuture || date <= today)
                    && date.getDate() === +dd && date.getMonth() + 1 === +mm;
      el.value = valid ? `${dd}/${mm}/${yyyy}` : '';
    } else {
      el.value = '';
    }
  }
  if (callback && typeof window[callback] === 'function') window[callback]();
}
