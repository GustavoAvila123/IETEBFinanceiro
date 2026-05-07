class LoginPage {
  constructor(modal) {
    this.modal = modal;
    this._heartbeatInterval = null;
    this._inactivityTimer = null;
    this._inactivityWarningTimer = null;
    this._inactivityCountdownTimer = null;
    this._inactivityHandler = null;
    this._inactivityWarningOpen = false;
  }

  // Restaura sessão a partir do Firebase Auth (que persiste no localStorage).
  // Resolve sempre — nunca rejeita — para a inicialização não travar.
  //
  // PROTEÇÃO ANTI-LOOP (PWA): se Firebase Auth não responder em 8s
  // (rede ruim, SDK não inicializou, App Check falhou), trata como
  // "não autenticado" e mostra a tela de login. Antes desse timeout
  // o splash ficava eterno em qualquer falha de rede no PWA.
  checkAuth() {
    const TIMEOUT_MS = 8000;
    return new Promise((resolve) => {
      if (!window._firebase || !window._firebase.onAuthStateChanged) {
        resolve(false);
        return;
      }
      let settled = false;
      const settle = (val) => {
        if (settled) return;
        settled = true;
        resolve(val);
      };
      const watchdog = setTimeout(() => {
        console.warn(
          '[checkAuth] Firebase Auth não respondeu em ' +
            TIMEOUT_MS +
            'ms — mostrando login.'
        );
        this._maybeShowInactivityBanner();
        settle(false);
      }, TIMEOUT_MS);
      const unsub = window._firebase.onAuthStateChanged(async (user) => {
        clearTimeout(watchdog);
        try {
          unsub();
        } catch (_) {}
        if (!user) {
          this._maybeShowInactivityBanner();
          settle(false);
          return;
        }
        try {
          const profile = await window._firebase.loadProfileFor(user);
          if (!profile) {
            settle(false);
            return;
          }
          this._populateLocalSession(profile);
          this._startHeartbeat(profile.legacyId);
          this._setupInactivityWatch(profile.role);
          try {
            sessionStorage.removeItem('ieteb_logout_motivo');
          } catch (_) {}
          // Garante que a sessão exista no Firestore — fallback caso a
          // gravação no handleLogin não tenha completado antes do reload.
          // Idempotente: se já existe e está ativa, só toca o lastSeen.
          try {
            window._firebase.saveSession({
              id: profile.legacyId,
              name: profile.name,
              role: profile.role,
            });
          } catch (_) {}
          const el = document.getElementById('loginScreen');
          if (el) el.remove();
          settle(true);
        } catch (_) {
          settle(false);
        }
      });
    });
  }

  _populateLocalSession(profile) {
    sessionStorage.setItem('ieteb_auth', '1');
    sessionStorage.setItem(
      'ieteb_user',
      JSON.stringify({
        id: profile.legacyId,
        name: profile.name,
        role: profile.role,
      })
    );
  }

  _startHeartbeat(legacyId) {
    if (this._heartbeatInterval) clearInterval(this._heartbeatInterval);
    this._heartbeatInterval = setInterval(
      () => {
        if (window._firebase) window._firebase.heartbeat(legacyId);
      },
      2 * 60 * 1000
    );
  }

  // Auto-logout por inatividade (5 min total) — apenas para testers.
  // Admin permanece logado indefinidamente.
  //
  // Fluxo de 2 etapas:
  //   1. WARNING_AT_MS (4 min sem atividade) → abre modal "Sessão expira
  //      em 60s" com countdown e 2 botões. Atividade durante o modal NÃO
  //      reseta — usuário precisa decidir explicitamente (caminho à
  //      prova de toques acidentais em mobile).
  //   2. Após mais 60s sem clicar em "Continuar", logout automático.
  _setupInactivityWatch(role) {
    this._clearInactivityWatch();
    if (role === 'admin') return;

    const WARNING_AT_MS = 4 * 60 * 1000;
    const events = [
      'mousemove',
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
      'touchmove',
      'click',
    ];

    const reset = () => {
      // Se o modal de warning está aberto, atividade não reseta nada —
      // usuário tem que clicar explicitamente.
      if (this._inactivityWarningOpen) return;
      if (this._inactivityWarningTimer) clearTimeout(this._inactivityWarningTimer);
      this._inactivityWarningTimer = setTimeout(
        () => this._showInactivityWarning(),
        WARNING_AT_MS
      );
    };

    this._inactivityHandler = reset;
    events.forEach((ev) => document.addEventListener(ev, reset, { passive: true }));
    reset();
  }

  _clearInactivityWatch() {
    if (this._inactivityTimer) {
      clearTimeout(this._inactivityTimer);
      this._inactivityTimer = null;
    }
    if (this._inactivityWarningTimer) {
      clearTimeout(this._inactivityWarningTimer);
      this._inactivityWarningTimer = null;
    }
    if (this._inactivityCountdownTimer) {
      clearInterval(this._inactivityCountdownTimer);
      this._inactivityCountdownTimer = null;
    }
    if (this._inactivityHandler) {
      ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'touchmove', 'click'].forEach(
        (ev) => document.removeEventListener(ev, this._inactivityHandler)
      );
      this._inactivityHandler = null;
    }
    this._inactivityWarningOpen = false;
  }

  // Mostra modal de aviso com countdown de 60s. Persiste o draft de
  // qualquer formulário aberto antes (caso o usuário não clique).
  _showInactivityWarning() {
    this._inactivityWarningOpen = true;
    let secondsLeft = 60;
    const updateCount = () => {
      const el = document.getElementById('sessionWarningCountdown');
      if (el) el.textContent = String(secondsLeft);
    };
    updateCount();
    this.modal.open('sessionWarningModal');

    this._inactivityCountdownTimer = setInterval(() => {
      secondsLeft--;
      updateCount();
      if (secondsLeft <= 0) {
        clearInterval(this._inactivityCountdownTimer);
        this._inactivityCountdownTimer = null;
        this._onInactivity();
      }
    }, 1000);
  }

  // Botão "Continuar logado": fecha o warning e re-arma os timers.
  continuarLogado() {
    if (this._inactivityCountdownTimer) {
      clearInterval(this._inactivityCountdownTimer);
      this._inactivityCountdownTimer = null;
    }
    this.modal.close('sessionWarningModal');
    this._inactivityWarningOpen = false;
    // Re-arma a contagem regressiva chamando o handler de "atividade"
    if (this._inactivityHandler) this._inactivityHandler();
  }

  // Botão "Sair agora": logout imediato.
  logoutAgora() {
    if (this._inactivityCountdownTimer) {
      clearInterval(this._inactivityCountdownTimer);
      this._inactivityCountdownTimer = null;
    }
    this.modal.close('sessionWarningModal');
    this._onInactivity();
  }

  async _onInactivity() {
    this._clearInactivityWatch();
    const user = getCurrentUser();
    if (window._firebase) {
      try {
        window._firebase.clearSession(user.id);
      } catch (_) {}
      try {
        await window._firebase.signOut();
      } catch (_) {}
    }
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }

    // Auto-logout PRESERVA os drafts em sessionStorage (chave
    // ieteb_draft_*) — assim o usuário relogado encontra o que estava
    // digitando antes do timeout. Limpa só keys de auth/PII.
    try {
      ['ieteb_auth', 'ieteb_user'].forEach((k) => sessionStorage.removeItem(k));
      [
        'ieteb_lancamentos',
        'ieteb_saidas',
        'ieteb_deleted_ids',
        'ieteb_saldo_abertura',
        'ieteb_user',
      ].forEach((k) => localStorage.removeItem(k));
    } catch (_) {}

    // Marca para o próximo render do login screen mostrar o aviso premium.
    try {
      sessionStorage.setItem('ieteb_logout_motivo', 'inatividade');
    } catch (_) {}

    // Recarrega para o boot splash + login screen aparecerem do zero.
    window.location.reload();
  }

  _maybeShowInactivityBanner() {
    let motivo = '';
    try {
      motivo = sessionStorage.getItem('ieteb_logout_motivo') || '';
    } catch (_) {}
    if (motivo !== 'inatividade') return;
    try {
      sessionStorage.removeItem('ieteb_logout_motivo');
    } catch (_) {}

    const card = document.getElementById('loginCard');
    if (!card || document.querySelector('.ls-banner')) return;

    const banner = document.createElement('div');
    banner.className = 'ls-banner ls-banner--inactivity';
    banner.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
      <div class="ls-banner-text">
        <strong>Você foi deslogado por inatividade.</strong>
        <span>Por questão de segurança, faça login novamente para continuar.</span>
      </div>`;
    // Insere FORA do card de login (como sibling acima), para não competir
    // com o logo nem alterar o layout do card.
    card.parentNode.insertBefore(banner, card);
  }

  openLogoutModal(sidebar) {
    this.modal.open('logoutModal');
    if (sidebar) sidebar.closeSidebar();
  }

  closeLogoutModal() {
    this.modal.close('logoutModal');
  }

  async confirmarLogout() {
    const user = getCurrentUser();
    if (window._firebase) {
      try {
        window._firebase.clearSession(user.id);
      } catch (_) {}
      try {
        await window._firebase.signOut();
      } catch (_) {}
    }
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
    this._clearInactivityWatch();

    // Limpa todo cache local de PII e auth ao sair
    try {
      sessionStorage.clear();
      [
        'ieteb_lancamentos',
        'ieteb_saidas',
        'ieteb_deleted_ids',
        'ieteb_saldo_abertura',
        'ieteb_user',
      ].forEach((k) => localStorage.removeItem(k));
    } catch (_) {}

    this.modal.close('logoutModal');

    const ls = document.createElement('div');
    ls.id = 'loginScreen';
    ls.className = 'ls ls--exit';
    ls.innerHTML = `
      <div class="ls-bg">
        <div class="ls-orb ls-orb--1"></div>
        <div class="ls-orb ls-orb--2"></div>
        <div class="ls-orb ls-orb--3"></div>
        <div class="ls-orb ls-orb--4"></div>
        <div class="ls-orb ls-orb--5"></div>
        <div class="ls-grid"></div>
        <div class="ls-spotlight"></div>
        <div class="ls-stars">
          <span></span><span></span><span></span><span></span><span></span>
          <span></span><span></span><span></span><span></span><span></span>
          <span></span><span></span><span></span><span></span><span></span>
          <span></span><span></span><span></span><span></span><span></span>
          <span></span><span></span><span></span><span></span><span></span>
        </div>
        <div class="ls-noise"></div>
        <div class="ls-vignette"></div>
      </div>
      <div class="ls-card" id="loginCard">
        <div class="ls-card-accent"></div>
        <div class="ls-logo-ring">
          <img src="assets/images/logo-ieteb-moderno.jpg" alt="IETEB" class="ls-logo" />
        </div>
        <div class="ls-header">
          <h1 class="ls-title">Bem-vindo</h1>
          <p class="ls-subtitle">Sistema de Gestão Financeira</p>
        </div>
        <form class="ls-form" onsubmit="handleLogin(event)" novalidate>
          <div class="ls-field">
            <label class="ls-label">Usuário</label>
            <div class="ls-input-wrap">
              <svg class="ls-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <input type="text" id="loginUsuario" class="ls-input" placeholder="Digite seu usuário" autocomplete="username" spellcheck="false" oninput="document.getElementById('loginUsuarioError').textContent=''" />
            </div>
            <span class="ls-field-error" id="loginUsuarioError"></span>
          </div>
          <div class="ls-field">
            <label class="ls-label">Senha</label>
            <div class="ls-input-wrap">
              <svg class="ls-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <input type="password" id="loginSenha" class="ls-input ls-input--pw" placeholder="Digite sua senha" autocomplete="current-password" oninput="document.getElementById('loginSenhaError').textContent=''" />
              <button type="button" class="ls-eye" id="loginEyeBtn" onclick="toggleLoginPw()" title="Mostrar/ocultar senha">
                <svg id="loginEyeIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              </button>
            </div>
            <span class="ls-field-error" id="loginSenhaError"></span>
          </div>
          <div class="ls-error" id="loginError"></div>
          <button type="submit" class="ls-btn" id="loginBtn">
            <span id="loginBtnText">Entrar</span>
            <svg class="ls-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12 5 19 12 12 19"/>
            </svg>
          </button>
        </form>
        <div class="ls-footer">IETEB &copy; 2026 &nbsp;·&nbsp; Todos os direitos reservados</div>
        <div class="ls-loading" id="lsLoading" aria-hidden="true">
          <div class="ls-loading-spinner">
            <div class="ls-loading-ring ls-loading-ring--1"></div>
            <div class="ls-loading-ring ls-loading-ring--2"></div>
            <div class="ls-loading-ring ls-loading-ring--3"></div>
          </div>
          <div class="ls-loading-text">
            Autenticando<span class="ls-loading-dots"><span>.</span><span>.</span><span>.</span></span>
          </div>
        </div>
      </div>`;
    document.body.appendChild(ls);
    window.scrollTo(0, 0);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => ls.classList.remove('ls--exit'));
    });
  }

  async handleLogin(e) {
    e.preventDefault();
    const userEl = document.getElementById('loginUsuario');
    const passEl = document.getElementById('loginSenha');
    const errEl = document.getElementById('loginError');
    const userErr = document.getElementById('loginUsuarioError');
    const passErr = document.getElementById('loginSenhaError');
    const btn = document.getElementById('loginBtn');

    errEl.textContent = '';
    userErr.textContent = '';
    passErr.textContent = '';

    const user = userEl.value.trim();
    const pass = passEl.value;

    let ok = true;
    if (!user) {
      userErr.textContent = 'Campo obrigatório.';
      ok = false;
    }
    if (!pass) {
      passErr.textContent = 'Campo obrigatório.';
      ok = false;
    }
    if (!ok) return;

    // Loading premium: mostra overlay com 3 anéis girando + texto pulsando.
    // Garante visibilidade mínima de 2s pra dar a sensação "verificando
    // suas credenciais com segurança" mesmo em redes rápidas / cache.
    const loadingEl = document.getElementById('lsLoading');
    const showLoading = () => loadingEl && loadingEl.classList.add('ls-loading--active');
    const hideLoading = () => loadingEl && loadingEl.classList.remove('ls-loading--active');
    const MIN_LOADING_MS = 2000;
    const startedAt = Date.now();
    const ensureMinElapsed = async () => {
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_LOADING_MS) {
        await new Promise((r) => setTimeout(r, MIN_LOADING_MS - elapsed));
      }
    };

    showLoading();
    if (btn) btn.disabled = true;
    try {
      if (!window._firebase) throw new Error('firebase-indisponivel');
      const profile = await window._firebase.signIn(user, pass);

      // Antes de finalizar o login, verifica se já existe sessão ativa
      // em outro device. Se houver, pede confirmação pra "tomar" a sessão
      // (o que vai despejar o outro device automaticamente via listener).
      let activeSession = null;
      try {
        activeSession = await window._firebase.checkActiveSession(profile.legacyId);
      } catch (_) {}

      if (activeSession) {
        hideLoading();
        const proceed = await this._askSessionConflict(activeSession.device || 'outro dispositivo');
        if (!proceed) {
          // Usuário cancelou: desloga e volta pra tela de login.
          try {
            await window._firebase.signOut();
          } catch (_) {}
          if (btn) btn.disabled = false;
          return;
        }
        showLoading();
      }

      // Gera novo sessionId (UUID) — esse é o "token" que identifica
      // ESTA sessão. Salvamos local e no Firestore. Outros devices que
      // estavam logados vão ver o sessionId remoto mudar e auto-deslogar.
      const sessionId = window._firebase._generateSessionId();
      try {
        sessionStorage.setItem('ieteb_session_id', sessionId);
      } catch (_) {}

      this._populateLocalSession(profile);

      // Aguarda gravação da sessão no Firestore (com timeout de 4s)
      // antes do reload, senão em redes lentas o doc não é gravado.
      try {
        await Promise.race([
          window._firebase.saveSession(
            {
              id: profile.legacyId,
              name: profile.name,
              role: profile.role,
            },
            sessionId
          ),
          new Promise((r) => setTimeout(r, 4000)),
        ]);
      } catch (_) {}

      this._startHeartbeat(profile.legacyId);

      // Mantém o loading por no mínimo 2s antes de fazer o reload.
      // Não escondemos o overlay no sucesso — o reload faz isso.
      await ensureMinElapsed();

      // Recarrega a tela inteira para que os listeners do Firestore
      // assinem com o novo contexto autenticado.
      const screen = document.getElementById('loginScreen');
      if (screen) {
        screen.classList.add('ls--exit');
        setTimeout(() => {
          screen.remove();
          window.scrollTo(0, 0);
          window.location.reload();
        }, 250);
      }
    } catch (err) {
      // No erro, garantimos que o loading apareceu por pelo menos 2s
      // antes de mostrar a mensagem — evita "flash" desconcertante.
      await ensureMinElapsed();
      hideLoading();
      const code = err && err.code;
      let msg =
        'Ops! Não conseguimos entrar com esses dados. Confirme seu usuário e senha e tente novamente.';
      if (code === 'auth/operation-not-allowed') {
        msg = 'Login indisponível no momento. Avise o administrador.';
      } else if (err && err.message === 'user-nao-cadastrado') {
        msg = 'Usuário não cadastrado.';
      } else if (err && err.message === 'firebase-indisponivel') {
        msg = 'Servidor de autenticação indisponível.';
      }
      errEl.textContent = msg;
      const card = document.getElementById('loginCard');
      if (card) {
        card.classList.remove('ls-card--shake');
        void card.offsetWidth;
        card.classList.add('ls-card--shake');
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // Mostra o modal "Sessão ativa em outro dispositivo" e devolve uma
  // Promise<bool> — true se o usuário confirmou continuar aqui (e
  // despejar o outro device), false se cancelou.
  _askSessionConflict(device) {
    return new Promise((resolve) => {
      const modal = document.getElementById('sessionConflictModal');
      const deviceEl = document.getElementById('sessionConflictDevice');
      if (!modal) {
        resolve(true); // se modal não existe, deixa passar pra não travar login
        return;
      }
      if (deviceEl) deviceEl.textContent = device;
      window.confirmSessionConflict = () => {
        modal.style.display = 'none';
        resolve(true);
      };
      window.cancelSessionConflict = () => {
        modal.style.display = 'none';
        resolve(false);
      };
      modal.style.display = 'flex';
    });
  }

  toggleLoginPw() {
    const input = document.getElementById('loginSenha');
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    document.getElementById('loginEyeIcon').innerHTML = isHidden
      ? `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`
      : `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`;
  }
}
