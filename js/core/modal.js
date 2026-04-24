class ModalManager {
  open(id) {
    document.getElementById(id).style.display = 'flex';
    document.body.classList.add('modal-open');
  }

  close(id) {
    document.getElementById(id).style.display = 'none';
    if (!document.querySelector('.modal-overlay[style*="flex"]')) {
      document.body.classList.remove('modal-open');
    }
  }

  showNotif(msg, type) {
    const header = document.getElementById('notifModalHeader');
    const title  = document.getElementById('notifModalTitle');
    header.className = 'modal-header' + (type === 'error' ? ' modal-header--danger' : '');
    title.textContent = type === 'error' ? 'Atenção' : type === 'success' ? 'Concluído' : 'Aviso';
    document.getElementById('notifModalMsg').textContent = msg;
    this.open('notifModal');
  }

  closeNotif() { this.close('notifModal'); }

  // Alias para retrocompatibilidade com código interno
  showToast(msg, type = '') { this.showNotif(msg, type); }
}
