const _fbConfig = {
  apiKey: 'AIzaSyAH6mxJzzI1vOryKrw7DXNzODLOq2ZtFls',
  authDomain: 'ieteb-financeiro.firebaseapp.com',
  projectId: 'ieteb-financeiro',
  storageBucket: 'ieteb-financeiro.firebasestorage.app',
  messagingSenderId: '514664099454',
  appId: '1:514664099454:web:72177a3d36afc85782b22f',
};

class FirebaseManager {
  constructor() {
    this._db = null;
    this._storage = null;
    this._auth = null;
    this._onDataUpdate = null;
    this._unsubEnt = null;
    this._unsubSai = null;
    this._currentUser = null; // perfil legacy {legacyId, name, role}
  }

  init() {
    try {
      const fbSDK = window.firebase;
      if (!fbSDK) {
        console.error('Firebase SDK não carregou');
        return;
      }
      if (!fbSDK.apps || !fbSDK.apps.length) fbSDK.initializeApp(_fbConfig);
      this._db = fbSDK.firestore();
      try {
        this._storage = fbSDK.storage();
      } catch (_) {
        this._storage = null;
      }
      try {
        this._auth = fbSDK.auth();
        this._auth.setPersistence(fbSDK.auth.Auth.Persistence.LOCAL);
      } catch (_) {
        this._auth = null;
      }
    } catch (e) {
      console.error('Firebase init falhou');
      if (window.showToast) window.showToast('Falha ao conectar com o servidor.', 'error');
    }
  }

  /* ── Autenticação ──────────────────────────────────────────────────── */

  // Converte um id legacy (admin / Tester1) num e-mail estável para o Auth.
  _legacyToEmail(legacyId) {
    return `${String(legacyId).toLowerCase()}@ieteb.app`;
  }

  // onAuthStateChanged proxy para o login.js orquestrar o estado da UI.
  onAuthStateChanged(cb) {
    if (!this._auth) {
      cb(null);
      return () => {};
    }
    return this._auth.onAuthStateChanged(cb);
  }

  // Senhas legadas que devem migrar para a senha atual do USERS quando o
  // usuário tentar logar com a nova. Mantém aqui o histórico de senhas
  // já trocadas no config.js — assim a próxima tentativa loga com a
  // antiga internamente, faz updatePassword pra nova e o usuário entra.
  // Após todos os admins terem rotacionado, a entrada pode ser removida.
  static get _LEGACY_PASSES() {
    return {
      admin: ['IETEB@2030'],
    };
  }

  // Tenta sign-in. Garante sessão limpa antes (deslogando qualquer sessão
  // ativa). Se a conta não existir, cria via bootstrap. Se a conta existir
  // mas a senha digitada (= seed atual) for rejeitada, tenta as senhas
  // legadas e ROTACIONA pra atual ao primeiro sucesso — assim trocar a
  // senha em config.js basta pra todos os clientes migrarem sem nenhum
  // passo manual.
  async signIn(legacyId, password) {
    if (!this._auth) throw new Error('auth-indisponivel');

    // Força sessão limpa: se alguém estava logado (mesmo browser, sessão
    // legada, persistência stale), descarta antes do novo login.
    try {
      await this._auth.signOut();
    } catch (_) {}

    const email = this._legacyToEmail(legacyId);
    const seed = (typeof USERS !== 'undefined' ? USERS : []).find(
      (u) => u.id.toLowerCase() === String(legacyId).toLowerCase()
    );
    if (!seed) throw new Error('user-nao-cadastrado');

    let cred;
    try {
      cred = await this._auth.signInWithEmailAndPassword(email, password);
    } catch (e) {
      const code = e && e.code;
      const looksLikeNoAccount =
        code === 'auth/user-not-found' ||
        code === 'auth/invalid-credential' ||
        code === 'auth/invalid-login-credentials';
      if (!looksLikeNoAccount) throw e;

      // Senha digitada precisa bater com a seed atual pra qualquer
      // bootstrap/rotação rolar — sem isso, é só senha errada mesmo.
      if (!seed.pass || seed.pass !== password) throw e;

      // Caminho 1: conta ainda não existe → bootstrap normal.
      try {
        cred = await this._auth.createUserWithEmailAndPassword(email, password);
      } catch (e2) {
        if (e2 && e2.code !== 'auth/email-already-in-use') throw e2;

        // Caminho 2: conta existe com senha antiga. Tenta as senhas
        // legadas conhecidas e rotaciona pra senha atual.
        const legacyKey = String(seed.id).toLowerCase();
        const legacyList = FirebaseManager._LEGACY_PASSES[legacyKey] || [];
        let rotated = false;
        for (const oldPass of legacyList) {
          if (oldPass === password) continue; // pular caso a "antiga" seja igual à nova
          try {
            cred = await this._auth.signInWithEmailAndPassword(email, oldPass);
            try {
              await cred.user.updatePassword(password);
            } catch (_) {}
            rotated = true;
            break;
          } catch (_) {
            /* tenta próxima */
          }
        }
        if (!rotated) throw e;
      }
    }

    await this._upsertUserProfile(cred.user.uid, seed);
    this._currentUser = { legacyId: seed.id, name: seed.name, role: seed.role, uid: cred.user.uid };
    return this._currentUser;
  }

