// IETEB Financeiro — tooltip helper
//
// Substitui o tooltip nativo do browser (amarelinho, sem estilo, com
// delay incontrolável) por um tooltip CSS estilizado, lido a partir
// de [data-tooltip]. Para preservar acessibilidade, todo elemento com
// title="..." é convertido para data-tooltip="..." + aria-label, e o
// title original é removido (senão o nativo aparece em cima do CSS).
//
// Roda automaticamente:
//   1) Uma vez quando o DOM termina de carregar.
//   2) Sempre que algum nó for adicionado depois (tabelas dinâmicas,
//      modais, etc.) via MutationObserver.

(function () {
  'use strict';

  function convertElement(el) {
    if (!el || !el.getAttribute) return;
    const t = el.getAttribute('title');
    if (!t) return;
    // Já não casa com data-tooltip — proteção contra dupla conversão
    el.setAttribute('data-tooltip', t);
    if (!el.hasAttribute('aria-label')) {
      el.setAttribute('aria-label', t);
    }
    el.removeAttribute('title');
  }

  function convertAll(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('[title]').forEach(convertElement);
  }

  function init() {
    convertAll(document);

    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'attributes' && m.attributeName === 'title') {
          convertElement(m.target);
        }
        if (m.type === 'childList') {
          m.addedNodes.forEach((n) => {
            if (n.nodeType !== 1) return; // só Element
            if (n.hasAttribute && n.hasAttribute('title')) convertElement(n);
            if (n.querySelectorAll) convertAll(n);
          });
        }
      }
    });

    obs.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['title'],
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
