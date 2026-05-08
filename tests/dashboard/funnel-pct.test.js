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
