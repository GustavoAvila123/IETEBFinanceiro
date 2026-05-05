// IETEB Financeiro — registro de strings traduzíveis
//
// Escopo MVP: cobre topbar, navegação, rótulos comuns e textos de modal.
// Para adicionar uma nova string:
//   1) Adicione a chave em pt-BR e en abaixo.
//   2) No HTML, use `<elemento data-i18n="chave">texto fallback</elemento>`.
//   3) No JS, use `t('chave')`.
//
// Convenção de chaves: kebab-case agrupado por área.
//   ex.: 'nav.entradas', 'login.welcome', 'modal.confirm'

const I18N_STRINGS = {
  'pt-BR': {
    // Topbar / app
    'app.title': 'IETEB Financeiro',
    'app.tagline': 'Sistema de Gestão Financeira',

    // Login
    'login.welcome': 'Bem-vindo',
    'login.subtitle': 'SISTEMA DE GESTÃO FINANCEIRA',
    'login.user': 'USUÁRIO',
    'login.password': 'SENHA',
    'login.submit': 'Entrar',
    'login.error': 'Ops! Não conseguimos entrar com esses dados. Confirme seu usuário e senha e tente novamente.',
    'login.copyright': 'IETEB © 2026 · Todos os direitos reservados',

    // Navegação (sidebar)
    'nav.section.main': 'Principal',
    'nav.section.admin': 'Administração',
    'nav.home': 'Home',
    'nav.entradas': 'Entradas',
    'nav.saidas': 'Saídas',
    'nav.relatorios': 'Relatórios',
    'nav.tesouraria': 'Tesouraria',
    'nav.dashboard': 'Dashboard',
    'nav.monitor': 'Monitor de Testers',

    // Botões comuns
    'btn.save': 'Salvar',
    'btn.cancel': 'Cancelar',
    'btn.confirm': 'Confirmar',
    'btn.clear': 'Limpar',
    'btn.delete': 'Excluir',
    'btn.edit': 'Editar',
    'btn.export': 'Exportar',
    'btn.print': 'Imprimir',
    'btn.filter': 'Filtrar',
    'btn.clearFilter': 'Limpar filtro',
    'btn.home': 'Ir para Home',
    'btn.logout': 'Sair',

    // Modais
    'modal.confirmDelete.title': 'Confirmar exclusão',
    'modal.confirmDelete.message': 'Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita.',
    'modal.success.title': 'Concluído',
    'modal.warning.title': 'Atenção',
    'modal.error.title': 'Atenção',

    // Idioma
    'lang.label': 'Idioma',
    'lang.pt-BR': 'Português',
    'lang.en': 'English',
  },

  'en': {
    'app.title': 'IETEB Financial',
    'app.tagline': 'Financial Management System',

    'login.welcome': 'Welcome',
    'login.subtitle': 'FINANCIAL MANAGEMENT SYSTEM',
    'login.user': 'USER',
    'login.password': 'PASSWORD',
    'login.submit': 'Sign in',
    'login.error': "Oops! We couldn't sign you in with those credentials. Please check your username and password and try again.",
    'login.copyright': 'IETEB © 2026 · All rights reserved',

    'nav.section.main': 'Main',
    'nav.section.admin': 'Administration',
    'nav.home': 'Home',
    'nav.entradas': 'Income',
    'nav.saidas': 'Expenses',
    'nav.relatorios': 'Reports',
    'nav.tesouraria': 'Treasury',
    'nav.dashboard': 'Dashboard',
    'nav.monitor': 'Tester Monitor',

    'btn.save': 'Save',
    'btn.cancel': 'Cancel',
    'btn.confirm': 'Confirm',
    'btn.clear': 'Clear',
    'btn.delete': 'Delete',
    'btn.edit': 'Edit',
    'btn.export': 'Export',
    'btn.print': 'Print',
    'btn.filter': 'Filter',
    'btn.clearFilter': 'Clear filter',
    'btn.home': 'Go to Home',
    'btn.logout': 'Sign out',

    'modal.confirmDelete.title': 'Confirm deletion',
    'modal.confirmDelete.message': 'Are you sure you want to delete this record? This action cannot be undone.',
    'modal.success.title': 'Done',
    'modal.warning.title': 'Notice',
    'modal.error.title': 'Notice',

    'lang.label': 'Language',
    'lang.pt-BR': 'Português',
    'lang.en': 'English',
  },
};
