import { describe, it, expect, beforeAll } from 'vitest';
import { loadProjectGlobals } from '../setup.js';

beforeAll(() => {
  loadProjectGlobals(['js/utils/format.js']);
});

describe('parseBRL', () => {
  it('converte string BRL com vírgula em número', () => {
    expect(parseBRL('100,00')).toBe(100);
    expect(parseBRL('1.234,56')).toBeCloseTo(1234.56);
    expect(parseBRL('0,01')).toBeCloseTo(0.01);
  });

  it('aceita string sem milhar', () => {
    expect(parseBRL('1234,56')).toBeCloseTo(1234.56);
  });

  it('retorna 0 para string vazia ou inválida', () => {
    expect(parseBRL('')).toBe(0);
    expect(parseBRL(null)).toBe(0);
    expect(parseBRL(undefined)).toBe(0);
  });

  it('NÃO suporta prefixo R$ (retorna 0) — caller deve remover antes', () => {
    // Documenta o comportamento atual: parseBRL espera só os dígitos.
    // Se um dia mudar pra suportar 'R$ ...', este teste pega.
    expect(parseBRL('R$ 100,50')).toBe(0);
  });
});

describe('formatBRL', () => {
  it('formata número com vírgula e duas casas', () => {
    expect(formatBRL(100)).toBe('100,00');
    expect(formatBRL(1234.56)).toBe('1.234,56');
    expect(formatBRL(0)).toBe('0,00');
  });

  it('aceita valores negativos', () => {
    expect(formatBRL(-50)).toBe('-50,00');
  });
});

describe('dateInputToISO / isoToDateInput', () => {
  it('converte DD/MM/AAAA para ISO', () => {
    expect(dateInputToISO('15/04/2026')).toBe('2026-04-15');
  });

  it('retorna vazio para input incompleto', () => {
    expect(dateInputToISO('15/04')).toBe('');
    expect(dateInputToISO('')).toBe('');
  });

  it('converte ISO de volta para DD/MM/AAAA', () => {
    expect(isoToDateInput('2026-04-15')).toBe('15/04/2026');
  });

  it('roundtrip', () => {
    const br = '01/01/2026';
    const iso = dateInputToISO(br);
    expect(isoToDateInput(iso)).toBe(br);
  });
});
