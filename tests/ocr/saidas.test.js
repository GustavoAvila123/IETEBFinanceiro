import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProjectGlobals, modalMock } from '../setup.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', 'fixtures', 'ocr-saidas');
const fix = (name) => readFileSync(join(fixturesDir, name), 'utf-8');

let extract, detectarTipo;

beforeAll(() => {
  loadProjectGlobals(['js/utils/format.js', 'js/utils/helpers.js', 'js/ocr/saidas.js']);
  // eslint-disable-next-line no-undef
  const inst = new OCRSaidas(modalMock);
  extract = (text) => inst.extractFields(text);
  detectarTipo = (lower) => inst._detectarTipoDoc(lower);
});

describe('OCR Saídas — fixtures por tipo', () => {
  it('NFC-e MercadoCar (texto APÓS o CNPJ na linha)', () => {
    const r = extract(fix('nfce-mercadocar.txt'));
    expect(r.fornecedor).toMatch(/Mercadocar/i);
    expect(r.valor).toBe('R$ 348,40');
    expect(r.data).toBe('2026-04-18');
    expect(r.formaPagamento).toBe('Crédito');
  });

  it('NFC-e Carrefour (texto ANTES do CNPJ na linha)', () => {
    const r = extract(fix('nfce-carrefour.txt'));
    expect(r.fornecedor).toMatch(/Carrefour/i);
    expect(r.valor).toBe('R$ 46,68');
    expect(r.data).toBe('2026-04-18');
    expect(r.formaPagamento).toBe('Crédito');
  });

  it('NFS-e (Prestador de Serviços + Valor do Serviço)', () => {
    const r = extract(fix('nfse-servico.txt'));
    expect(r.fornecedor).toMatch(/Consultoria Alfa/i);
    // Valor do Serviço bate antes do "valor a pagar".
    // O formatador faz toFixed(2).replace('.', ',') — sem milhar.
    expect(r.valor).toBe('R$ 2500,00');
    expect(r.data).toBe('2026-04-10');
  });

  it('Boleto pago (Cedente + Valor do documento)', () => {
    const r = extract(fix('boleto-pago.txt'));
    expect(r.fornecedor).toMatch(/Energia Eletrica/i);
    expect(r.valor).toBe('R$ 580,00');
    expect(r.data).toBe('2026-04-15');
  });

  it('PIX para PJ (recibo de Pix com CNPJ)', () => {
    const r = extract(fix('recibo-pix-pf.txt'));
    expect(r.valor).toBe('R$ 850,00');
    expect(r.data).toBe('2026-05-02');
    expect(r.formaPagamento).toBe('Pix');
  });
});

describe('OCR Saídas — _detectarTipoDoc', () => {
  it('detecta NFC-e', () => {
    expect(detectarTipo('cupom fiscal nfc-e')).toBe('nfce');
  });
  it('detecta NF-e/DANFE', () => {
    expect(detectarTipo('danfe nota fiscal eletronica')).toBe('nfe');
  });
  it('detecta NFS-e', () => {
    expect(detectarTipo('nfs-e nota fiscal de servicos')).toBe('nfse');
  });
  it('detecta boleto', () => {
    expect(detectarTipo('boleto codigo de barras 34191')).toBe('boleto');
  });
  it('detecta pix', () => {
    expect(detectarTipo('comprovante de pix enviado')).toBe('pix');
  });
  it('detecta recibo', () => {
    expect(detectarTipo('recibo recebi de fulano a importancia de')).toBe('recibo');
  });
  it('fallback genérico', () => {
    expect(detectarTipo('texto qualquer')).toBe('generico');
  });
});

describe('OCR Saídas — heurísticas isoladas', () => {
  it('forma de pagamento "crédito" sozinho NÃO é mais Crédito (era falso positivo)', () => {
    const r = extract(
      'texto com palavra crédito ao consumidor R$ 100,00 em 01/01/2026 fornecedor LTDA'
    );
    expect(r.formaPagamento).not.toBe('Crédito');
  });

  it('forma de pagamento Crédito quando contexto explícito', () => {
    const r = extract('Pagamento via crédito Visa R$ 50,00 em 01/01/2026 LOJA TESTE LTDA');
    expect(r.formaPagamento).toBe('Crédito');
  });

  it('_fornecedorParecValido rejeita lixo de OCR', () => {
    // eslint-disable-next-line no-undef
    const inst = new OCRSaidas(modalMock);
    expect(inst._fornecedorParecValido('Nannn—— ——*')).toBe(false);
    expect(inst._fornecedorParecValido('AAAAAAAA')).toBe(false);
    expect(inst._fornecedorParecValido('—')).toBe(false);
    expect(inst._fornecedorParecValido('Carrefour Comercio')).toBe(true);
    expect(inst._fornecedorParecValido('MercadoCar Mercantil de Pecas Ltda')).toBe(true);
  });
});
