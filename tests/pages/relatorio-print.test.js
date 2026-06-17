// Regressão — relatório de impressão (PROD, relatado em 2026-06-10).
//
// Protege 3 ajustes feitos a pedido do usuário:
//   1. Modo RETRATO cortava colunas (Valor sumia). A tabela precisa
//      conter TODAS as colunas no HTML; o "caber" é garantido por CSS
//      (table-layout fixed em @media print orientation:portrait) — aqui
//      validamos que nenhuma coluna foi removida do HTML gerado.
//   2. Linha de TOTAL de Entradas (soma dos valores) no rodapé.
//   3. Linha de TOTAL de Saídas (soma dos valores) no rodapé.
//
// Testa o builder PURO `_buildPrintHTML`, que monta o mesmo HTML usado
// tanto no retrato quanto na paisagem (o printArea é único; o que muda
// entre orientações é só CSS).
import { describe, it, expect, beforeAll } from 'vitest';
import { loadProjectGlobals, modalMock } from '../setup.js';

beforeAll(() => {
  loadProjectGlobals([
    'js/utils/format.js', // parseBRL, formatBRL
    'js/utils/helpers.js', // escHtml
    'js/domain/financeiro.js', // somarValores
    'js/pages/relatorios.js', // RelatorioPage
  ]);
  globalThis.RelatorioPage = globalThis.RelatorioPage || RelatorioPage;
});

function makePage() {
  return new RelatorioPage(modalMock, {});
}

const ENTRADAS = [
  {
    dataDeposito: '2026-06-08',
    horaDeposito: '21:35',
    nomeAluno: 'Sem Nome',
    curso: 'CFAM',
    igreja: 'Ad Brás Osasco',
    formaPagamento: 'Débito',
    nomeDepositante: 'IETEB',
    bancoDepositante: '',
    bancoRecebedor: '',
    valor: '140,00',
  },
  {
    dataDeposito: '2026-06-06',
    horaDeposito: '19:22',
    nomeAluno: 'Lena Cleia',
    curso: 'Básico Teologia',
    igreja: 'Ad Brás Osasco Sede',
    formaPagamento: 'Débito',
    nomeDepositante: 'IETEB',
    valor: '120,00',
  },
  {
    dataDeposito: '2026-06-06',
    horaDeposito: '08:54',
    nomeAluno: 'Gil Ribeiro',
    curso: 'Capacitação de Professor',
    igreja: 'Ad Brás Osasco Sede',
    formaPagamento: 'Débito',
    nomeDepositante: 'IETEB',
    valor: '100,00',
  },
];

const SAIDAS = [
  {
    data: '2026-06-08',
    hora: '21:00',
    categoria: 'Outros',
    fornecedor: 'Ruben Antonio Marinao',
    formaPagamento: 'Dinheiro',
    valor: '140,00',
  },
  {
    data: '2026-06-07',
    hora: '10:00',
    categoria: 'Material',
    fornecedor: 'Papelaria Central',
    formaPagamento: 'Pix',
    valor: '60,50',
  },
];

describe('relatório de impressão — colunas (modo retrato)', () => {
  it('Entradas: HTML mantém TODAS as colunas (incl. Valor)', () => {
    const html = makePage()._buildPrintHTML(ENTRADAS, false, '10/06/2026, 17:42');
    [
      'Data',
      'Hora',
      'Aluno',
      'Curso',
      'Igreja',
      'Pagamento',
      'Depositante',
      'Banco Dep.',
      'Banco Rec.',
      'Valor',
    ].forEach((col) => expect(html).toContain(`>${col}</th>`));
  });

  it('Saídas: HTML mantém TODAS as colunas (incl. Valor)', () => {
    const html = makePage()._buildPrintHTML(SAIDAS, true, '10/06/2026, 17:44');
    ['Data', 'Hora', 'Categoria', 'Fornecedor', 'Pagamento', 'Valor'].forEach((col) =>
      expect(html).toContain(`>${col}</th>`)
    );
  });
});

describe('relatório de impressão — linha de TOTAL', () => {
  it('Entradas: soma correta (140 + 120 + 100 = 360,00)', () => {
    const html = makePage()._buildPrintHTML(ENTRADAS, false, 'x');
    expect(html).toContain('print-total-row');
    expect(html).toContain('Total de Entradas');
    expect(html).toContain('R$ 360,00');
  });

  it('Saídas: soma correta (140 + 60,50 = 200,50)', () => {
    const html = makePage()._buildPrintHTML(SAIDAS, true, 'x');
    expect(html).toContain('print-total-row');
    expect(html).toContain('Total de Saídas');
    expect(html).toContain('R$ 200,50');
  });

  it('lista vazia soma R$ 0,00', () => {
    const html = makePage()._buildPrintHTML([], false, 'x');
    expect(html).toContain('Total de Entradas');
    expect(html).toContain('R$ 0,00');
  });

  it('colspan do total alinha o valor: 9 (entradas) / 5 (saídas)', () => {
    const ent = makePage()._buildPrintHTML(ENTRADAS, false, 'x');
    const sai = makePage()._buildPrintHTML(SAIDAS, true, 'x');
    expect(ent).toContain('colspan="9"');
    expect(sai).toContain('colspan="5"');
  });

  // Regressão do bug PROD (2026-06-17): a impressão era cortada em 1 página
  // e o total (no fim) sumia. Parte da correção foi tirar a linha do <tfoot>
  // (que repetiria no rodapé de CADA página) e colocá-la como ÚLTIMA linha
  // do <tbody> (aparece UMA vez, no fim do relatório).
  it('total fica DENTRO do tbody (não em tfoot) e como última linha', () => {
    const html = makePage()._buildPrintHTML(ENTRADAS, false, 'x');
    expect(html).not.toContain('<tfoot');
    // A linha de total vem depois da última linha de dados e antes de </tbody>
    const idxTotal = html.indexOf('print-total-row');
    const idxCloseTbody = html.indexOf('</tbody>');
    expect(idxTotal).toBeGreaterThan(-1);
    expect(idxTotal).toBeLessThan(idxCloseTbody);
    // Aparece só uma vez
    expect(html.split('print-total-row').length - 1).toBe(1);
  });
});

describe('relatório de impressão — XSS', () => {
  it('escapa caracteres maliciosos em nome de aluno', () => {
    const evil = [{ ...ENTRADAS[0], nomeAluno: '<script>alert(1)</script>' }];
    const html = makePage()._buildPrintHTML(evil, false, 'x');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
