// Regressão — relatório: ordenação por data + filtro de pagamento multi.
//
// Protege 2 ajustes pedidos pelo usuário (2026-07-08):
//   1. O relatório deve sair SEMPRE do menor para o maior dia (data
//      crescente) — na tabela, na impressão e nas exportações.
//   2. O filtro de Pagamento aceita MÚLTIPLA seleção (ex.: Débito +
//      Crédito) e mostra/soma APENAS as formas selecionadas.
//
// Testa os núcleos PUROS `_ordenarPorData` e `_filtrarEOrdenar` (sem DOM)
// e o builder de impressão `_buildPrintHTML` (que ordena e soma).
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

// Propositalmente FORA de ordem, com empate de dia (10/06) em horas
// diferentes e um registro sem data (deve ir para o fim).
const ENTRADAS = [
  { dataDeposito: '2026-06-30', horaDeposito: '18:09', formaPagamento: 'Pix', valor: '100,00', nomeAluno: 'Ana', curso: 'CFAM' },
  { dataDeposito: '2026-06-05', horaDeposito: '11:46', formaPagamento: 'Débito', valor: '50,00', nomeAluno: 'Bia', curso: 'CFAM' },
  { dataDeposito: '2026-06-10', horaDeposito: '15:15', formaPagamento: 'Crédito', valor: '70,00', nomeAluno: 'Cae', curso: 'CFAM' },
  { dataDeposito: '2026-06-10', horaDeposito: '10:10', formaPagamento: 'Crédito', valor: '30,00', nomeAluno: 'Dan', curso: 'CFAM' },
  { dataDeposito: '2026-06-28', horaDeposito: '19:09', formaPagamento: 'Dinheiro', valor: '20,00', nomeAluno: 'Eva', curso: 'CFAM' },
];

const SAIDAS = [
  { data: '2026-06-08', hora: '21:00', formaPagamento: 'Dinheiro', valor: '140,00', categoria: 'Outros', fornecedor: 'X' },
  { data: '2026-06-02', hora: '10:00', formaPagamento: 'Pix', valor: '60,50', categoria: 'Material', fornecedor: 'Y' },
  { data: '2026-06-08', hora: '08:00', formaPagamento: 'Débito', valor: '10,00', categoria: 'Serviços', fornecedor: 'Z' },
];

describe('relatório — ordenação por data crescente', () => {
  it('Entradas: ordena do menor para o maior dia, desempatando por hora', () => {
    const out = makePage()._ordenarPorData(ENTRADAS, false);
    expect(out.map((r) => r.dataDeposito)).toEqual([
      '2026-06-05',
      '2026-06-10',
      '2026-06-10',
      '2026-06-28',
      '2026-06-30',
    ]);
    // Empate de dia (10/06): 10:10 vem antes de 15:15
    const dez = out.filter((r) => r.dataDeposito === '2026-06-10');
    expect(dez.map((r) => r.horaDeposito)).toEqual(['10:10', '15:15']);
  });

  it('Saídas: ordena por data e depois hora', () => {
    const out = makePage()._ordenarPorData(SAIDAS, true);
    expect(out.map((r) => `${r.data} ${r.hora}`)).toEqual([
      '2026-06-02 10:00',
      '2026-06-08 08:00',
      '2026-06-08 21:00',
    ]);
  });

  it('registro sem data vai para o FIM (não some, não quebra)', () => {
    const comVazio = [
      { dataDeposito: '', formaPagamento: 'Pix', valor: '1,00' },
      { dataDeposito: '2026-06-01', formaPagamento: 'Pix', valor: '2,00' },
    ];
    const out = makePage()._ordenarPorData(comVazio, false);
    expect(out[0].dataDeposito).toBe('2026-06-01');
    expect(out[1].dataDeposito).toBe('');
    expect(out).toHaveLength(2); // nada some
  });

  it('não muta o array original', () => {
    const copia = ENTRADAS.slice();
    makePage()._ordenarPorData(ENTRADAS, false);
    expect(ENTRADAS).toEqual(copia);
  });

  it('impressão sai com as datas em ordem crescente no HTML', () => {
    const html = makePage()._buildPrintHTML(ENTRADAS, false, 'x');
    const i05 = html.indexOf('05/06/2026');
    const i30 = html.indexOf('30/06/2026');
    expect(i05).toBeGreaterThan(-1);
    expect(i30).toBeGreaterThan(-1);
    expect(i05).toBeLessThan(i30); // menor dia aparece antes do maior
  });
});

describe('relatório — filtro de pagamento MÚLTIPLO', () => {
  it('sem seleção (array vazio) = Todos: mantém todos os registros', () => {
    const out = makePage()._filtrarEOrdenar(ENTRADAS, { pagamentos: [], isSaidas: false });
    expect(out).toHaveLength(ENTRADAS.length);
  });

  it('Débito + Crédito: retorna só essas formas', () => {
    const out = makePage()._filtrarEOrdenar(ENTRADAS, {
      pagamentos: ['Débito', 'Crédito'],
      isSaidas: false,
    });
    expect(out).toHaveLength(3);
    expect(out.every((r) => r.formaPagamento === 'Débito' || r.formaPagamento === 'Crédito')).toBe(
      true
    );
    expect(out.some((r) => r.formaPagamento === 'Pix')).toBe(false);
    // E vem ordenado por data
    expect(out.map((r) => r.dataDeposito)).toEqual(['2026-06-05', '2026-06-10', '2026-06-10']);
  });

  it('uma única forma (Pix): comporta como filtro simples', () => {
    const out = makePage()._filtrarEOrdenar(ENTRADAS, { pagamentos: ['Pix'], isSaidas: false });
    expect(out).toHaveLength(1);
    expect(out[0].formaPagamento).toBe('Pix');
  });

  it('combina com filtro de data (De/Até) e ordena', () => {
    const out = makePage()._filtrarEOrdenar(ENTRADAS, {
      de: '2026-06-06',
      ate: '2026-06-29',
      pagamentos: ['Crédito', 'Dinheiro'],
      isSaidas: false,
    });
    // 10/06 (Crédito x2) e 28/06 (Dinheiro); 30/06 Pix fica fora por forma e data
    expect(out.map((r) => r.dataDeposito)).toEqual(['2026-06-10', '2026-06-10', '2026-06-28']);
  });

  it('soma da impressão reflete APENAS as formas selecionadas', () => {
    // Débito(50) + Crédito(70+30) = 150,00
    const filtrado = makePage()._filtrarEOrdenar(ENTRADAS, {
      pagamentos: ['Débito', 'Crédito'],
      isSaidas: false,
    });
    const html = makePage()._buildPrintHTML(filtrado, false, 'x');
    expect(html).toContain('Total de Entradas');
    expect(html).toContain('R$ 150,00');
    // Não soma Pix(100) nem Dinheiro(20) → total NÃO é 270,00
    expect(html).not.toContain('R$ 270,00');
  });
});
