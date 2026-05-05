import { describe, it, expect, beforeAll } from 'vitest';
import { loadProjectGlobals } from '../setup.js';

beforeAll(() => {
  // financeiro.js depende de parseBRL (do format.js)
  loadProjectGlobals(['js/utils/format.js', 'js/domain/financeiro.js']);
});

const E = (data, valor, formaPagamento, extra = {}) => ({
  dataDeposito: data,
  valor,
  formaPagamento,
  ...extra,
});
const S = (data, valor, formaPagamento, extra = {}) => ({
  data,
  valor,
  formaPagamento,
  ...extra,
});

describe('filtrarEntradasPorPeriodo / filtrarSaidasPorPeriodo', () => {
  const entradas = [
    E('2026-04-01', '100,00', 'Pix'),
    E('2026-04-15', '200,00', 'Dinheiro'),
    E('2026-05-01', '300,00', 'Pix'),
  ];
  const saidas = [S('2026-04-10', '50,00', 'Débito'), S('2026-05-05', '80,00', 'Crédito')];

  it('filtra entradas dentro do intervalo (inclusivo)', () => {
    const r = filtrarEntradasPorPeriodo(entradas, '2026-04-01', '2026-04-30');
    expect(r).toHaveLength(2);
    expect(r[0].valor).toBe('100,00');
    expect(r[1].valor).toBe('200,00');
  });

  it('filtra saídas dentro do intervalo', () => {
    const r = filtrarSaidasPorPeriodo(saidas, '2026-04-01', '2026-04-30');
    expect(r).toHaveLength(1);
    expect(r[0].valor).toBe('50,00');
  });

  it('ignora itens sem data', () => {
    const r = filtrarEntradasPorPeriodo([{ valor: '10,00' }], '2026-01-01', '2026-12-31');
    expect(r).toHaveLength(0);
  });
});

describe('entradasAntes / saidasAntes', () => {
  const entradas = [E('2026-03-15', '100,00', 'Pix'), E('2026-04-15', '200,00', 'Pix')];
  it('pega só anteriores ao corte (estrito)', () => {
    const r = entradasAntes(entradas, '2026-04-01');
    expect(r).toHaveLength(1);
    expect(r[0].valor).toBe('100,00');
  });
});

describe('somarValores / somarPorFormaPagamento / somarPorBancarios', () => {
  const itens = [
    E('2026-04-01', '100,00', 'Pix'),
    E('2026-04-02', '200,00', 'Dinheiro'),
    E('2026-04-03', '50,00', 'Débito'),
    E('2026-04-04', '30,50', 'Crédito'),
  ];

  it('somarValores soma todos os valores', () => {
    expect(somarValores(itens)).toBeCloseTo(380.5);
  });

  it('somarValores em array vazio retorna 0', () => {
    expect(somarValores([])).toBe(0);
  });

  it('somarPorFormaPagamento filtra por tipo', () => {
    expect(somarPorFormaPagamento(itens, 'Pix')).toBe(100);
    expect(somarPorFormaPagamento(itens, 'Dinheiro')).toBe(200);
    expect(somarPorFormaPagamento(itens, 'Crédito')).toBe(30.5);
  });

  it('somarPorBancarios soma Pix + Débito + Crédito', () => {
    expect(somarPorBancarios(itens)).toBeCloseTo(180.5);
  });
});

describe('calcularSaldo', () => {
  it('subtrai saídas das entradas', () => {
    const ent = [E('2026-04-01', '500,00', 'Pix')];
    const sai = [S('2026-04-02', '120,00', 'Débito')];
    expect(calcularSaldo(ent, sai)).toBe(380);
  });
});

describe('calcularSaldoSeparado', () => {
  it('separa por dinheiro físico vs conta', () => {
    const ent = [
      E('2026-04-01', '100,00', 'Dinheiro'),
      E('2026-04-02', '50,00', 'Pix'),
      E('2026-04-03', '30,00', 'Débito'),
    ];
    const sai = [S('2026-04-04', '20,00', 'Dinheiro'), S('2026-04-05', '10,00', 'Pix')];
    const r = calcularSaldoSeparado(ent, sai, 0, 0);
    expect(r.dinheiro).toBe(80); // 100 - 20
    expect(r.conta).toBe(70); // (50+30) - 10
    expect(r.total).toBe(150);
  });

  it('respeita saldo de abertura', () => {
    const r = calcularSaldoSeparado([], [], 200, 500);
    expect(r.dinheiro).toBe(200);
    expect(r.conta).toBe(500);
    expect(r.total).toBe(700);
  });
});

describe('agruparEntradasPorCurso', () => {
  it('agrupa por curso direto', () => {
    const ent = [
      E('2026-04-01', '100,00', 'Pix', { curso: 'CFAM' }),
      E('2026-04-02', '200,00', 'Pix', { curso: 'CFAM' }),
      E('2026-04-03', '50,00', 'Pix', { curso: 'Bacharel em Teologia' }),
    ];
    const r = agruparEntradasPorCurso(ent);
    expect(r['CFAM']).toBe(300);
    expect(r['Bacharel em Teologia']).toBe(50);
  });

  it('divide valor entre múltiplos alunos com cursos diferentes', () => {
    const ent = [
      E('2026-04-01', '100,00', 'Pix', {
        alunos: [{ curso: 'CFAM' }, { curso: 'Bacharel em Teologia' }],
      }),
    ];
    const r = agruparEntradasPorCurso(ent);
    expect(r['CFAM']).toBe(50);
    expect(r['Bacharel em Teologia']).toBe(50);
  });

  it('ignora entradas sem curso', () => {
    const r = agruparEntradasPorCurso([E('2026-04-01', '100,00', 'Pix')]);
    expect(Object.keys(r)).toHaveLength(0);
  });
});

describe('agruparSaidasPorCategoria', () => {
  it('agrupa por categoria', () => {
    const sai = [
      S('2026-04-01', '500,00', 'Débito', { categoria: 'Pagamento de Professor' }),
      S('2026-04-02', '50,00', 'Pix', { categoria: 'Material de Escritório' }),
      S('2026-04-03', '30,00', 'Pix', { categoria: 'Material de Escritório' }),
    ];
    const r = agruparSaidasPorCategoria(sai);
    expect(r['Pagamento de Professor']).toBe(500);
    expect(r['Material de Escritório']).toBe(80);
  });

  it('saídas sem categoria viram "Outros"', () => {
    const sai = [S('2026-04-01', '100,00', 'Pix')];
    const r = agruparSaidasPorCategoria(sai);
    expect(r['Outros']).toBe(100);
  });
});

describe('inicioFimDoMes / diasDoMes', () => {
  it('retorna primeiro e último dia do mês', () => {
    const r = inicioFimDoMes('2026-04');
    expect(r.de).toBe('2026-04-01');
    expect(r.ate).toBe('2026-04-30');
  });

  it('lida com fevereiro não-bissexto', () => {
    expect(diasDoMes('2026-02')).toBe(28);
  });

  it('lida com fevereiro bissexto', () => {
    expect(diasDoMes('2024-02')).toBe(29);
  });
});
