// Auditoria — log de criações/alterações/exclusões
// Admin only. Lê /Auditoria do Firestore (descendente por timestamp).
//
// UI: lista de cards com ação + recurso + user + tempo + diff de
// dadosAntes vs dadosDepois quando for update/delete.

class AuditoriaPage {
  constructor(firebase) {
    this.firebase = firebase;
    this.logs = [];
  }

  resetPage() {
    this.limparFiltros();
    this.carregar();
  }

  // Reseta os 3 filtros (ação, recurso, usuário) sem recarregar a lista —
  // a aplicarFiltros é chamada em seguida pra refletir os campos limpos.
  limparFiltros() {
    const ids = ['auditoriaFiltroAcao', 'auditoriaFiltroRecurso', 'auditoriaFiltroUser'];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    this.aplicarFiltros();
  }

  async carregar() {
    const list = document.getElementById('auditoriaList');
    if (list) list.innerHTML = '<p class="auditoria-empty">Carregando logs...</p>';
    try {
      this.logs = await this.firebase.listAudit(300);
    } catch (e) {
      console.warn('listAudit falhou:', e);
      this.logs = [];
    }
    this.aplicarFiltros();
  }

  aplicarFiltros() {
    const acao = (document.getElementById('auditoriaFiltroAcao') || {}).value || '';
    const recurso = (document.getElementById('auditoriaFiltroRecurso') || {}).value || '';
    const user = ((document.getElementById('auditoriaFiltroUser') || {}).value || '')
      .trim()
      .toLowerCase();

    const filtered = this.logs.filter((l) => {
      if (acao && l.acao !== acao) return false;
      if (recurso && l.recurso !== recurso) return false;
      if (user) {
        const u = `${l.userId || ''} ${l.userName || ''}`.toLowerCase();
        if (!u.includes(user)) return false;
      }
      return true;
    });

    this.render(filtered);

    const cnt = document.getElementById('auditoriaCount');
    if (cnt) cnt.textContent = `${filtered.length} de ${this.logs.length} registros`;
  }

  render(items) {
    const list = document.getElementById('auditoriaList');
    if (!list) return;
    if (!items.length) {
      list.innerHTML = '<p class="auditoria-empty">Nenhum registro encontrado.</p>';
      return;
    }

    const acaoBadge = (a) => {
      const map = {
        create: { cls: 'audit-badge--create', label: 'CRIAÇÃO' },
        update: { cls: 'audit-badge--update', label: 'ALTERAÇÃO' },
        delete: { cls: 'audit-badge--delete', label: 'EXCLUSÃO' },
      };
      const m = map[a] || { cls: '', label: (a || '').toUpperCase() };
      return `<span class="audit-badge ${m.cls}">${m.label}</span>`;
    };

    const fmtWhen = (iso) => {
      if (!iso) return '—';
      try {
        const d = new Date(iso);
        return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
      } catch (_) {
        return iso;
      }
    };

    const renderDiff = (antes, depois) => {
      if (!antes && !depois) return '';
      const keys = new Set([
        ...Object.keys(antes || {}),
        ...Object.keys(depois || {}),
      ]);
      const rows = [];
      keys.forEach((k) => {
        if (k === 'id' || k === 'userId' || k === 'userName') return;
        const a = antes ? antes[k] : undefined;
        const d = depois ? depois[k] : undefined;
        if (JSON.stringify(a) === JSON.stringify(d)) return;
        rows.push(
          `<div class="audit-diff-row">
             <span class="audit-diff-key">${escHtml(k)}</span>
             <span class="audit-diff-before">${a == null ? '—' : escHtml(String(a))}</span>
             <span class="audit-diff-arrow">→</span>
             <span class="audit-diff-after">${d == null ? '—' : escHtml(String(d))}</span>
           </div>`
        );
      });
      return rows.length ? `<div class="audit-diff">${rows.join('')}</div>` : '';
    };

    list.innerHTML = items
      .map(
        (l) => `
      <div class="audit-card audit-card--${l.acao}">
        <div class="audit-card-head">
          ${acaoBadge(l.acao)}
          <span class="audit-recurso">${escHtml(l.recurso || '?')} · ${escHtml(l.recursoId || '')}</span>
          <span class="audit-when">${fmtWhen(l.timestamp)}</span>
        </div>
        <div class="audit-user">
          <strong>${escHtml(l.userName || '?')}</strong>
          <span class="audit-user-id">${escHtml(l.userId || '')}</span>
        </div>
        ${renderDiff(l.dadosAntes, l.dadosDepois)}
      </div>
    `
      )
      .join('');
  }
}
