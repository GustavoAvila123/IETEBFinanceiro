import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProjectGlobals, modalMock } from '../setup.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', 'fixtures', 'ocr-entradas');
const fix = (name) => readFileSync(join(fixturesDir, name), 'utf-8');

let extract;

beforeAll(() => {
  loadProjectGlobals(['js/utils/format.js', 'js/utils/helpers.js', 'js/ocr/entradas.js']);
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

  // Comprovante real reportado em prod 2026-06-25: Nubank "Comprovante de
  // transferência". Duas falhas: (1) data "15JUN 2026" — o OCR grudou o dia
  // no mês (sem espaço), e o regex exigia separador; (2) recebedor sob o
  // rótulo "Destino" (não "Destinatário"/"Favorecido"/"Para") ficava vazio.
  // Fixture é o dump OCR REAL (window.__ietebOcrEntradasText).
  it('Nubank Comprovante de transferência (data "15JUN 2026" colada + rótulo "Destino")', () => {
    const r = extract(fix('nubank-transferencia.txt'));
    expect(r.valor).toBe('R$ 240,00');
    expect(r.data).toBe('2026-06-15'); // "15JUN 2026" — dia colado no mês
    expect(r.hora).toBe('19:34');
    expect(r.formaPagamento).toBe('Pix');
    // "Destino" → nomeRecebedor = Centro Educacional e Teologico Ieteb
    expect(r.nomeRecebedor).toMatch(/Centro Educacional/i);
    // "Origem" → depositante = Flávia
    expect(r.nomeDepositante).toMatch(/Flávia/i);
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

  it('Mercado Pago (R$ sem centavos, data 3/maio/2026, Banco C6 S.A.)', () => {
    const r = extract(fix('mercadopago-pix.txt'));
    expect(r.valor).toBe('R$ 200,00'); // R$ 200 → completar com ,00
    expect(r.data).toBe('2026-05-03'); // "3/maio/2026"
    expect(r.hora).toBe('17:20'); // "17h20"
    expect(r.formaPagamento).toBe('Pix');
    expect(r.nomeDepositante).toMatch(/Diogo Soares/i);
    expect(r.nomeRecebedor).toMatch(/Gustavo Soares/i);
    // Bancos: o pagador (De) vem antes do recebedor (Para) no texto,
    // então a ordem de aparição decide a atribuição correta.
    expect(r.bancoDepositante).toBe('Mercado Pago');
    expect(r.bancoRecebedor).toBe('C6');
  });

  it('Bradesco PIX (hora separada por hífen DD/MM/AAAA - HH:MM:SS)', () => {
    const r = extract(fix('bradesco-pix.txt'));
    expect(r.valor).toBe('R$ 10,00');
    expect(r.data).toBe('2026-05-03');
    expect(r.hora).toBe('19:46'); // separador "-" entre data/hora era a falha
    expect(r.formaPagamento).toBe('Pix');
    expect(r.nomeDepositante).toMatch(/Edson Soares/i);
    expect(r.nomeRecebedor).toMatch(/Igreja/i);
  });

  it('BB Pagador/Recebedor com quebra de linha (sem :)', () => {
    const r = extract(fix('bb-pagador-recebedor.txt'));
    expect(r.valor).toBe('R$ 33,00'); // não pode pegar 73,06 do CNPJ
    expect(r.data).toBe('2026-05-03');
    expect(r.formaPagamento).toBe('Pix');
    // Recebedor = Adbras Osasco (não pode aparecer em Depositante)
    expect(r.nomeRecebedor).toMatch(/Adbras\s+Osasco/i);
    // Depositante = Paula (era a falha — ficava vazio)
    expect(r.nomeDepositante).toMatch(/Paula/i);
  });

  // Bug reportado em prod 2026-05-14: cupom Cielo de cartão de crédito
  // estava virando nomeDepositante="Via Loja" (cabeçalho do cupom),
  // nomeRecebedor="Vista" (de "CREDITO A VISTA"), hora vazia. Casos:
  //   1) "VIA LOJA" não pode virar nome de loja (header genérico)
  //   2) "CREDITO A VISTA" é forma de pagamento, não nome do favorecido
  //   3) hora HH:MM isolada no cabeçalho ("09/05/26 • 11:20") precisa ser lida
  //   4) Bandeira (Mastercard) tem prioridade sobre maquininha (Cielo)
  //      pro campo nomeRecebedor (label "Bandeira" na UI)
  it('Cielo cupom crédito limpo (regressão prod 2026-05-14)', () => {
    const r = extract(fix('cielo-credito-cupom.txt'));
    expect(r.valor).toBe('R$ 114,00');
    expect(r.data).toBe('2026-05-09');
    expect(r.hora).toBe('11:20');
    expect(r.formaPagamento).toBe('Crédito');
    // Bandeira tem prioridade sobre maquininha (Cielo) — não pode virar "Vista"
    expect(r.nomeRecebedor).toBe('Mastercard');
    // Loja deve ser o nome do estabelecimento antes do CNPJ —
    // não pode virar "Via Loja" do cabeçalho
    expect(r.nomeDepositante).toMatch(/Centro Educacional/i);
    expect(r.nomeDepositante).not.toMatch(/^Via Loja$/i);
  });

  // Segunda variante do cupom Cielo, simulando OCR REAL ruidoso reportado
  // pelo usuário em 2026-05-14: data com separadores tortos ("09/05/26 *"
  // em vez de "•"), hora com ponto em vez de dois pontos ("11.20"), e
  // linha extra de ruído OCR entre o nome e o CNPJ ("Een À E /").
  it('Cielo cupom crédito OCR ruidoso (regressão prod 2026-05-14)', () => {
    const r = extract(fix('cielo-credito-cupom-ocr-ruido.txt'));
    expect(r.valor).toBe('R$ 114,00');
    expect(r.data).toBe('2026-05-09');
    expect(r.hora).toBe('11:20');
    expect(r.formaPagamento).toBe('Crédito');
    expect(r.nomeRecebedor).toBe('Mastercard');
    // O ruído "Een À E /" entre o nome e o CNPJ NÃO pode entrar no nome
    expect(r.nomeDepositante).toBe('Centro Educacional');
    expect(r.nomeDepositante).not.toMatch(/Een/);
    expect(r.nomeDepositante).not.toMatch(/\//);
  });
});

describe('OCR Entradas — heurísticas isoladas', () => {
  it('rejeita documento sem nenhum campo chave', () => {
    const r = extract('texto totalmente aleatório sem dados financeiros');
    // Pode pegar nada ou só "data" se tiver número que pareça data
    const camposChave = ['valor', 'data', 'formaPagamento', 'nomeDepositante', 'nomeRecebedor'];
    const algum = camposChave.some((k) => r[k]);
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

  it('valor: tolera "$" lido como "S" pela OCR (RS 200 → R$ 200,00)', () => {
    // Tesseract frequentemente lê o "$" como "S" em comprovantes.
    // Sem o fallback tolerante, valor ficava vazio e o usuário
    // precisava digitar manualmente.
    const r = extract('Comprovante de Pix\nRS 200\nDe João\nPara Maria');
    expect(r.valor).toBe('R$ 200,00');
  });

  it('valor: tolera "$" lido como "5" pela OCR (R5 350,00)', () => {
    const r = extract('Comprovante\nR5 350,00\nPix recebido');
    expect(r.valor).toBe('R$ 350,00');
  });

  it('valor: heurística agressiva pega número curto sem R$ (OCR perdeu o símbolo)', () => {
    // Cenário: Tesseract degradou o "R$" completamente. A linha do valor
    // virou só o número. Heurística do "linha curta no topo + filtros"
    // deve resgatá-lo. CPFs/datas/IDs próximos não podem confundir.
    const txt = [
      'Comprovante de Pix',
      '3/maio/2026', // tem "/" → ignorado
      '200', // ← este é o valor
      'De',
      'Diogo Soares de Avila',
      'CPF: ***.365.708-**', // máscara CPF → ignorado
      'Mercado Pago',
      'Para',
      'Gustavo Soares de Avila',
      '157548267626', // ID 12 dígitos sem separador → ignorado
    ].join('\n');
    const r = extract(txt);
    expect(r.valor).toBe('R$ 200,00');
  });

  it('valor: heurística NÃO confunde "C6" / "S2" de nome de banco com valor', () => {
    // Cenário real do Mercado Pago: o "R$ 200" foi destruído pelo OCR
    // mas o "BANCO C6 S.A." sobreviveu. Não pode pegar "6" como valor.
    const txt = ['Comprovante de Pix', 'BANCO C6 S.A.', 'Mercado Pago', 'Diogo', 'Gustavo'].join(
      '\n'
    );
    const r = extract(txt);
    // Sem nenhum candidato válido → valor fica indefinido (melhor que errado)
    expect(r.valor).toBeUndefined();
  });

  it('valor: heurística agressiva NÃO confunde CPF/CNPJ/ID com valor', () => {
    // Sem nenhuma pista de valor → não inventa nada (CPF/ID rejeitados)
    const txt = [
      'Comprovante',
      'CPF: ***.365.708-**',
      'Agência 4867-x',
      'Conta 11573-8',
      'ID transação F00000202605032122144399FA046',
      '0800 729 2722',
    ].join('\n');
    const r = extract(txt);
    expect(r.valor).toBeUndefined();
  });
});
