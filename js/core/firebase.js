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
    this._db      = null;
    this._storage = null;
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
        const compressed = await this.compressImage(comprovante);
        if (compressed) doc.comprovante = compressed;
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

  async load(onComplete) {
    if (!this._db) { onComplete(); return; }
    try {
      const [entSnap, saiSnap] = await Promise.all([
        this._db.collection('Entradas').get(),
        this._db.collection('Saídas').get(),
      ]);

      const localEnt    = JSON.parse(localStorage.getItem('ieteb_lancamentos') || '[]');
      const localEntMap = {};
      localEnt.forEach(r => { localEntMap[r.id] = r; });

      const fsEntradas = entSnap.docs.map(d => {
        const doc   = d.data();
        const local = localEntMap[doc.id];
        if (local && local.comprovante)               doc.comprovante = local.comprovante;
        else if (!doc.comprovante && doc.comprovanteUrl) doc.comprovante = doc.comprovanteUrl;
        return doc;
      });
      fsEntradas.sort((a, b) => b.id - a.id);
      localStorage.setItem('ieteb_lancamentos', JSON.stringify(fsEntradas));

      const localSai    = JSON.parse(localStorage.getItem('ieteb_saidas') || '[]');
      const localSaiMap = {};
      localSai.forEach(r => { localSaiMap[r.id] = r; });

      const fsSaidas = saiSnap.docs.map(d => {
        const doc   = d.data();
        const local = localSaiMap[doc.id];
        if (local && local.comprovante)               doc.comprovante = local.comprovante;
        else if (!doc.comprovante && doc.comprovanteUrl) doc.comprovante = doc.comprovanteUrl;
        return doc;
      });
      fsSaidas.sort((a, b) => b.id - a.id);
      localStorage.setItem('ieteb_saidas', JSON.stringify(fsSaidas));

    } catch (e) {
      console.warn('Firestore load error:', e);
    }
    onComplete();
  }
}
