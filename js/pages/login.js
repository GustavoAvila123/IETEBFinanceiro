class LoginPage {
  constructor(modal) {
    this.modal = modal;
  }

  checkAuth() {
    if (sessionStorage.getItem('ieteb_auth') === '1') {
      const el = document.getElementById('loginScreen');
      if (el) el.remove();
    }
  }

  openLogoutModal(sidebar) {
    this.modal.open('logoutModal');
    if (sidebar) sidebar.closeSidebar();
  }

  closeLogoutModal() { this.modal.close('logoutModal'); }

  confirmarLogout() {
    sessionStorage.removeItem('ieteb_auth');
    this.modal.close('logoutModal');

    const ls = document.createElement('div');
    ls.id = 'loginScreen';
    ls.className = 'ls ls--exit';
    ls.innerHTML = `
      <div class="ls-bg">
        <div class="ls-orb ls-orb--1"></div>
        <div class="ls-orb ls-orb--2"></div>
        <div class="ls-orb ls-orb--3"></div>
        <div class="ls-grid"></div>
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
      </div>`;
    document.body.appendChild(ls);
    window.scrollTo(0, 0);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => ls.classList.remove('ls--exit'));
    });
  }

  handleLogin(e) {
    e.preventDefault();
    const userEl  = document.getElementById('loginUsuario');
    const passEl  = document.getElementById('loginSenha');
    const errEl   = document.getElementById('loginError');
    const userErr = document.getElementById('loginUsuarioError');
    const passErr = document.getElementById('loginSenhaError');

    errEl.textContent  = '';
    userErr.textContent = '';
    passErr.textContent = '';

    const user = userEl.value.trim();
    const pass = passEl.value;

    let ok = true;
    if (!user) { userErr.textContent = 'Campo obrigatório.'; ok = false; }
    if (!pass) { passErr.textContent = 'Campo obrigatório.'; ok = false; }
    if (!ok) return;

    if (user === 'Admin' && pass === 'IETEB@2030') {
      sessionStorage.setItem('ieteb_auth', '1');
      const screen = document.getElementById('loginScreen');
      screen.classList.add('ls--exit');
      setTimeout(() => { screen.remove(); window.scrollTo(0, 0); }, 520);
    } else {
      errEl.textContent = 'Ops! Não conseguimos entrar com esses dados. Confirme seu usuário e senha e tente novamente.';
      const card = document.getElementById('loginCard');
      card.classList.remove('ls-card--shake');
      void card.offsetWidth;
      card.classList.add('ls-card--shake');
    }
  }

  toggleLoginPw() {
    const input   = document.getElementById('loginSenha');
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    document.getElementById('loginEyeIcon').innerHTML = isHidden
      ? `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`
      : `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`;
  }
}
