// IETEB Financeiro — Acessibilidade
//
// Helpers de a11y reusáveis. Hoje implementa:
//   - Focus trap em containers (Tab/Shift+Tab cíclico, foco inicial,
//     restauração do foco anterior ao desativar).
//   - Tecla Esc fecha o container com data-close-callback definido.
//
// Uso típico (já cabeado no ModalManager):
//   const release = trapFocus(modalEl, { onEscape: () => modal.close(id) });
//   // quando fechar:
//   release();

(function () {
  'use strict';

  // Seletores de elementos focáveis dentro de um container
  const FOCUSABLE_SEL = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    'details > summary',
  ].join(', ');

  function visibleFocusables(container) {
    return Array.from(container.querySelectorAll(FOCUSABLE_SEL)).filter((el) => {
      if (el.hasAttribute('hidden')) return false;
      // Considera invisível se o elemento ou algum ancestral usa display:none
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      const cs = window.getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return false;
      return true;
    });
  }

  /**
   * Aprisiona o foco dentro de container.
   * @param {HTMLElement} container
   * @param {{ onEscape?: () => void, initialFocus?: HTMLElement }} opts
   * @returns {() => void} função para liberar o trap (chamar ao fechar o modal)
   */
  function trapFocus(container, opts) {
    if (!container) return () => {};
    opts = opts || {};
    const previouslyFocused = document.activeElement;

    // Foco inicial: o primeiro focável, ou o explicitamente passado
    const focusables = visibleFocusables(container);
    const target = opts.initialFocus || focusables[0] || container;
    try {
      // tabindex=-1 permite focar div container quando não há focáveis
      if (target === container && !container.hasAttribute('tabindex')) {
        container.setAttribute('tabindex', '-1');
        container.dataset._a11yTabindexAdded = '1';
      }
      target.focus({ preventScroll: true });
    } catch (_) {}

    function onKey(e) {
      if (e.key === 'Escape') {
        if (typeof opts.onEscape === 'function') {
          opts.onEscape();
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      if (e.key !== 'Tab') return;
      const list = visibleFocusables(container);
      if (!list.length) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !container.contains(active))) {
        last.focus();
        e.preventDefault();
      } else if (!e.shiftKey && (active === last || !container.contains(active))) {
        first.focus();
        e.preventDefault();
      }
    }

    container.addEventListener('keydown', onKey);

    // Função de liberação
    return function release() {
      container.removeEventListener('keydown', onKey);
      if (container.dataset._a11yTabindexAdded === '1') {
        container.removeAttribute('tabindex');
        delete container.dataset._a11yTabindexAdded;
      }
      try {
        if (previouslyFocused && previouslyFocused.focus) {
          previouslyFocused.focus({ preventScroll: true });
        }
      } catch (_) {}
    };
  }

  // Expõe global
  window.a11y = window.a11y || {};
  window.a11y.trapFocus = trapFocus;
  window.a11y.visibleFocusables = visibleFocusables;
})();
