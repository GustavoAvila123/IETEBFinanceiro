// IETEB Financeiro — Toggle de tema (light / dark)
//
// Persistido em localStorage.ieteb_theme. Default: respeita
// prefers-color-scheme do sistema operacional.
//
// API global:
//   theme.get()         → 'light' | 'dark'
//   theme.set('dark')   → aplica e persiste
//   theme.toggle()      → alterna
//
// O atributo data-theme vai no <html> (e não no body) por dois motivos:
//  1. Evita FOUC: o snippet inline em index.html aplica antes do CSS
//     ler as variáveis;
//  2. Permite que CSS use ":root" / "html" como ancestral.

(function () {
  'use strict';

  const STORAGE_KEY = 'ieteb_theme';
  const VALID = ['light', 'dark'];

  function systemPref() {
    try {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    } catch (_) {}
    return 'light';
  }

  function get() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (VALID.includes(v)) return v;
    } catch (_) {}
    return systemPref();
  }

  function set(value) {
    if (!VALID.includes(value)) return;
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch (_) {}
    apply(value);
    updateMeta(value);
    updateButton(value);
  }

  function toggle() {
    set(get() === 'dark' ? 'light' : 'dark');
  }

  function apply(value) {
    document.documentElement.setAttribute('data-theme', value);
  }

  // theme-color do meta tag se ajusta — isso afeta a cor da barra
  // do iOS PWA / Android Chrome quando o app é instalado.
  function updateMeta(value) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', value === 'dark' ? '#0d1129' : '#0b1f5c');
  }

  // Atualiza o ícone dos botões de toggle existentes (topbar mobile +
  // sidebar desktop). Ambos têm os ícones .theme-icon-sun/.theme-icon-moon
  // que CSS troca automaticamente pelo seletor html[data-theme].
  function updateButton(value) {
    const isDark = value === 'dark';
    const label = isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro';
    const titleTxt = isDark ? 'Tema claro' : 'Tema escuro';
    ['themeToggleBtn', 'sidebarThemeBtn'].forEach((id) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', titleTxt);
      btn.dataset.themeNext = isDark ? 'light' : 'dark';
    });
  }

  function init() {
    apply(get());
    updateMeta(get());
    updateButton(get());

    // Reage a mudança da preferência do SO se o user nunca escolheu
    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => {
        let stored;
        try {
          stored = localStorage.getItem(STORAGE_KEY);
        } catch (_) {}
        if (!stored) {
          apply(systemPref());
          updateMeta(systemPref());
        }
      };
      if (mq.addEventListener) mq.addEventListener('change', handler);
      else if (mq.addListener) mq.addListener(handler); // Safari < 14
    }
  }

  // O <script> em index.html chama theme.apply ANTES do CSS render,
  // pra evitar flash light→dark. Aqui inicializamos o resto.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.theme = { get, set, toggle };
})();
