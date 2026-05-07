/* ── Multi-environment config ──────────────────────────────────────────
 * O app suporta 2 ambientes Firebase:
 *   PROD  → projeto "ieteb-financeiro" (master, GitHub Pages)
 *   DEV   → projeto "ieteb-financeiro-dev" (branch dev, host de testes)
 *
 * A escolha é por HOSTNAME no runtime — sem build step, sem env var.
 * Hostnames de PROD listados em PROD_HOSTS abaixo. Tudo o que NÃO
 * estiver lá (localhost, *.netlify.app de preview, etc.) usa DEV.
 *
 * Para ativar de fato o ambiente DEV separado:
 *   1. Criar projeto "ieteb-financeiro-dev" no Firebase Console.
 *   2. Copiar a config (apiKey, authDomain, projectId, etc.) e colar
 *      em _CONFIGS.dev abaixo.
 *   3. Aplicar firestore.rules e storage.rules nesse projeto também.
 *   4. Adicionar o domínio de DEV em Firebase Auth → Authorized domains.
 *
 * Enquanto _CONFIGS.dev tiver apiKey vazia, ambos ambientes apontam
 * pro mesmo projeto PROD (comportamento atual). */

// Hostnames considerados PRODUÇÃO. Tudo o que NÃO estiver aqui
// (localhost, *.netlify.app, dev.*.pages.dev, *.workers.dev, etc.)
// é tratado como DEV e usa _CONFIGS.dev.
//
// IMPORTANTE: a URL de DEV no Cloudflare ('dev.<projeto>.pages.dev')
// começa com 'dev.' — então adicionar APENAS o subdomínio de PROD
// aqui (sem o 'dev.'). Exemplo:
//   PROD: 'ieteb-financeiro.pages.dev'   ← entra na lista
//   DEV:  'dev.ieteb-financeiro.pages.dev' ← NÃO entra (cai em DEV)
const PROD_HOSTS = [
  'gustavoavila123.github.io', // hospedagem antiga (GitHub Pages) — manter até desativar
  'ieteb-financeiro.web.app',
  'ieteb-financeiro.firebaseapp.com',
  'ieteb-financeiro.pages.dev', // Cloudflare Pages — production branch (master)
  // Adicione aqui o domínio custom de PROD quando configurar
];

const _CONFIGS = {
  prod: {
    apiKey: 'AIzaSyAH6mxJzzI1vOryKrw7DXNzODLOq2ZtFls',
    authDomain: 'ieteb-financeiro.firebaseapp.com',
    projectId: 'ieteb-financeiro',
    storageBucket: 'ieteb-financeiro.firebasestorage.app',
    messagingSenderId: '514664099454',
    appId: '1:514664099454:web:72177a3d36afc85782b22f',
  },
  // Projeto Firebase DEV separado — dados isolados de PROD.
  // Criado em 2026-05-05.
  dev: {
    apiKey: 'AIzaSyCefT5hrrqngFNQPBz9COUvJOgy22POnnk',
    authDomain: 'ieteb-financeiro-dev.firebaseapp.com',
    projectId: 'ieteb-financeiro-dev',
    storageBucket: 'ieteb-financeiro-dev.firebasestorage.app',
    messagingSenderId: '371258565272',
    appId: '1:371258565272:web:a57f7c3928de92212c26ed',
  },
};

function _resolveFirebaseConfig() {
  const host = (typeof location !== 'undefined' && location.hostname) || '';
  // Match EXATO — sem subdomínio. Antes usávamos host.endsWith('.' + h)
  // mas isso fazia 'dev.ieteb-financeiro.pages.dev' (DEV no Cloudflare)
  // bater com PROD_HOSTS contendo 'ieteb-financeiro.pages.dev'.
  // Agora: cada subdomínio tem que estar EXPLICITAMENTE em PROD_HOSTS.
  const isProd = PROD_HOSTS.includes(host);
  const env = isProd ? 'prod' : 'dev';
  const cfg = _CONFIGS[env];
  if (!cfg.apiKey) {
    console.warn(
      '[firebase] Config "' + env + '" sem apiKey — fallback pra PROD. ' +
        'Hostname atual: "' + host + '".'
    );
    return _CONFIGS.prod;
  }
  // Log discreto para o admin saber em qual env conectou
  console.info('[firebase] Conectado no projeto', cfg.projectId, '(' + env.toUpperCase() + ')');
  return cfg;
}

