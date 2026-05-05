// IETEB Financeiro — atalhos de teclado
//
// Estilo Gmail / GitHub: pressione "g" e dentro de 1.2s pressione a
// segunda letra para navegar. Ex.: "g h" → home, "g e" → entradas.
//
// Atalhos disponíveis:
//   g h  → Home
//   g e  → Entradas
//   g s  → Saídas
//   g r  → Relatórios
//   g t  → Tesouraria
//   g d  → Dashboard
//   ?    → abre o modal de ajuda com a lista de atalhos
//   Esc  → fecha o modal de ajuda
//
// Critérios pra desabilitar (não disparar):
//   - Foco em <input>, <textarea>, <select>, [contenteditable]
//   - Algum modificador segurado (Ctrl/Cmd/Alt/Shift sozinho não conta;
//     mas se tiver Ctrl+L, Alt+T, etc., deixa o browser cuidar)
//   - Splash de boot ainda visível (usuário não logado)

(function () {
  'use strict';

  const PREFIX_TIMEOUT_MS = 1200;
  let prefixActive = false;
  let prefixTimer = null;

  function isTypingTarget(t) {
    if (!t) return false;
    const tag = (t.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (t.isContentEditable) return true;
    return false;
  }

  function appReady() {
    // Splash com display:none indica usuário já passou do boot
    const splash = document.getElementById('bootSplash');
    if (!splash) return true;
    const cs = window.getComputedStyle(splash);
    return cs.display === 'none';
  }

  function go(page) {
    if (typeof window.showPage === 'function') window.showPage(page);
  }

  function clearPrefix() {
    prefixActive = false;
    if (prefixTimer) {
      clearTimeout(prefixTimer);
      prefixTimer = null;
    }
  }

  function startPrefix() {
    prefixActive = true;
    if (prefixTimer) clearTimeout(prefixTimer);
    prefixTimer = setTimeout(clearPrefix, PREFIX_TIMEOUT_MS);
  }

  function showHelp() {
    const modal = document.getElementById('shortcutsModal');
    if (modal && window.openModal) window.openModal('shortcutsModal');
  }

  function onKey(e) {
    // Ignora se algum modal está com foco em input
    if (isTypingTarget(e.target)) return;
    // Ignora teclas com modificadores (deixa pro browser)
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!appReady()) return;

    const key = e.key;

    // Modal de ajuda já aberto? Esc fecha.
    if (key === 'Escape') {
      const help = document.getElementById('shortcutsModal');
      if (help && help.style.display === 'flex' && window.closeModal) {
        window.closeModal('shortcutsModal');
        e.preventDefault();
      }
      return;
    }

    // ?  → abre help (Shift+/ na maioria dos teclados)
    if (key === '?') {
      e.preventDefault();
      showHelp();
      return;
    }

    // Modo prefixo "g" + segunda letra
    if (prefixActive) {
      const map = {
        h: 'home',
        e: 'lancamentos',
        s: 'saidas',
        r: 'relatorios',
        t: 'caixa',
        d: 'dashboard',
      };
      const lower = key.toLowerCase();
      if (map[lower]) {
        e.preventDefault();
        go(map[lower]);
      }
      clearPrefix();
      return;
    }

    if (key === 'g' || key === 'G') {
      e.preventDefault();
      startPrefix();
    }
  }

  document.addEventListener('keydown', onKey);

  // Expõe pra debug/teste
  window.shortcuts = {
    showHelp,
    _isPrefixActive: () => prefixActive,
  };
})();
