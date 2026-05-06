// Backup / Restauração — admin only
//
// Backup: lê /Entradas, /Saídas, /Users, /Sessoes, /Auditoria do
// Firestore e baixa um JSON único {schema, exportadoEm, exportadoPor,
// totals, data: {Entradas, Saidas, Users, Sessoes, Auditoria}}.
//
// Restauração: aceita JSON do mesmo schema. Para CADA documento, faz
// .set() (overwrite). NÃO apaga registros que existem hoje mas não
// estavam no backup. Modal de confirmação dupla — ação destrutiva.
//
// IMPORTANTE: a restauração é client-side e respeita as regras do
// Firestore. Admin tem permissão de write em todas as coleções pelo
// modelo atual; se algum doc falhar, o resto continua e o relatório
// final mostra quantos sucessos/erros.

class BackupPage {
  constructor(modal, firebase) {
    this.modal = modal;
    this.firebase = firebase;
    this._restoreFile = null;
  }

  resetPage() {
    // Reseta UI ao entrar na página
    const status = document.getElementById('backupStatus');
    if (status) {
      status.textContent = '';
      status.className = 'backup-status';
    }
    this._restoreFile = null;
    const fileLabel = document.getElementById('restoreFileLabel');
    if (fileLabel) fileLabel.textContent = 'Nenhum arquivo selecionado';
    const restoreBtn = document.getElementById('btnRestoreConfirm');
    if (restoreBtn) restoreBtn.disabled = true;
  }

  // ── BACKUP ────────────────────────────────────────────────────────────
  async exportar() {
    const btn = document.getElementById('btnBackupExport');
    const status = document.getElementById('backupStatus');
    if (btn) btn.disabled = true;
    this._setStatus('Lendo coleções do Firestore...', 'info');

    try {
      const cols = ['Entradas', 'Saidas', 'Users', 'Sessoes', 'Auditoria'];
      const data = {};
      const totals = {};

      for (const c of cols) {
        const docs = await this._readCollection(c);
        data[c] = docs;
        totals[c] = docs.length;
        this._setStatus(`Lendo ${c}... (${docs.length} registros)`, 'info');
      }

      const cu = this.firebase.currentUser ? this.firebase.currentUser() : null;
      const payload = {
        schema: 'ieteb-financeiro-backup-v1',
        exportadoEm: new Date().toISOString(),
        exportadoPor: cu ? { id: cu.legacyId, name: cu.name, role: cu.role } : null,
        totals,
        data,
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = url;
      a.download = `ieteb-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      const total = Object.values(totals).reduce((s, n) => s + n, 0);
      this._setStatus(`✅ Backup baixado — ${total} registros no total.`, 'success');
    } catch (e) {
      console.error('Backup falhou:', e);
      this._setStatus(
        `❌ Erro ao gerar backup: ${e.message || e}`,
        'error'
      );
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async _readCollection(name) {
    if (!this.firebase || !this.firebase._db) return [];
    const snap = await this.firebase._db.collection(name).get();
    return snap.docs.map((d) => ({ _docId: d.id, ...d.data() }));
  }

  // ── RESTORE ──────────────────────────────────────────────────────────
  onFileSelected(input) {
    const file = input && input.files && input.files[0];
    if (!file) return;
    this._restoreFile = file;
    const lbl = document.getElementById('restoreFileLabel');
    if (lbl) lbl.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    const btn = document.getElementById('btnRestoreConfirm');
    if (btn) btn.disabled = false;
    this._setStatus('Arquivo carregado. Confirme a restauração.', 'info');
  }

  // Abre modal de confirmação dupla antes de aplicar
  pedirConfirmacaoRestore() {
    if (!this._restoreFile) {
      this._setStatus('Selecione um arquivo de backup primeiro.', 'error');
      return;
    }
    this.modal.open('restoreConfirmModal');
  }

  cancelarRestore() {
    this.modal.close('restoreConfirmModal');
  }

  async aplicarRestore() {
    this.modal.close('restoreConfirmModal');
    const btn = document.getElementById('btnRestoreConfirm');
    if (btn) btn.disabled = true;
    this._setStatus('Lendo arquivo...', 'info');

    let payload;
    try {
      const text = await this._readFileText(this._restoreFile);
      payload = JSON.parse(text);
    } catch (e) {
      this._setStatus(`❌ Arquivo inválido: ${e.message || e}`, 'error');
      if (btn) btn.disabled = false;
      return;
    }

    if (!payload || payload.schema !== 'ieteb-financeiro-backup-v1' || !payload.data) {
      this._setStatus(
        '❌ Schema do arquivo não corresponde a um backup IETEB válido.',
        'error'
      );
      if (btn) btn.disabled = false;
      return;
    }

    const cols = Object.keys(payload.data);
    const result = { ok: 0, fail: 0, errors: [] };

    for (const c of cols) {
      const docs = payload.data[c] || [];
      this._setStatus(`Restaurando ${c}... (${docs.length})`, 'info');
      for (const doc of docs) {
        const docId = String(doc._docId || doc.id || '');
        if (!docId) {
          result.fail++;
          result.errors.push(`${c}: doc sem ID`);
          continue;
        }
        const { _docId, ...payloadDoc } = doc;
        try {
          await this.firebase._db.collection(c).doc(docId).set(payloadDoc);
          result.ok++;
        } catch (e) {
          result.fail++;
          result.errors.push(`${c}/${docId}: ${e.message || e}`);
        }
      }
    }

    const msg = `Restauração: ${result.ok} sucessos, ${result.fail} erros.`;
    if (result.fail) {
      console.warn('Erros na restauração:', result.errors);
      this._setStatus(`⚠️ ${msg} Detalhes no console.`, 'error');
    } else {
      this._setStatus(`✅ ${msg}`, 'success');
    }

    if (btn) btn.disabled = false;
  }

  _readFileText(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = () => reject(new Error('falha ao ler arquivo'));
      r.readAsText(file);
    });
  }

  _setStatus(msg, kind) {
    const el = document.getElementById('backupStatus');
    if (!el) return;
    el.textContent = msg;
    el.className = 'backup-status';
    if (kind) el.classList.add(`backup-status--${kind}`);
  }
}