const _fbConfig = _resolveFirebaseConfig();

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

  // Sign-in com Firebase Auth puro. Sem bootstrap, sem rotação automática,
  // sem dependência de senhas no client. A criação de usuários (Auth +
  // doc /Users/{uid}) é feita pelo admin direto no Firebase Console — ver
  // RUNBOOK.md "Adicionar / remover um usuário".
  //
  // O legacyId digitado é convertido em email (<id>@ieteb.app) e usado
  // como credencial no Auth. Após o sign-in, o perfil (legacyId, name,
  // role) é carregado de /Users/{uid}; se não existir, throw — admin
  // esqueceu de criar o doc.
  async signIn(legacyId, password) {
    if (!this._auth) throw new Error('auth-indisponivel');

    // Força sessão limpa: se alguém estava logado (mesmo browser, sessão
    // legada, persistência stale), descarta antes do novo login.
    try {
      await this._auth.signOut();
    } catch (_) {}

    const email = this._legacyToEmail(legacyId);
    const cred = await this._auth.signInWithEmailAndPassword(email, password);

    const profile = await this.loadProfileFor(cred.user);
    if (!profile) {
      try {
        await this._auth.signOut();
      } catch (_) {}
      throw new Error('user-nao-cadastrado');
    }
    return profile;
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
        {window.showToast('❌ Firebase DB é null — SDK não inicializou', 'error');}
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
        {window.showToast('Banco não conectado — dado salvo apenas localmente', 'error');}
      return;
    }
    try {
      // Imagens não são salvas no banco — apenas metadados
      const { comprovante, comprovanteUrl, comprovanteType, ...doc } = data;
      // Verifica se é create (doc não existe) ou update (já existe)
      const ref = this._db.collection(colName).doc(String(doc.id));
      let prevSnap = null;
      try {
        prevSnap = await ref.get();
      } catch (_) {}
      const isUpdate = prevSnap && prevSnap.exists;
      await ref.set(doc);
      // Log de auditoria não-bloqueante (best-effort)
      this._logAudit({
        acao: isUpdate ? 'update' : 'create',
        recurso: colName,
        recursoId: String(doc.id),
        dadosAntes: isUpdate && prevSnap ? prevSnap.data() : null,
        dadosDepois: doc,
      });
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
    const removido = items.find((r) => String(r.id) === String(id));
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
    // Audit log da exclusão — usa snapshot do localStorage como dadosAntes
    this._logAudit({
      acao: 'delete',
      recurso: colName,
      recursoId: String(id),
      dadosAntes: removido || null,
      dadosDepois: null,
    });
  }

  // Grava um log de auditoria em /Auditoria. Best-effort: nunca bloqueia
  // a operação principal nem mostra erro ao usuário se falhar.
  // Schema: { id, userId, userName, acao, recurso, recursoId,
  //           dadosAntes, dadosDepois, timestamp }
  async _logAudit(entry) {
    try {
      if (!this._db) return;
      const cu = this._currentUser || { legacyId: 'desconhecido', name: '?' };
      const id = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8);
      const doc = {
        id,
        userId: cu.legacyId,
        userName: cu.name,
        acao: entry.acao,
        recurso: entry.recurso,
        recursoId: entry.recursoId,
        // Strip campos pesados (comprovante data URLs) antes de armazenar.
        // Mantém apenas dados de identificação/valor pra auditoria.
        dadosAntes: entry.dadosAntes ? this._stripHeavy(entry.dadosAntes) : null,
        dadosDepois: entry.dadosDepois ? this._stripHeavy(entry.dadosDepois) : null,
        timestamp: new Date().toISOString(),
      };
      await this._db.collection('Auditoria').doc(id).set(doc);
    } catch (_) {
      // Falha silenciosa — auditoria não pode quebrar a operação real
    }
  }

  // Remove campos pesados (data URLs de comprovantes) antes de logar.
  _stripHeavy(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const { comprovante, comprovanteUrl, comprovanteType, ...rest } = obj;
    return rest;
  }

  // Lista de logs de auditoria, mais recentes primeiro. Limit configurável.
  async listAudit(limit = 200) {
    if (!this._db) return [];
    try {
      const snap = await this._db
        .collection('Auditoria')
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();
      return snap.docs.map((d) => d.data());
    } catch (e) {
      console.warn('listAudit falhou:', e);
      return [];
    }
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
          {window.showToast('❌ Erro ao sincronizar: ' + (e.message || e), 'error');}
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
    this._unsubSai = this._subscribe('Saidas', 'ieteb_saidas', (_ok, docs) => {
      this._uploadMissing('Saidas', docs);
      firstSaiDone = true;
      checkFirst();
    });
  }

  /* ── Sessões ────────────────────────────────────────────────── */
  // Cap de delta entre heartbeats para não contar tempo em que o usuário
  // esteve offline (browser em background, sem rede etc).
  _HEARTBEAT_CAP_MS = 3 * 60 * 1000;

  // Threshold para considerar uma sessão "ativa em outro device": se o
  // último heartbeat foi há menos de 10 min, assumimos que ainda está
  // online. Isso evita prompts de conflito quando a sessão antiga
  // quedou silenciosamente (ex.: usuário fechou o browser sem logout).
  _ACTIVE_SESSION_WINDOW_MS = 10 * 60 * 1000;

  // Gera um ID único pra esta sessão (UUID v4 simplificado).
  // Se crypto.randomUUID estiver disponível, usa ele. Caso contrário,
  // gera um random suficientemente único pra fins de eviction.
  _generateSessionId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return (
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2, 11) +
      Math.random().toString(36).slice(2, 11)
    );
  }

  // Detecta o tipo de device pra mostrar no modal de conflito de sessão.
  _detectDevice() {
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    if (/iPad/i.test(ua)) return 'iPad';
    if (/iPhone|iPod/i.test(ua)) return 'iPhone';
    if (/Android.*Mobile/i.test(ua)) return 'celular Android';
    if (/Android/i.test(ua)) return 'tablet Android';
    if (/Mac/i.test(ua)) return 'Mac';
    if (/Windows/i.test(ua)) return 'Windows';
    if (/Linux/i.test(ua)) return 'Linux';
    return 'outro dispositivo';
  }

  // Verifica se existe sessão ativa de OUTRO device. Retorna {sessionId, device}
  // se sim, ou null se não houver sessão ativa recente.
  // Usa lastHeartbeatMs como sinal de "online" (atualizado a cada 2 min
  // pelo heartbeat).
  async checkActiveSession(legacyId) {
    if (!this._db || !legacyId) return null;
    try {
      const ref = this._db.collection('Sessoes').doc(legacyId);
      const snap = await ref.get();
      if (!snap.exists) return null;
      const data = snap.data();
      if (!data.sessionId) return null;
      if (data.active === false) return null;
      const lastHb = Number(data.lastHeartbeatMs) || 0;
      const ageMs = Date.now() - lastHb;
      if (ageMs > this._ACTIVE_SESSION_WINDOW_MS) return null;
      return {
        sessionId: data.sessionId,
        device: data.device || 'outro dispositivo',
        lastSeen: data.lastSeen,
      };
    } catch (e) {
      console.warn('checkActiveSession falhou:', e);
      return null;
    }
  }

  // Monitora se OUTRO device tomou a sessão. Chama onEvict() se o
  // sessionId remoto mudar pra algo diferente do nosso local.
  // Retorna função de unsubscribe.
  listenSessionEvictor(legacyId, localSessionId, onEvict) {
    if (!this._db || !legacyId || !localSessionId) return () => {};
    return this._db.collection('Sessoes').doc(legacyId).onSnapshot(
      (snap) => {
        if (!snap.exists) return;
        const data = snap.data();
        // Se o remoto tem um sessionId diferente do nosso, fomos despejados.
        if (data.sessionId && data.sessionId !== localSessionId) {
          try {
            onEvict({ device: data.device, lastSeen: data.lastSeen });
          } catch (_) {}
        }
      },
      (e) => console.warn('listenSessionEvictor erro:', e)
    );
  }

  // Idempotente: cria a sessão se ainda não existir, ou apenas toca o
  // lastSeen/active=true se já está ativa (preserva currentSessionMs
  // entre reloads). Se estava encerrada (active=false), zera os contadores
  // para iniciar uma sessão nova.
  //
  // Se sessionId for passado, sobrescreve o sessionId no doc — usado pra
  // forçar single-device login. Se não passar, mantém o existente.
  async saveSession(user, sessionId) {
    if (!this._db || !user || !user.id) return;
    try {
      const ref = this._db.collection('Sessoes').doc(user.id);
      const snap = await ref.get();
      const now = Date.now();
      const iso = new Date(now).toISOString();
      const device = this._detectDevice();

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
          sessionId: sessionId || this._generateSessionId(),
          device,
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
      // Atualiza sessionId apenas quando explicitamente passado (login)
      if (sessionId) {
        updates.sessionId = sessionId;
        updates.device = device;
      }
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
  // IMPORTANTE: o primeiro snapshot da nova subscription pode trazer
  // dados criados em OUTROS devices enquanto este estava em background.
  // Sem chamar _onDataUpdate no first-fire, a página ativa não sabe que
  // tem dado novo e fica desatualizada — bug de "lançou no celular não
  // aparece no desktop". Corrigido notificando explicitamente.
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
    const notifyActivePage = () => {
      if (this._onDataUpdate) this._onDataUpdate();
    };
    this._unsubEnt = this._subscribe('Entradas', 'ieteb_lancamentos', notifyActivePage);
    this._unsubSai = this._subscribe('Saidas', 'ieteb_saidas', notifyActivePage);
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
    this._unsubSai = this._subscribe('Saidas', 'ieteb_saidas', (_ok, docs) => {
      this._uploadMissing('Saidas', docs);
      saiDone = true;
      check();
    });
  }
}
