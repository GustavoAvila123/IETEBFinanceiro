import { describe, it, expect } from 'vitest';

// Replica EXATA do cálculo de pct usado em dashboard.js
// _buildFunnelEntradasMetrics — pct.toFixed(2) com vírgula brasileira.
function calcPctsFormatted(items) {
  const total = items.reduce((s, it) => s + it.value, 0);
  return items.map((it) => {
    const pct = total > 0 ? (it.value / total) * 100 : 0;
    return pct.toFixed(2).replace('.', ',');
  });
}

function calcPctsRaw(items) {
  const total = items.reduce((s, it) => s + it.value, 0);
  return items.map((it) => (total > 0 ? (it.value / total) * 100 : 0));
}

describe('funnel pct calc', () => {
  it('valores diferentes geram pcts distintos com 2 casas', () => {
    const items = [
      { label: 'A', value: 100 },
      { label: 'B', value: 80 },
      { label: 'C', value: 60 },
      { label: 'D', value: 40 },
    ];
    const fmt = calcPctsFormatted(items);
    expect(fmt).toEqual(['35,71', '28,57', '21,43', '14,29']);
    // Soma raw = 100%
    const sum = calcPctsRaw(items).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(100, 5);
  });

  it('valores IGUAIS dão 25,00% pra todos (4 itens)', () => {
    const items = [
      { value: 87.1 },
      { value: 87.1 },
      { value: 87.1 },
      { value: 87.1 },
    ];
    expect(calcPctsFormatted(items)).toEqual(['25,00', '25,00', '25,00', '25,00']);
  });

  it('valores muito próximos arredondam todos pra ~25,00 (esperado)', () => {
    // Caso real reportado: 348,49 / 348,45 / 348,44 / 348,40
    // Pcts reais: 25,0032 / 25,0004 / 24,9996 / 24,9968
    // Com 2 casas todos viram 25,00 — é o comportamento desejado.
    const items = [
      { value: 348.49 },
      { value: 348.45 },
      { value: 348.44 },
      { value: 348.4 },
    ];
    expect(calcPctsFormatted(items)).toEqual(['25,00', '25,00', '25,00', '25,00']);
  });

  it('lista vazia retorna []', () => {
    expect(calcPctsFormatted([])).toEqual([]);
  });

  it('um item só dá 100,00%', () => {
    expect(calcPctsFormatted([{ value: 348.4 }])).toEqual(['100,00']);
  });

  it('vírgula brasileira em vez de ponto', () => {
    const items = [
      { value: 33.333 },
      { value: 33.333 },
      { value: 33.334 },
    ];
    const fmt = calcPctsFormatted(items);
    fmt.forEach((s) => {
      expect(s).toMatch(/^\d+,\d{2}$/);
      expect(s).not.toContain('.');
    });
  });
});
