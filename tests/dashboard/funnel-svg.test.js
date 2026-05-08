// Smoke + snapshot tests do funil 3D (entradas + saídas).
//
// Garante que mudanças futuras NÃO quebrem:
//   - geração do SVG (não lança exception com 0/1/2/3/4 items)
//   - quantidade correta de discos renderizados
//   - prefix de IDs SVG (ent_ vs sai_) — evita colisão entre os 2 funis
//   - escape de XSS em labels (escHtml)
//   - paletas distintas entre entradas (gold/azul) e saídas (vermelho)
//   - estrutura da legenda (rank, label, valor + pct em pt-BR)
//
// Snapshot tests: travam o HTML/SVG gerado. Qualquer mudança na
// estrutura dispara `vitest -u` pra revisão consciente. Não impede
// mudança — só obriga você a confirmar que era intencional.
import { describe, it, expect, beforeAll } from 'vitest';
import { loadProjectGlobals, modalMock } from '../setup.js';

beforeAll(() => {
  // dashboard.js depende de helpers/format pra escHtml e formatBRL
  loadProjectGlobals([
    'js/utils/format.js',
    'js/utils/helpers.js',
    'js/pages/dashboard.js',
  ]);
  // expõe DashboardPage no globalThis (declarações `class` no topo
  // do arquivo viram globais via loadProjectGlobals)
  globalThis.DashboardPage = globalThis.DashboardPage || DashboardPage;
});

function makeDash() {
  return new DashboardPage(modalMock);
}

const FOUR_ITEMS = [
  { label: 'CFAM', value: 600 },
  { label: 'Capacitação de Professor', value: 350 },
  { label: 'Bacharel em Teologia', value: 240 },
  { label: 'Básico Teologia', value: 140 },
];

const FOUR_SAIDAS = [
  { label: 'Pagamento de Professor', value: 348.49 },
  { label: 'Material de Escritório', value: 348.45 },
  { label: 'Outros', value: 348.44 },
  { label: 'Serviços', value: 348.4 },
];

