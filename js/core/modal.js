class ModalManager {
  constructor() {
    this._lockedScrollY = null;
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
  }

  close(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';

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
