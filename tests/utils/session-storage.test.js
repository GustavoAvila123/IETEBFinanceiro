// Unit tests pros helpers de sessionId em helpers.js.
//
// Esses helpers (getSessionId / setSessionId / clearSessionId) escrevem
// em localStorage E sessionStorage simultaneamente — redundância pra
// resistir a iOS Safari Private Mode (onde localStorage pode falhar
// silenciosamente). Os testes simulam ambos os storages e validam o
// comportamento de fallback + persistência.

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { loadProjectGlobals } from '../setup.js';

// Mock simples de Storage compatível com a API que os helpers usam.
function createMockStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    clear: () => data.clear(),
    _size: () => data.size,
  };
}

beforeAll(() => {
  globalThis.localStorage = createMockStorage();
  globalThis.sessionStorage = createMockStorage();
  loadProjectGlobals(['js/utils/helpers.js']);
});

beforeEach(() => {
  globalThis.localStorage.clear();
  globalThis.sessionStorage.clear();
});

describe('setSessionId', () => {
  it('grava em localStorage E sessionStorage simultaneamente', () => {
    setSessionId('abc-123');
    expect(localStorage.getItem('ieteb_session_id')).toBe('abc-123');
    expect(sessionStorage.getItem('ieteb_session_id')).toBe('abc-123');
  });

  it('ignora valores falsy (null, undefined, "")', () => {
    setSessionId('');
    setSessionId(null);
    setSessionId(undefined);
    expect(localStorage.getItem('ieteb_session_id')).toBeNull();
    expect(sessionStorage.getItem('ieteb_session_id')).toBeNull();
  });

  it('sobrescreve valor existente em ambos storages', () => {
    setSessionId('old');
    setSessionId('new');
    expect(localStorage.getItem('ieteb_session_id')).toBe('new');
    expect(sessionStorage.getItem('ieteb_session_id')).toBe('new');
  });
});

describe('getSessionId', () => {
  it('retorna do localStorage quando presente', () => {
    localStorage.setItem('ieteb_session_id', 'from-local');
    expect(getSessionId()).toBe('from-local');
  });

  it('retorna do sessionStorage quando localStorage está vazio', () => {
    sessionStorage.setItem('ieteb_session_id', 'from-session');
    expect(getSessionId()).toBe('from-session');
  });

  it('prefere localStorage quando ambos têm valor', () => {
    localStorage.setItem('ieteb_session_id', 'from-local');
    sessionStorage.setItem('ieteb_session_id', 'from-session');
    expect(getSessionId()).toBe('from-local');
  });

  it('retorna null quando nenhum tem valor', () => {
    expect(getSessionId()).toBeNull();
  });

  it('cai no sessionStorage quando localStorage.getItem lança (Safari Private)', () => {
    const original = globalThis.localStorage;
    globalThis.localStorage = {
      getItem() {
        throw new Error('QuotaExceeded');
      },
      setItem() {},
      removeItem() {},
    };
    sessionStorage.setItem('ieteb_session_id', 'fallback');
    expect(getSessionId()).toBe('fallback');
    globalThis.localStorage = original;
  });

  it('retorna null quando ambos os storages lançam erro', () => {
    const origLocal = globalThis.localStorage;
    const origSession = globalThis.sessionStorage;
    globalThis.localStorage = {
      getItem() {
        throw new Error('blocked');
      },
    };
    globalThis.sessionStorage = {
      getItem() {
        throw new Error('blocked');
      },
    };
    expect(getSessionId()).toBeNull();
    globalThis.localStorage = origLocal;
    globalThis.sessionStorage = origSession;
  });
});

describe('clearSessionId', () => {
  it('limpa de ambos storages', () => {
    setSessionId('abc');
    clearSessionId();
    expect(localStorage.getItem('ieteb_session_id')).toBeNull();
    expect(sessionStorage.getItem('ieteb_session_id')).toBeNull();
  });

  it('é idempotente (não falha quando já está vazio)', () => {
    expect(() => clearSessionId()).not.toThrow();
    expect(() => {
      clearSessionId();
      clearSessionId();
    }).not.toThrow();
  });

  it('não afeta outras chaves em localStorage', () => {
    localStorage.setItem('ieteb_user', 'something');
    setSessionId('abc');
    clearSessionId();
    expect(localStorage.getItem('ieteb_user')).toBe('something');
    expect(localStorage.getItem('ieteb_session_id')).toBeNull();
  });
});

describe('round-trip: set → get → clear', () => {
  it('ciclo completo funciona com UUID', () => {
    const sid = 'd7f3e5a1-4b2c-4e8f-9a1b-2c3d4e5f6a7b';
    setSessionId(sid);
    expect(getSessionId()).toBe(sid);
    clearSessionId();
    expect(getSessionId()).toBeNull();
  });

  it('múltiplos sets sobrepõem corretamente', () => {
    setSessionId('one');
    expect(getSessionId()).toBe('one');
    setSessionId('two');
    expect(getSessionId()).toBe('two');
    setSessionId('three');
    expect(getSessionId()).toBe('three');
  });
});