describe('funil SVG — smoke tests (não pode quebrar)', () => {
  it('entradas: gera SVG com 4 stages', () => {
    const dash = makeDash();
    const svg = dash._buildFunnelEntradasSVG(FOUR_ITEMS);
    expect(svg).toContain('class="funnel-svg"');
    const stageCount = (svg.match(/class="funnel-stage"/g) || []).length;
    expect(stageCount).toBe(4);
  });

  it('saídas: gera SVG com 4 stages', () => {
    const dash = makeDash();
    const svg = dash._buildFunnelSaidasSVG(FOUR_SAIDAS);
    expect(svg).toContain('class="funnel-svg"');
    const stageCount = (svg.match(/class="funnel-stage"/g) || []).length;
    expect(stageCount).toBe(4);
  });

  it('IDs SVG são prefixados (ent_ vs sai_) — evita colisão no DOM', () => {
    const dash = makeDash();
    const svgEnt = dash._buildFunnelEntradasSVG(FOUR_ITEMS);
    const svgSai = dash._buildFunnelSaidasSVG(FOUR_SAIDAS);
    expect(svgEnt).toContain('id="ent_discBody0"');
    expect(svgEnt).toContain('id="ent_discTop0"');
    expect(svgEnt).not.toContain('id="sai_');
    expect(svgSai).toContain('id="sai_discBody0"');
    expect(svgSai).toContain('id="sai_discTop0"');
    expect(svgSai).not.toContain('id="ent_');
  });

  it('paleta entradas tem cor GOLD no #1', () => {
    const dash = makeDash();
    const svg = dash._buildFunnelEntradasSVG(FOUR_ITEMS);
    // Ranking 0 (líder) usa palette gold (#fff5c8 no top, #f5d97a no body)
    expect(svg).toContain('#fff5c8');
    expect(svg).toContain('#f5d97a');
  });

  it('paleta saídas tem cor VERMELHO ESCURO no #1', () => {
    const dash = makeDash();
    const svg = dash._buildFunnelSaidasSVG(FOUR_SAIDAS);
    // Ranking 0 (líder despesa) usa palette bordô profundo (#5a0a10)
    expect(svg).toContain('#5a0a10');
    expect(svg).toContain('#7a1018');
  });

  it('escapa HTML no label (XSS guard)', () => {
    const dash = makeDash();
    const malicioso = [
      { label: '<script>alert("xss")</script>', value: 100 },
      { label: 'B', value: 50 },
    ];
    const svg = dash._buildFunnelEntradasSVG(malicioso);
    // Não pode aparecer <script> literal no output
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('alert("xss")');
    // Mas a versão escapada sim
    expect(svg).toContain('&lt;script&gt;');
  });

  it('aria-label tem texto descritivo (acessibilidade)', () => {
    const dash = makeDash();
    expect(dash._buildFunnelEntradasSVG(FOUR_ITEMS)).toMatch(
      /aria-label="Funil 3D premium de entradas/
    );
    expect(dash._buildFunnelSaidasSVG(FOUR_SAIDAS)).toMatch(
      /aria-label="Funil 3D premium de despesas/
    );
  });

  it('lida com 1, 2, 3, 4 items sem quebrar', () => {
    const dash = makeDash();
    for (let n = 1; n <= 4; n++) {
      const items = FOUR_ITEMS.slice(0, n);
      expect(() => dash._buildFunnelEntradasSVG(items)).not.toThrow();
      expect(() => dash._buildFunnelSaidasSVG(items)).not.toThrow();
      const svg = dash._buildFunnelEntradasSVG(items);
      const stageCount = (svg.match(/class="funnel-stage"/g) || []).length;
      expect(stageCount).toBe(n);
    }
  });

  it('métricas: rank #N + R$ + 2 casas decimais com vírgula', () => {
    const dash = makeDash();
    const total = FOUR_ITEMS.reduce((s, it) => s + it.value, 0);
    const html = dash._buildFunnelEntradasMetrics(FOUR_ITEMS, total);
    // 4 items renderizados
    expect((html.match(/class="funnel-metric-item"/g) || []).length).toBe(4);
    // Rank #1 a #4
    expect(html).toContain('#1');
    expect(html).toContain('#2');
    expect(html).toContain('#3');
    expect(html).toContain('#4');
    // Pct com vírgula brasileira + 2 casas decimais
    expect(html).toMatch(/\d+,\d{2}%/);
    // Não pode ter ponto decimal no pct (formato pt-BR)
    expect(html).not.toMatch(/\d+\.\d{2}%/);
    // data-attributes pra debug/inspector
    expect(html).toContain('data-value=');
    expect(html).toContain('data-total=');
    expect(html).toContain('data-pct=');
  });

  it('métricas: 4 items idênticos dão 25,00% pra todos (regression)', () => {
    const dash = makeDash();
    const items = [
      { label: 'A', value: 87.1 },
      { label: 'B', value: 87.1 },
      { label: 'C', value: 87.1 },
      { label: 'D', value: 87.1 },
    ];
    const total = 348.4;
    const html = dash._buildFunnelEntradasMetrics(items, total);
    // Esperado: 4 ocorrências de "25,00%"
    const matches = html.match(/25,00%/g) || [];
    expect(matches.length).toBe(4);
  });
});

// ── SNAPSHOTS ──────────────────────────────────────────────────────────
// Travam o HTML/SVG gerado. Qualquer mudança de estrutura dispara
// `vitest -u` pra atualizar a snapshot. Não impede mudança intencional —
// só obriga revisão consciente do diff.
describe('funil SVG — snapshots (regressão visual de estrutura)', () => {
  it('SVG entradas (4 items) bate com snapshot', () => {
    const dash = makeDash();
    expect(dash._buildFunnelEntradasSVG(FOUR_ITEMS)).toMatchSnapshot();
  });

  it('SVG saídas (4 items) bate com snapshot', () => {
    const dash = makeDash();
    expect(dash._buildFunnelSaidasSVG(FOUR_SAIDAS)).toMatchSnapshot();
  });

  it('legenda (4 items entradas) bate com snapshot', () => {
    const dash = makeDash();
    const total = FOUR_ITEMS.reduce((s, it) => s + it.value, 0);
    expect(dash._buildFunnelEntradasMetrics(FOUR_ITEMS, total)).toMatchSnapshot();
  });

  it('legenda (4 items saídas com valores quase iguais) bate com snapshot', () => {
    const dash = makeDash();
    const total = FOUR_SAIDAS.reduce((s, it) => s + it.value, 0);
    expect(dash._buildFunnelEntradasMetrics(FOUR_SAIDAS, total)).toMatchSnapshot();
  });
});
