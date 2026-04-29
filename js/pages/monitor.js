
class MonitorPage {
  constructor(firebase) {
    this.firebase       = firebase;
    this._sessions      = {};
    this._unsubSessions = null;
  }

  resetPage() {
    this._subscribeToSessions();
    this.render();
  }

  _subscribeToSessions() {
    if (this._unsubSessions) { this._unsubSessions(); this._unsubSessions = null; }
    this._unsubSessions = this.firebase.listenSessions(sessions => {
      this._sessions = sessions;
      this.render();
    });
  }

  _isOnline(session) {
    if (!session || !session.active) return false;
    return (Date.now() - new Date(session.lastSeen).getTime()) < 5 * 60 * 1000;
  }

  _fmtDatetime(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch (_) { return '—'; }
  }

  _fmtLastSeen(iso) {
    if (!iso) return '—';
    try {
      const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
      if (diff < 60)   return 'há menos de 1 min';
      if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
      return this._fmtDatetime(iso);
    } catch (_) { return '—'; }
  }

  render() {
    const grid = document.getElementById('monitorGrid');
    if (!grid) return;

    const allEntradas = JSON.parse(localStorage.getItem('ieteb_lancamentos') || '[]');
    const allSaidas   = JSON.parse(localStorage.getItem('ieteb_saidas')      || '[]');

    const testers = (typeof USERS !== 'undefined' ? USERS : []).filter(u => u.role === 'tester');

    if (!testers.length) {
      grid.innerHTML = '<p style="color:rgba(255,255,255,.5);text-align:center;padding:40px">Nenhum tester configurado.</p>';
      return;
    }

    const totalEntGeral = allEntradas.filter(r => testers.some(t => t.id === r.userId));
    const totalSaiGeral = allSaidas.filter(r => testers.some(t => t.id === r.userId));

    // Resumo geral no topo
    const sumEnt = totalEntGeral.reduce((s, r) => s + parseBRL(r.valor), 0);
    const sumSai = totalSaiGeral.reduce((s, r) => s + parseBRL(r.valor), 0);
    const saldoGeral = sumEnt - sumSai;
    const onlineCount = testers.filter(t => this._isOnline(this._sessions[t.id])).length;

    document.getElementById('monitorSumEntradas').textContent = `R$ ${formatBRL(sumEnt)}`;
    document.getElementById('monitorSumSaidas').textContent   = `R$ ${formatBRL(sumSai)}`;
    const saldoEl = document.getElementById('monitorSumSaldo');
    saldoEl.textContent = `R$ ${formatBRL(Math.abs(saldoGeral))}`;
    saldoEl.style.color = saldoGeral < 0 ? 'var(--danger)' : 'var(--gold)';
    document.getElementById('monitorOnlineCount').textContent = `${onlineCount} online`;

    grid.innerHTML = testers.map(t => {
      const session = this._sessions[t.id];
      const online  = this._isOnline(session);
      const tEnt    = allEntradas.filter(r => r.userId === t.id);
      const tSai    = allSaidas.filter(r => r.userId === t.id);
      const totEnt  = tEnt.reduce((s, r) => s + parseBRL(r.valor), 0);
      const totSai  = tSai.reduce((s, r) => s + parseBRL(r.valor), 0);
      const saldo   = totEnt - totSai;
      const inicial = t.name.charAt(0).toUpperCase();

      return `
      <div class="monitor-card">
        <div class="monitor-card-header">
          <div class="monitor-avatar">${escHtml(inicial)}</div>
          <div class="monitor-info">
            <div class="monitor-name">${escHtml(t.name)}</div>
            <div class="monitor-userid">${escHtml(t.id)}</div>
          </div>
          <span class="monitor-status ${online ? 'monitor-status--online' : 'monitor-status--offline'}">
            <span class="monitor-status-dot"></span>
            ${online ? 'Online' : 'Offline'}
          </span>
        </div>

        <div class="monitor-stats">
          <div class="monitor-stat monitor-stat--entrada">
            <div class="monitor-stat-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
              </svg>
              Entradas
            </div>
            <div class="monitor-stat-count">${tEnt.length} lançamento${tEnt.length !== 1 ? 's' : ''}</div>
            <div class="monitor-stat-value">R$ ${formatBRL(totEnt)}</div>
          </div>
          <div class="monitor-stat monitor-stat--saida">
            <div class="monitor-stat-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
              </svg>
              Saídas
            </div>
            <div class="monitor-stat-count">${tSai.length} lançamento${tSai.length !== 1 ? 's' : ''}</div>
            <div class="monitor-stat-value">R$ ${formatBRL(totSai)}</div>
          </div>
          <div class="monitor-stat monitor-stat--saldo">
            <div class="monitor-stat-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/>
              </svg>
              Saldo
            </div>
            <div class="monitor-stat-count">&nbsp;</div>
            <div class="monitor-stat-value ${saldo < 0 ? 'monitor-stat-value--neg' : ''}">R$ ${formatBRL(Math.abs(saldo))}</div>
          </div>
        </div>

        <div class="monitor-card-footer">
          ${session ? `
            <span class="monitor-footer-item">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Último acesso: ${this._fmtLastSeen(session.lastSeen)}
            </span>
            <span class="monitor-footer-item">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
              Login: ${this._fmtDatetime(session.loginAt)}
            </span>
          ` : '<span class="monitor-footer-item" style="opacity:.45">Sem sessão registrada</span>'}
        </div>
      </div>`;
    }).join('');

    document.getElementById('monitorUpdatedAt').textContent =
      `Atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }
}
