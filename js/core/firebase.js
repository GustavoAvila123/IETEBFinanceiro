
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
      const fbSDK = window.firebase;
      if (!fbSDK) return;
      if (!fbSDK.apps || !fbSDK.apps.length) fbSDK.initializeApp(_fbConfig);
      this._db      = fbSDK.firestore();
      this._storage = fbSDK.storage();
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

  // Após o sync inicial, Firestore é autoritativo (deletions propagam).
  // Antes do sync, usa UNION para preservar dados locais ainda não enviados.
  _mergeAndStore(localKey, fsDocs) {
    const local    = JSON.parse(localStorage.getItem(localKey) || '[]');
    const localMap = {};
    local.forEach(r => { localMap[r.id] = r; });

    const syncDone = localStorage.getItem('ieteb_sync_v1') === '1';

    if (syncDone) {
      // REPLACE: Firestore decide quais registros existem (deletions propagam)
      const merged = fsDocs.map(d => {
        const doc = d.data();
        const loc = localMap[doc.id];
        if (loc?.comprovante && !loc.comprovante.startsWith('http')) doc.comprovante = loc.comprovante;
        else if (!doc.comprovante && doc.comprovanteUrl) doc.comprovante = doc.comprovanteUrl;
        return doc;
      });
      merged.sort((a, b) => b.id - a.id);
      localStorage.setItem(localKey, JSON.stringify(merged));
    } else {
      // UNION: preserva dados locais enquanto o upload inicial ainda não completou
      const merged = { ...localMap };
      fsDocs.forEach(d => {
        const doc = d.data();
        const loc = merged[doc.id];
        if (loc?.comprovante && !loc.comprovante.startsWith('http')) doc.comprovante = loc.comprovante;
        else if (!doc.comprovante && doc.comprovanteUrl) doc.comprovante = doc.comprovanteUrl;
        merged[doc.id] = doc;
      });
      const result = Object.values(merged).sort((a, b) => b.id - a.id);
      localStorage.setItem(localKey, JSON.stringify(result));
    }
  }

  // Envia ao Firestore os registros locais ausentes no Firestore.
  // Sempre sobe sem comprovante (data URL pode ser muito grande).
  _uploadMissing(colName, fsDocs) {
    if (!this._db) return;
    const localKey = colName === 'Entradas' ? 'ieteb_lancamentos' : 'ieteb_saidas';
    const local    = JSON.parse(localStorage.getItem(localKey) || '[]');
    const fsIds    = new Set(fsDocs.map(d => d.id));

    local.forEach(item => {
      if (!item.id || fsIds.has(String(item.id))) return;
      const { comprovante, ...doc } = item;
      doc.temComprovante = !!item.comprovante;
      this._db.collection(colName).doc(String(doc.id)).set(doc)
        .catch(e => console.warn('uploadMissing error:', colName, e));
    });
  }

  // Assina onSnapshot; chama onFirst(ok, docs) na primeira entrega.
  _subscribe(colName, localKey, onFirst) {
    let firstFired = false;
    return this._db.collection(colName).onSnapshot(
      snap => {
        this._mergeAndStore(localKey, snap.docs);
        if (!firstFired) {
          firstFired = true;
          if (onFirst) onFirst(true, snap.docs);
        } else {
          if (this._onDataUpdate) this._onDataUpdate();
        }
      },
      e => {
        console.warn(colName + ' snapshot error:', e);
        if (!firstFired) {
          firstFired = true;
          if (onFirst) onFirst(false, []);
        }
      }
    );
  }

  // Carga inicial: configura listeners e sobe dados locais que faltam no Firestore.
  // Cada coleção faz seu próprio upload independentemente, sem esperar pela outra.
  load(onComplete) {
    if (!this._db) { if (onComplete) onComplete(); return; }

    if (this._unsubEnt) this._unsubEnt();
    if (this._unsubSai) this._unsubSai();

    let firstEntDone = false, firstSaiDone = false;

    const checkFirst = () => {
      if (!firstEntDone || !firstSaiDone) return;
      localStorage.setItem('ieteb_sync_v1', '1'); // Firestore está acessível, ativa REPLACE
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

  // Reconecta os listeners para buscar dados frescos do servidor.
  forceRefresh(onDone) {
    if (!this._db) {
      if (this._onDataUpdate) this._onDataUpdate();
      if (onDone) onDone(false);
      return;
    }

    if (this._unsubEnt) { this._unsubEnt(); this._unsubEnt = null; }
    if (this._unsubSai) { this._unsubSai(); this._unsubSai = null; }

    let entDone = false, saiDone = false;
    const check = () => {
      if (!entDone || !saiDone) return;
      if (this._onDataUpdate) this._onDataUpdate();
      if (onDone) onDone(true);
    };

    this._unsubEnt = this._subscribe('Entradas', 'ieteb_lancamentos', () => {
      entDone = true; check();
    });
    this._unsubSai = this._subscribe('Saídas', 'ieteb_saidas', () => {
      saiDone = true; check();
    });
  }
}
