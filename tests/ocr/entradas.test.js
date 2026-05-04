import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProjectGlobals, modalMock } from '../setup.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', 'fixtures', 'ocr-entradas');
const fix = name => readFileSync(join(fixturesDir, name), 'utf-8');

let extract;

beforeAll(() => {
  loadProjectGlobals([
    'js/utils/format.js',
    'js/utils/helpers.js',
    'js/ocr/entradas.js',
  ]);
  // OCREntradas é uma classe global após o eval
  // eslint-disable-next-line no-undef
  const inst = new OCREntradas(modalMock);
  extract = (text) => inst.extractFields(text);
});

describe('OCR Entradas — fixtures de bancos', () => {
  it('Inter PIX', () => {
    const r = extract(fix('inter-pix.txt'));
    expect(r.valor).toBe('R$ 120,00');
    expect(r.data).toBe('2026-04-18');
    expect(r.formaPagamento).toBe('Pix');
    expect(r.nomeRecebedor).toMatch(/Centro Educacional/i);
    expect(r.nomeDepositante).toMatch(/Laudicea/i);
    expect(r.nomeAluno).toMatch(/Laudicea/i);
    expect(r.bancoDepositante).toBe('Inter');
    expect(r.bancoRecebedor).toBe('Bradesco');
  });

  it('Nubank PIX (saldo antes do valor)', () => {
    const r = extract(fix('nubank-pix.txt'));
    // O bug clássico: pegava R$ 2.500,00 (saldo). Agora deve pegar 350,00.
    expect(r.valor).toBe('R$ 350,00');
    expect(r.data).toBe('2026-05-22');
    expect(r.formaPagamento).toBe('Pix');
    expect(r.nomeDepositante).toMatch(/Maria das Dores/i);
    expect(r.nomeRecebedor).toMatch(/Igreja Batista/i);
  });

  it('Itaú PIX (com Itaú Unibanco)', () => {
    const r = extract(fix('itau-pix.txt'));
    expect(r.valor).toBe('R$ 480,50');
    expect(r.data).toBe('2026-06-03');
    expect(r.hora).toBe('09:12');
    expect(r.formaPagamento).toBe('Pix');
    // Aceita Itaú em qualquer dos 2 campos (a ordem depende de qual
    // banco vem primeiro no array; o importante é detectar ambos).
    const bancos = [r.bancoDepositante, r.bancoRecebedor];
    expect(bancos).toContain('Itaú');
    expect(bancos).toContain('Banco do Brasil');
  });

  it('Banco do Brasil PIX (Crédito a + dia abreviado Sex.)', () => {
    const r = extract(fix('bb-pix.txt'));
    expect(r.valor).toBe('R$ 75,00');
    expect(r.data).toBe('2026-03-28');
    expect(r.hora).toBe('08:45');
    expect(r.formaPagamento).toBe('Pix');
    expect(r.nomeDepositante).toMatch(/Ana Carolina/i);
    expect(r.nomeRecebedor).toMatch(/Apollo/i);
  });

  it('PicPay PIX (Recebido por)', () => {
    const r = extract(fix('picpay-pix.txt'));
    expect(r.valor).toBe('R$ 199,90');
    expect(r.data).toBe('2026-05-12');
    expect(r.formaPagamento).toBe('Pix');
    expect(r.nomeDepositante).toMatch(/Carlos Henrique/i);
    expect(r.nomeRecebedor).toMatch(/Tesouraria/i);
  });
});

describe('OCR Entradas — heurísticas isoladas', () => {
  it('rejeita documento sem nenhum campo chave', () => {
    const r = extract('texto totalmente aleatório sem dados financeiros');
    // Pode pegar nada ou só "data" se tiver número que pareça data
    const camposChave = ['valor','data','formaPagamento','nomeDepositante','nomeRecebedor'];
    const algum = camposChave.some(k => r[k]);
    expect(algum).toBe(false);
  });

  it('detecta forma de pagamento Crédito quando texto menciona "cartão de crédito"', () => {
    const r = extract('Comprovante de cartão de crédito Visa R$ 50,00 em 01/01/2026');
    expect(r.formaPagamento).toBe('Crédito');
  });

  it('lista de bancos: detecta Inter, Nubank, Bradesco', () => {
    const r1 = extract('Banco Inter S.A. R$ 10,00 em 01/01/2026');
    expect(r1.bancoDepositante).toBe('Inter');
    const r2 = extract('Nubank R$ 10,00 em 01/01/2026');
    expect(r2.bancoDepositante).toBe('Nubank');
    const r3 = extract('Bradesco S.A. R$ 10,00 em 01/01/2026');
    expect(r3.bancoDepositante).toBe('Bradesco');
  });

  it('Banrisul é detectado (banco adicionado)', () => {
    const r = extract('Banrisul R$ 10,00 em 01/01/2026');
    expect(r.bancoDepositante).toBe('Banrisul');
  });

  it('XP é detectado (banco adicionado)', () => {
    const r = extract('XP Investimentos R$ 10,00 em 01/01/2026');
    expect(r.bancoDepositante).toBe('XP');
  });
});
