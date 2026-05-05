// IETEB Financeiro — Persistência de rascunho de formulário
//
// Salva automaticamente o que o usuário está digitando num formulário
// para sessionStorage. Restaura ao voltar para a página. Limpa após
// salvamento bem-sucedido.
//
// API global:
//   formPersist.attach(formKey, fieldIds[])
//     → conecta listeners 'input' nos campos e tenta restaurar valores.
//   formPersist.save(formKey, fieldIds[])
//     → salva imediatamente (chamar antes de logout / unload).
//   formPersist.clear(formKey)
//     → apaga o rascunho (chamar após salvar com sucesso).
//   formPersist.has(formKey)
//     → true se há rascunho persistido.
//
// Sessão vs Local: usamos sessionStorage de propósito — rascunho some
// quando a aba/janela fecha. localStorage seria persistente demais
// (manteria dados sensíveis no dispositivo).

(function () {
  'use strict';

  function key(formKey) {
    return `ieteb_draft_${formKey}`;
  }

  function readDraft(formKey) {
    try {
      const raw = sessionStorage.getItem(key(formKey));
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function writeDraft(formKey, values) {
    try {
      sessionStorage.setItem(key(formKey), JSON.stringify(values));
    } catch (_) {}
  }

  function getValueOf(el) {
    if (!el) return undefined;
    if (el.type === 'checkbox' || el.type === 'radio') return el.checked ? el.value : undefined;
    return el.value;
  }

  function setValueOf(el, value) {
    if (!el || value == null) return;
    if (el.type === 'checkbox' || el.type === 'radio') {
      el.checked = el.value === value;
    } else {
      el.value = value;
    }
    // Dispara input pra rotinas dependentes (validação, máscara) reagirem
    try {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (_) {}
  }

  function snapshot(fieldIds) {
    const out = {};
    fieldIds.forEach((id) => {
      const v = getValueOf(document.getElementById(id));
      if (v !== undefined && v !== '') out[id] = v;
    });
    return out;
  }

  function attach(formKey, fieldIds) {
    if (!Array.isArray(fieldIds) || !fieldIds.length) return;

    // Restaura o que tiver
    const draft = readDraft(formKey);
    if (draft && typeof draft === 'object') {
      Object.keys(draft).forEach((id) => setValueOf(document.getElementById(id), draft[id]));
    }

    // Conecta autosave (debounced em 300ms pra não thrashar)
    let t = null;
    const onChange = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => writeDraft(formKey, snapshot(fieldIds)), 300);
    };
    fieldIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', onChange);
      el.addEventListener('change', onChange);
    });

    // Antes de fechar a aba, faz um save final (não-debounced)
    window.addEventListener(
      'beforeunload',
      () => {
        writeDraft(formKey, snapshot(fieldIds));
      },
      { passive: true }
    );
  }

  function save(formKey, fieldIds) {
    writeDraft(formKey, snapshot(fieldIds));
  }

  function clear(formKey) {
    try {
      sessionStorage.removeItem(key(formKey));
    } catch (_) {}
  }

  function has(formKey) {
    try {
      return sessionStorage.getItem(key(formKey)) != null;
    } catch (_) {
      return false;
    }
  }

  window.formPersist = { attach, save, clear, has };
})();
