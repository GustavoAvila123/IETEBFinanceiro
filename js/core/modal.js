class ModalManager {
  constructor() {
    this._lockedScrollY = null;
    // Map<modalId, releaseTrapFn>: cada modal aberto tem um trap ativo
    this._traps = new Map();
  }

  open(id) {
    const el = document.getElementById(id);
    if (!el) return;

    // Trava o scroll só no PRIMEIRO modal aberto da pilha. Se já houver
    // outro modal aberto, mantém a posição salva.
    if (this._lockedScrollY === null) {
      this._lockedScrollY = window.scrollY || window.pageYOffset || 0;
      document.body.style.top = `-${this._lockedScrollY}px`;
      document.body.classList.add('modal-open');
    }
    el.style.display = 'flex';

    // a11y: marca modal pra leitor de tela e aprisiona o foco. Esc fecha.
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    if (window.a11y && typeof window.a11y.trapFocus === 'function') {
      // Foco inicial no modal-card (ou primeiro focável dentro dele)
      const card = el.querySelector('.modal-card, .modal-img-card') || el;
      const release = window.a11y.trapFocus(card, {
        onEscape: () => this.close(id),
      });
      this._traps.set(id, release);
    }
  }

  close(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';

    // a11y: libera o trap do modal específico, restaurando o foco anterior
    const release = this._traps.get(id);
    if (typeof release === 'function') {
      try {
        release();
      } catch (_) {}
      this._traps.delete(id);
    }

    // Só destrava quando NENHUM outro modal está visível.
    const aindaTemAberto = Array.from(document.querySelectorAll('.modal-overlay')).some(
      (m) => m.style.display === 'flex'
    );
    if (!aindaTemAberto) {
      document.body.classList.remove('modal-open');
      document.body.style.top = '';
      const y = this._lockedScrollY;
      this._lockedScrollY = null;
      if (y !== null) window.scrollTo(0, y);
    }
  }

  showNotif(msg, type) {
    const header = document.getElementById('notifModalHeader');
    const title = document.getElementById('notifModalTitle');
    header.className = 'modal-header' + (type === 'error' ? ' modal-header--danger' : '');
    title.textContent = type === 'error' ? 'Atenção' : type === 'success' ? 'Concluído' : 'Aviso';
    document.getElementById('notifModalMsg').textContent = msg;
    this.open('notifModal');
  }

  closeNotif() {
    this.close('notifModal');
  }

  // Alias para retrocompatibilidade com código interno
  showToast(msg, type = '') {
    this.showNotif(msg, type);
  }
}
