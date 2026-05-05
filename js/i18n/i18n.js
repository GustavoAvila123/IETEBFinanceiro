// IETEB Financeiro — runtime de internacionalização
//
// API mínima:
//   getLang()              → 'pt-BR' | 'en'
//   setLang(lang)          → persiste em localStorage e re-renderiza
//   t(key, fallback?)      → string traduzida, com fallback opcional
//   applyTranslations()    → percorre o DOM aplicando data-i18n / data-i18n-attr
//
// Como marcar elementos no HTML:
//   <h1 data-i18n="login.welcome">Bem-vindo</h1>
//     → o texto é substituído por t('login.welcome')
//
//   <input data-i18n-attr="placeholder:login.user" placeholder="Usuário">
//     → o atributo placeholder é substituído por t('login.user')
//
// Idioma padrão: 'pt-BR'. Mudança via setLang() é persistida em
// localStorage.ieteb_lang e aplicada imediatamente. Se ninguém chamar
// setLang(), o app fica em PT-BR para sempre — comportamento atual.

(function () {
  'use strict';

  const STORAGE_KEY = 'ieteb_lang';
  const DEFAULT_LANG = 'pt-BR';
  const SUPPORTED = ['pt-BR', 'en'];

  function getLang() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v && SUPPORTED.includes(v)) return v;
    } catch (_) {}
    return DEFAULT_LANG;
  }

  function setLang(lang) {
    if (!SUPPORTED.includes(lang)) return;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (_) {}
    document.documentElement.setAttribute('lang', lang);
    applyTranslations();
  }

  function t(key, fallback) {
    const lang = getLang();
    const dict = (typeof I18N_STRINGS !== 'undefined' && I18N_STRINGS[lang]) || {};
    if (Object.prototype.hasOwnProperty.call(dict, key)) return dict[key];
    // Fallback em cascata: pt-BR como default antes de cair no fallback do dev
    const fallbackDict = (typeof I18N_STRINGS !== 'undefined' && I18N_STRINGS[DEFAULT_LANG]) || {};
    if (Object.prototype.hasOwnProperty.call(fallbackDict, key)) return fallbackDict[key];
    return fallback != null ? fallback : key;
  }

  function applyTranslations(root) {
    const scope = root && root.querySelectorAll ? root : document;

    // 1) data-i18n="key" → substitui textContent
    scope.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key, el.textContent);
    });

    // 2) data-i18n-attr="attr1:key1;attr2:key2" → substitui atributos
    scope.querySelectorAll('[data-i18n-attr]').forEach((el) => {
      const spec = el.getAttribute('data-i18n-attr');
      if (!spec) return;
      spec.split(';').forEach((pair) => {
        const [attr, key] = pair.split(':').map((s) => s && s.trim());
        if (attr && key) el.setAttribute(attr, t(key, el.getAttribute(attr) || ''));
      });
    });
  }

  function init() {
    document.documentElement.setAttribute('lang', getLang());
    applyTranslations(document);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expõe API global (window.t, window.setLang, etc.) para uso fácil em
  // outros scripts inline, e para o usuário trocar via console se quiser.
  window.t = t;
  window.getLang = getLang;
  window.setLang = setLang;
  window.applyTranslations = applyTranslations;
})();
