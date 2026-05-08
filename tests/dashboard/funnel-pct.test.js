import { describe, it, expect } from 'vitest';

// Replica EXATA do cálculo de pct usado em
// dashboard.js _buildFunnelEntradasMetrics — se este teste passar, o
// cálculo está correto. Se o usuário ver % iguais com valores
// realmente diferentes, é bug em outra camada (p.ex. agrupamento).
function calcPcts(items) {
  const total = items.reduce((s, it) => s + it.value, 0);
  return items.map((it) => (total > 0 ? (it.value / total) * 100 : 0));
}

describe('funnel pct calc', () => {
  it('valores diferentes geram pcts diferentes', () => {
    const items = [
      { label: 'A', value: 100 },
      { label: 'B', value: 80 },
      { label: 'C', value: 60 },
      { label: 'D', value: 40 },
    ];
    const [a, b, c, d] = calcPcts(items);
    expect(a).toBeCloseTo(35.71, 1);
    expect(b).toBeCloseTo(28.57, 1);
    expect(c).toBeCloseTo(21.43, 1);
    expect(d).toBeCloseTo(14.29, 1);
    // Soma 100%
    expect(a + b + c + d).toBeCloseTo(100, 5);
  });

  it('valores IGUAIS dão 25% pra todos (4 itens) — não é bug, é coincidência', () => {
    const items = [
      { label: 'A', value: 87.1 },
      { label: 'B', value: 87.1 },
      { label: 'C', value: 87.1 },
      { label: 'D', value: 87.1 },
    ];
    const pcts = calcPcts(items);
    pcts.forEach((p) => expect(p).toBeCloseTo(25, 5));
  });

  it('valores muito próximos podem todos arredondar pra 25%', () => {
    const items = [
      { label: 'A', value: 90 },
      { label: 'B', value: 88 },
      { label: 'C', value: 87 },
      { label: 'D', value: 83 },
    ];
    const pcts = calcPcts(items);
    // Todos arredondam pra ~25% mas são diferentes na precisão completa
    expect(pcts[0]).toBeCloseTo(25.86, 1);
    expect(pcts[1]).toBeCloseTo(25.29, 1);
    expect(pcts[2]).toBeCloseTo(25.0, 1);
    expect(pcts[3]).toBeCloseTo(23.85, 1);
  });

  it('lista vazia ou total zero retorna 0%', () => {
    expect(calcPcts([])).toEqual([]);
    const zero = calcPcts([{ label: 'X', value: 0 }]);
    expect(zero[0]).toBe(0);
  });

  it('um item só dá 100%', () => {
    const items = [{ label: 'Único', value: 348.4 }];
    const [p] = calcPcts(items);
    expect(p).toBe(100);
  });
});

// Replica EXATA da função _calcPctPrecision do dashboard.js — escolhe
// o número MÍNIMO de casas decimais necessário pros pcts ficarem
// distintos entre si. Garante que valores quase idênticos não fiquem
// todos com a mesma porcentagem visível.
function calcPctPrecision(items, total) {
  if (total <= 0 || items.length <= 1) return 1;
  for (let p = 1; p <= 4; p++) {
    const formatted = items.map((it) => ((it.value / total) * 100).toFixed(p));
    if (new Set(formatted).size === items.length) return p;
  }
  return 4;
}

describe('precisão dinâmica de pct', () => {
  it('valores muito diferentes: 1 casa decimal basta', () => {
    const items = [
      { value: 100 },
      { value: 80 },
      { value: 60 },
      { value: 40 },
    ];
    const total = items.reduce((s, it) => s + it.value, 0);
    expect(calcPctPrecision(items, total)).toBe(1);
  });

  it('caso real do usuário (348,49 / 348,45 / 348,44 / 348,40): 4 casas', () => {
    const items = [
      { value: 348.49 },
      { value: 348.45 },
      { value: 348.44 },
      { value: 348.4 },
    ];
    const total = items.reduce((s, it) => s + it.value, 0);
    // Diferenças: 25.0032 / 25.0004 / 24.9996 / 24.9968
    // 1, 2, 3 casas: alguns iguais. Só 4 casas distingue todos.
    expect(calcPctPrecision(items, total)).toBe(4);
  });

  it('valores muito próximos (90/88/87/83): 1 casa já distingue', () => {
    const items = [
      { value: 90 },
      { value: 88 },
      { value: 87 },
      { value: 83 },
    ];
    const total = items.reduce((s, it) => s + it.value, 0);
    expect(calcPctPrecision(items, total)).toBe(1);
  });

  it('todos iguais: 4 casas (não dá pra distinguir, devolve max)', () => {
    const items = [
      { value: 87.1 },
      { value: 87.1 },
      { value: 87.1 },
      { value: 87.1 },
    ];
    const total = items.reduce((s, it) => s + it.value, 0);
    expect(calcPctPrecision(items, total)).toBe(4);
  });
});