  async signOut() {
    if (this._auth) {
      try {
        await this._auth.signOut();
      } catch (_) {}
    }
    this._currentUser = null;
  }

  // Recupera perfil legacy a partir de um Firebase user.
  async loadProfileFor(authUser) {
    if (!this._db || !authUser) return null;
    try {
      const snap = await this._db.collection('Users').doc(authUser.uid).get();
      if (snap.exists) {
        const d = snap.data();
        this._currentUser = { legacyId: d.legacyId, name: d.name, role: d.role, uid: authUser.uid };
        return this._currentUser;
      }
    } catch (_) {}
    return null;
  }

  async _upsertUserProfile(uid, seed) {
    if (!this._db) return;
    try {
      await this._db.collection('Users').doc(uid).set(
        {
          legacyId: seed.id,
          name: seed.name,
          role: seed.role,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (e) {
      console.warn('upsert user profile falhou');
    }
  }

  currentUser() {
    return this._currentUser;
  }

  setDataUpdateCallback(fn) {
    this._onDataUpdate = fn;
  }

  // Testa se Firestore está acessível; mostra toast com resultado.
  async testConnection() {
    if (!this._db) {
      if (window.showToast)
        window.showToast('❌ Firebase DB é null — SDK não inicializou', 'error');
      return;
    }
    try {
      await this._db.collection('_test').doc('ping').set({ ts: Date.now() });
      await this._db.collection('_test').doc('ping').delete();
      if (window.showToast) window.showToast('✅ Firebase OK — banco conectado!', 'success');
    } catch (e) {
      if (window.showToast) window.showToast('❌ Firebase ERRO: ' + (e.message || e), 'error');
      console.error('testConnection error:', e);
    }
  }

  compressImage(dataUrl) {
    const LIMIT = 400000;
    if (!dataUrl) return Promise.resolve(null);
    if (dataUrl.startsWith('data:application/pdf')) {
      return Promise.resolve(dataUrl.length < LIMIT ? dataUrl : null);
    }
    const tryC = (maxW, q) =>
      new Promise((res) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          const s = Math.min(1, maxW / Math.max(img.width, 1));
          c.width = Math.round(img.width * s);
          c.height = Math.round(img.height * s);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          const out = c.toDataURL('image/jpeg', q);
          res(out.length < LIMIT ? out : null);
        };
        img.onerror = () => res(null);
        img.src = dataUrl;
      });
    return tryC(800, 0.65).then((r) => r || tryC(600, 0.5));
  }

  async save(colName, data) {
    if (!this._db) {
      console.error('save() chamado mas this._db é null');
      if (window.showToast)
        window.showToast('Banco não conectado — dado salvo apenas localmente', 'error');
      return;
    }
    try {
      // Imagens não são salvas no banco — apenas metadados
      const { comprovante, comprovanteUrl, comprovanteType, ...doc } = data;
      await this._db.collection(colName).doc(String(doc.id)).set(doc);
    } catch (e) {
      console.error('Firestore save error:', e);
      if (window.showToast) window.showToast('❌ Erro ao gravar: ' + (e.message || e), 'error');
    }
  }

  delete(colName, id) {
    if (!this._db) return;
    // Remove imediatamente do localStorage e registra como excluído
    const localKey = colName === 'Entradas' ? 'ieteb_lancamentos' : 'ieteb_saidas';
    const items = JSON.parse(localStorage.getItem(localKey) || '[]');
    localStorage.setItem(
      localKey,
      JSON.stringify(items.filter((r) => String(r.id) !== String(id)))
    );
    const deleted = JSON.parse(localStorage.getItem('ieteb_deleted_ids') || '[]');
    if (!deleted.includes(String(id))) deleted.push(String(id));
    localStorage.setItem('ieteb_deleted_ids', JSON.stringify(deleted));
    this._db
      .collection(colName)
      .doc(String(id))
      .delete()
      .catch((e) => console.warn('Firestore delete error:', e));
  }

  // Firestore é autoritativo. Registros salvos nos últimos 2 min ainda não
  // confirmados pelo Firestore são mantidos temporariamente (em-trânsito).
  _mergeAndStore(localKey, fsDocs) {
    const deleted = new Set(JSON.parse(localStorage.getItem('ieteb_deleted_ids') || '[]'));
    const fsIds = new Set(fsDocs.map((d) => String(d.data().id)));

    // Registros locais em-trânsito: não estão no Firestore e foram criados há < 2 min
    const local = JSON.parse(localStorage.getItem(localKey) || '[]');
    const now = Date.now();
    const inFlight = local.filter(
      (r) => !deleted.has(String(r.id)) && !fsIds.has(String(r.id)) && now - Number(r.id) < 120000
    );

    // Dados do Firestore (autoritativos) — strip de imagens por segurança
    const fsData = fsDocs
      .filter((d) => !deleted.has(String(d.data().id)))
      .map((d) => {
        const { comprovante, comprovanteUrl, comprovanteType, ...doc } = d.data();
        return doc;
      });

    const result = [...fsData, ...inFlight].sort((a, b) => b.id - a.id);
    try {
      localStorage.setItem(localKey, JSON.stringify(result));
    } catch (_) {
      try {
        localStorage.setItem(localKey, JSON.stringify(result.slice(0, 100)));
      } catch (__) {}
    }
  }

  // Envia ao Firestore os registros locais ausentes no Firestore.
  // Sempre sobe sem comprovante (data URL pode ser muito grande).
  async _uploadMissing(colName, fsDocs) {
    if (!this._db) return;
    const localKey = colName === 'Entradas' ? 'ieteb_lancamentos' : 'ieteb_saidas';
    const local = JSON.parse(localStorage.getItem(localKey) || '[]');
    const deleted = new Set(JSON.parse(localStorage.getItem('ieteb_deleted_ids') || '[]'));
    const fsIds = new Set(fsDocs.map((d) => d.id));

    for (const item of local) {
      if (!item.id) continue;
      if (fsIds.has(String(item.id))) continue;
      if (deleted.has(String(item.id))) continue;
      try {
        const { comprovante, ...doc } = item;
        doc.temComprovante = !!item.comprovante;
        await this._db.collection(colName).doc(String(doc.id)).set(doc);
      } catch (e) {
        console.error('uploadMissing error:', colName, item.id, e);
        if (window.showToast)
          window.showToast('❌ Erro ao sincronizar: ' + (e.message || e), 'error');
      }
    }
  }

  // Assina onSnapshot; chama onFirst(ok, docs) na primeira entrega.
  _subscribe(colName, localKey, onFirst) {
    let firstFired = false;
    return this._db.collection(colName).onSnapshot(
      (snap) => {
        try {
          this._mergeAndStore(localKey, snap.docs);
        } catch (_) {}
        if (!firstFired) {
          firstFired = true;
          if (onFirst) onFirst(true, snap.docs);
        } else {
          if (this._onDataUpdate) this._onDataUpdate();
        }
      },
      (e) => {
        console.warn(colName + ' snapshot error:', e);
        if (!firstFired) {
          firstFired = true;
          if (onFirst) onFirst(false, []);
        }
      }
    );
  }

  // Remove data URLs de comprovante do localStorage (chamado uma vez na inicialização).
  _purgeLocalDataUrls() {
    ['ieteb_lancamentos', 'ieteb_saidas'].forEach((key) => {
      try {
        const items = JSON.parse(localStorage.getItem(key) || '[]');
        let changed = false;
        const cleaned = items.map((r) => {
          if (r.comprovante && !r.comprovante.startsWith('http')) {
            const { comprovante, ...rest } = r;
            rest.temComprovante = true;
            changed = true;
            return rest;
          }
          return r;
        });
        if (changed) {
          try {
            localStorage.setItem(key, JSON.stringify(cleaned));
          } catch (_) {
            try {
              localStorage.setItem(key, JSON.stringify(cleaned.slice(0, 50)));
            } catch (__) {}
          }
        }
      } catch (_) {}
    });
  }

  // Carga inicial: configura listeners e sobe dados locais que faltam no Firestore.
  // Cada coleção faz seu próprio upload independentemente, sem esperar pela outra.
  load(onComplete) {
    this._purgeLocalDataUrls();
    if (!this._db) {
      if (onComplete) onComplete();
      return;
    }

    if (this._unsubEnt) this._unsubEnt();
    if (this._unsubSai) this._unsubSai();

    let firstEntDone = false,
      firstSaiDone = false;

    const checkFirst = () => {
      if (!firstEntDone || !firstSaiDone) return;
      if (onComplete) onComplete();
    };

    this._unsubEnt = this._subscribe('Entradas', 'ieteb_lancamentos', (_ok, docs) => {
      this._uploadMissing('Entradas', docs);
      firstEntDone = true;
      checkFirst();
    });
    this._unsubSai = this._subscribe('Saídas', 'ieteb_saidas', (_ok, docs) => {
      this._uploadMissing('Saídas', docs);
      firstSaiDone = true;
      checkFirst();
    });
  }

  /* ── Sessões ────────────────────────────────────────────────── */
  // Cap de delta entre heartbeats para não contar tempo em que o usuário
  // esteve offline (browser em background, sem rede etc).
  _HEARTBEAT_CAP_MS = 3 * 60 * 1000;

  // Idempotente: cria a sessão se ainda não existir, ou apenas toca o
  // lastSeen/active=true se já está ativa (preserva currentSessionMs
  // entre reloads). Se estava encerrada (active=false), zera os contadores
  // para iniciar uma sessão nova.
  async saveSession(user) {
    if (!this._db || !user || !user.id) return;
    try {
      const ref = this._db.collection('Sessoes').doc(user.id);
      const snap = await ref.get();
      const now = Date.now();
      const iso = new Date(now).toISOString();

      if (!snap.exists) {
        await ref.set({
          userId: user.id,
          name: user.name,
          role: user.role,
          loginAt: iso,
          loginAtMs: now,
          lastSeen: iso,
          lastHeartbeatMs: now,
          active: true,
          currentSessionMs: 0,
        });
        return;
      }

      const data = snap.data();
      const updates = {
        userId: user.id,
        name: user.name,
        role: user.role,
        lastSeen: iso,
        active: true,
      };
      // Se a sessão anterior estava encerrada, inicia uma nova
      if (data.active === false) {
        updates.loginAt = iso;
        updates.loginAtMs = now;
        updates.lastHeartbeatMs = now;
        updates.currentSessionMs = 0;
      }
      await ref.update(updates);
    } catch (_) {}
  }

  async clearSession(userId) {
    if (!this._db || !userId) return;
    try {
      const FieldValue = window.firebase.firestore.FieldValue;
      const ref = this._db.collection('Sessoes').doc(userId);
      const snap = await ref.get();
      const data = snap.exists ? snap.data() : null;

      const now = Date.now();
      const lastHb = data && data.lastHeartbeatMs ? data.lastHeartbeatMs : data && data.loginAtMs;
      const delta = lastHb ? Math.min(now - lastHb, this._HEARTBEAT_CAP_MS) : 0;
      const lastSess = ((data && Number(data.currentSessionMs)) || 0) + delta;

      const updates = {
        active: false,
        lastSeen: new Date(now).toISOString(),
        lastSessionMs: lastSess,
        lastSessionEndedAt: new Date(now).toISOString(),
        currentSessionMs: 0,
      };
      if (delta > 0) updates.totalLoggedMs = FieldValue.increment(delta);
      await ref.update(updates);
    } catch (_) {}
  }

  async heartbeat(userId) {
    if (!this._db || !userId) return;
    try {
      const FieldValue = window.firebase.firestore.FieldValue;
      const ref = this._db.collection('Sessoes').doc(userId);
      const snap = await ref.get();
      const data = snap.exists ? snap.data() : null;

      const now = Date.now();
      const lastHb = data && data.lastHeartbeatMs ? data.lastHeartbeatMs : data && data.loginAtMs;
      const delta = lastHb ? Math.min(now - lastHb, this._HEARTBEAT_CAP_MS) : 0;

      const updates = {
        lastSeen: new Date(now).toISOString(),
        lastHeartbeatMs: now,
      };
      if (delta > 0) {
        updates.totalLoggedMs = FieldValue.increment(delta);
        updates.currentSessionMs = FieldValue.increment(delta);
      }
      await ref.update(updates);
    } catch (_) {}
  }

  listenSessions(callback) {
    if (!this._db) return () => {};
    return this._db.collection('Sessoes').onSnapshot(
      (snap) => {
        const map = {};
        snap.docs.forEach((d) => {
          map[d.data().userId] = d.data();
        });
        callback(map);
      },
      (e) => console.warn('listenSessions:', e)
    );
  }

  // Reconecta silenciosamente (sem overlay) ao voltar ao foco.
  silentRefresh() {
    if (!this._db) return;
    if (this._unsubEnt) {
      this._unsubEnt();
      this._unsubEnt = null;
    }
    if (this._unsubSai) {
      this._unsubSai();
      this._unsubSai = null;
    }
    this._unsubEnt = this._subscribe('Entradas', 'ieteb_lancamentos', () => {});
    this._unsubSai = this._subscribe('Saídas', 'ieteb_saidas', () => {});
  }

  // Reconecta os listeners para buscar dados frescos do servidor.
  forceRefresh(onDone) {
    if (!this._db) {
      if (this._onDataUpdate) this._onDataUpdate();
      if (onDone) onDone(false);
      return;
    }

    if (this._unsubEnt) {
      this._unsubEnt();
      this._unsubEnt = null;
    }
    if (this._unsubSai) {
      this._unsubSai();
      this._unsubSai = null;
    }

    let entDone = false,
      saiDone = false;
    const check = () => {
      if (!entDone || !saiDone) return;
      if (this._onDataUpdate) this._onDataUpdate();
      if (onDone) onDone(true);
    };

    this._unsubEnt = this._subscribe('Entradas', 'ieteb_lancamentos', (_ok, docs) => {
      this._uploadMissing('Entradas', docs);
      entDone = true;
      check();
    });
    this._unsubSai = this._subscribe('Saídas', 'ieteb_saidas', (_ok, docs) => {
      this._uploadMissing('Saídas', docs);
      saiDone = true;
      check();
    });
  }
}
