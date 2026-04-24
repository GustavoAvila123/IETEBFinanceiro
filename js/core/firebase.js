
const _fbConfig = {
  apiKey:            'AIzaSyAH6mxJzzI1vOryKrw7DXNzODLOq2ZtFls',
  authDomain:        'ieteb-financeiro.firebaseapp.com',
  projectId:         'ieteb-financeiro',
  storageBucket:     'ieteb-financeiro.firebasestorage.app',
  messagingSenderId: '514664099454',
  appId:             '1:514664099454:web:72177a3d36afc85782b22f',
};

class FirebaseManager {
  constructor() {
    this._db           = null;
    this._storage      = null;
    this._onDataUpdate = null;
    this._unsubEnt     = null;
    this._unsubSai     = null;
  }

  init() {
    try {
      if (typeof firebase === 'undefined') return;
      if (!firebase.apps.length) firebase.initializeApp(_fbConfig);
      this._db      = firebase.firestore();
      this._storage = firebase.storage();
    } catch (e) {
      console.warn('Firebase init:', e);
    }
  }

  setDataUpdateCallback(fn) {
    this._onDataUpdate = fn;
  }

  compressImage(dataUrl) {
    const LIMIT = 400000;
    if (!dataUrl) return Promise.resolve(null);
    if (dataUrl.startsWith('data:application/pdf'))
      return Promise.resolve(dataUrl.length < LIMIT ? dataUrl : null);
    const tryC = (maxW, q) => new Promise(res => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        const s = Math.min(1, maxW / Math.max(img.width, 1));
        c.width  = Math.round(img.width  * s);
        c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const out = c.toDataURL('image/jpeg', q);
        res(out.length < LIMIT ? out : null);
      };
      img.onerror = () => res(null);
      img.src = dataUrl;
    });
    return tryC(800, 0.65).then(r => r || tryC(600, 0.50));
  }

  async save(colName, data) {
    if (!this._db) return;
    try {
      const { comprovante, ...doc } = data;
      doc.temComprovante = !!comprovante;

      if (comprovante) {
        doc.comprovanteType = comprovante.startsWith('data:application/pdf') ? 'pdf' : 'image';

        if (this._storage) {
          try {
            const ref = this._storage.ref(`comprovantes/${colName}/${doc.id}`);
            await ref.putString(comprovante, 'data_url');
            doc.comprovanteUrl = await ref.getDownloadURL();
          } catch (e) {
            console.warn('Storage upload falhou, tentando inline:', e);
            const compressed = await this.compressImage(comprovante);
            if (compressed) doc.comprovante = compressed;
          }
        } else {
          const compressed = await this.compressImage(comprovante);
          if (compressed) doc.comprovante = compressed;
        }
      }

      this._db.collection(colName).doc(String(doc.id)).set(doc)
        .catch(e => console.warn('Firestore write error:', e));
    } catch (e) {
      console.warn('Firestore save error:', e);
    }
  }

  delete(colName, id) {
    if (!this._db) return;
    this._db.collection(colName).doc(String(id)).delete()
      .catch(e => console.warn('Firestore delete error:', e));
  }

  _mergeAndStore(localKey, fsDocs) {
    const local    = JSON.parse(localStorage.getItem(localKey) || '[]');
    const localMap = {};
    local.forEach(r => { localMap[r.id] = r; });

    const merged = fsDocs.map(d => {
      const doc = d.data();
      const loc = localMap[doc.id];
      if (loc?.comprovante && !loc.comprovante.startsWith('http')) {
        doc.comprovante = loc.comprovante;
      } else if (!doc.comprovante && doc.comprovanteUrl) {
        doc.comprovante = doc.comprovanteUrl;
      }
      return doc;
    });
    merged.sort((a, b) => b.id - a.id);
    localStorage.setItem(localKey, JSON.stringify(merged));
  }

  // Assina onSnapshot para uma coleção; chama onFirst(ok) na primeira entrega e
  // _onDataUpdate nas entregas seguintes. Retorna a função de cancelamento.
  _subscribe(colName, localKey, onFirst) {
    let firstFired = false;
    return this._db.collection(colName).onSnapshot(
      snap => {
        this._mergeAndStore(localKey, snap.docs);
        if (!firstFired) {
          firstFired = true;
          if (onFirst) onFirst(true);
        } else {
          if (this._onDataUpdate) this._onDataUpdate();
        }
      },
      e => {
        console.warn(colName + ' snapshot error:', e);
        if (!firstFired) {
          firstFired = true;
          if (onFirst) onFirst(false);
        }
      }
    );
  }

  // Carga inicial — configura listeners em tempo real
  load(onComplete) {
    if (!this._db) { if (onComplete) onComplete(); return; }

    let firstEntDone = false, firstSaiDone = false;
    const checkFirst = () => { if (firstEntDone && firstSaiDone && onComplete) onComplete(); };

    if (this._unsubEnt) this._unsubEnt();
    if (this._unsubSai) this._unsubSai();

    this._unsubEnt = this._subscribe('Entradas', 'ieteb_lancamentos',
      () => { firstEntDone = true; checkFirst(); });
    this._unsubSai = this._subscribe('Saídas', 'ieteb_saidas',
      () => { firstSaiDone = true; checkFirst(); });
  }

  // Reconecta os listeners para forçar busca fresca do servidor
  forceRefresh(onDone) {
    if (!this._db) { if (onDone) onDone(false); return; }

    if (this._unsubEnt) { this._unsubEnt(); this._unsubEnt = null; }
    if (this._unsubSai) { this._unsubSai(); this._unsubSai = null; }

    let entDone = false, saiDone = false, allOk = true;
    const check = () => {
      if (!entDone || !saiDone) return;
      if (this._onDataUpdate) this._onDataUpdate();
      if (onDone) onDone(allOk);
    };

    this._unsubEnt = this._subscribe('Entradas', 'ieteb_lancamentos', ok => {
      if (!ok) allOk = false;
      entDone = true;
      check();
    });
    this._unsubSai = this._subscribe('Saídas', 'ieteb_saidas', ok => {
      if (!ok) allOk = false;
      saiDone = true;
      check();
    });
  }
}
