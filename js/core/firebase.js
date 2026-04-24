
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

  // Callback chamado quando Firestore notifica mudança após a carga inicial
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

  // Mescla docs do Firestore com localStorage (prioriza data URL local; fallback para URL do Storage)
  _mergeAndStore(localKey, fsDocs) {
    const local    = JSON.parse(localStorage.getItem(localKey) || '[]');
    const localMap = {};
    local.forEach(r => { localMap[r.id] = r; });

    const merged = fsDocs.map(d => {
      const doc = d.data();
      const loc = localMap[doc.id];
      if (loc?.comprovante && !loc.comprovante.startsWith('http')) {
        doc.comprovante = loc.comprovante; // data URL local tem prioridade
      } else if (!doc.comprovante && doc.comprovanteUrl) {
        doc.comprovante = doc.comprovanteUrl; // fallback para URL do Storage
      }
      return doc;
    });
    merged.sort((a, b) => b.id - a.id);
    localStorage.setItem(localKey, JSON.stringify(merged));
  }

  // Usa onSnapshot para sincronização em tempo real entre dispositivos
  load(onComplete) {
    if (!this._db) { if (onComplete) onComplete(); return; }

    let firstEntDone = false, firstSaiDone = false;
    const checkFirst = () => { if (firstEntDone && firstSaiDone && onComplete) onComplete(); };

    this._db.collection('Entradas').onSnapshot(
      snap => {
        this._mergeAndStore('ieteb_lancamentos', snap.docs);
        if (!firstEntDone) { firstEntDone = true; checkFirst(); }
        else if (this._onDataUpdate) this._onDataUpdate();
      },
      e => {
        console.warn('Entradas snapshot error:', e);
        if (!firstEntDone) { firstEntDone = true; checkFirst(); }
      }
    );

    this._db.collection('Saídas').onSnapshot(
      snap => {
        this._mergeAndStore('ieteb_saidas', snap.docs);
        if (!firstSaiDone) { firstSaiDone = true; checkFirst(); }
        else if (this._onDataUpdate) this._onDataUpdate();
      },
      e => {
        console.warn('Saídas snapshot error:', e);
        if (!firstSaiDone) { firstSaiDone = true; checkFirst(); }
      }
    );
  }
}
