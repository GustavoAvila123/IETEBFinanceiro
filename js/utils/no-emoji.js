// Bloqueia emojis em todos os campos input/textarea do app.
//
// Motivação (2026-05-14): usuários estavam colando emojis em nomes,
// observações e categorias, gerando lixo nos relatórios e dificultando
// buscas/filtros. Solicitado bloqueio global preventivo.
//
// Estratégia: listener delegado no document captura cada evento `input`
// (que dispara após digitação, paste e drag-drop) e remove qualquer
// pictograma da string atual. Preserva a posição do cursor.
//
// Inputs ignorados (não aceitam emoji por design): date, time,
// datetime-local, number, file, checkbox, radio, button.
//
// Opt-out via atributo: <input data-allow-emoji="true"> (não usado hoje,
// só escape hatch caso surja necessidade futura).
(function () {
  'use strict';

  // Unicode Extended_Pictographic + variation selectors (FE0F) + ZWJ
  // sequences (200D) + skin tone modifiers (1F3FB-1F3FF). Cobre
  // virtualmente todos os emojis modernos incl. compostos (família,
  // bandeiras com modificadores).
  const EMOJI_RE =
    /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*/gu;

  const SKIP_INPUT_TYPES = new Set([
    'date',
    'time',
    'datetime-local',
    'month',
    'week',
    'number',
    'range',
    'color',
    'file',
    'checkbox',
    'radio',
    'submit',
    'button',
    'reset',
    'image',
    'hidden',
  ]);

  function shouldSkip(el) {
    if (!el || !el.tagName) return true;
    const tag = el.tagName.toUpperCase();
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') return true;
    if (el.dataset && el.dataset.allowEmoji === 'true') return true;
    if (tag === 'INPUT' && SKIP_INPUT_TYPES.has((el.type || '').toLowerCase())) return true;
    return false;
  }

  function stripEmojis(str) {
    if (!str) return str;
    return str.replace(EMOJI_RE, '');
  }

  function handleInput(e) {
    const el = e.target;
    if (shouldSkip(el)) return;
    const original = el.value;
    if (!original) return;
    const cleaned = stripEmojis(original);
    if (cleaned === original) return;

    // Preserva a posição do cursor compensando pelos chars removidos
    const oldStart = el.selectionStart;
    const oldEnd = el.selectionEnd;
    const removed = original.length - cleaned.length;
    el.value = cleaned;
    try {
      if (oldStart != null) {
        el.setSelectionRange(Math.max(0, oldStart - removed), Math.max(0, oldEnd - removed));
      }
    } catch (_) {
      // setSelectionRange não suportado em alguns inputs — ignora
    }
  }

  // Capture phase: intercepta ANTES de outros listeners (autosave,
  // validações) verem o valor com emoji.
  document.addEventListener('input', handleInput, true);

  // Expõe a função pra outros módulos sanitizarem manualmente se
  // precisarem (ex: valor importado, dado vindo do OCR/API)
  try {
    globalThis.stripEmojis = stripEmojis;
  } catch (_) {}
})();
