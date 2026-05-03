/**
 * Domínio Financeiro — funções puras de cálculo
 *
 * Centraliza a lógica de soma, filtro por período, agrupamento e cálculo
 * de saldo que antes estava espalhada em tesouraria.js, dashboard.js,
 * navigation.js (initHome) e monitor.js.
 *
 * Todas as funções são SEM side-effect: recebem dados, retornam números
 * ou novos arrays/objetos. Não tocam DOM nem leem localStorage.
 *
 * Convenções:
 *  - Entrada tem o campo `dataDeposito` (yyyy-mm-dd) e `valor` (string BRL)
 *  - Saída tem o campo `data` (yyyy-mm-dd) e `valor` (string BRL)
 *  - Forma de pagamento: 'Dinheiro' | 'Pix' | 'Débito' | 'Crédito'
 */

// ── Filtros por período ──────────────────────────────────────────────
// Datas em ISO yyyy-mm-dd, comparação string funciona porque é ordenável.

function filtrarEntradasPorPeriodo(entradas, deISO, ateISO) {
  return entradas.filter(i =>
    i.dataDeposito && i.dataDeposito >= deISO && i.dataDeposito <= ateISO
  );
}

function filtrarSaidasPorPeriodo(saidas, deISO, ateISO) {
  return saidas.filter(i =>
    i.data && i.data >= deISO && i.data <= ateISO
  );
}

function entradasAntes(entradas, dataLimiteISO) {
  return entradas.filter(i => i.dataDeposito && i.dataDeposito < dataLimiteISO);
}

function saidasAntes(saidas, dataLimiteISO) {
  return saidas.filter(i => i.data && i.data < dataLimiteISO);
}

// ── Somas ────────────────────────────────────────────────────────────

function somarValores(itens) {
  return itens.reduce((s, i) => s + parseBRL(i.valor), 0);
}

function somarPorFormaPagamento(itens, tipo) {
  return itens
    .filter(i => i.formaPagamento === tipo)
    .reduce((s, i) => s + parseBRL(i.valor), 0);
}

function somarPorBancarios(itens) {
  return somarPorFormaPagamento(itens, 'Pix')
       + somarPorFormaPagamento(itens, 'Débito')
       + somarPorFormaPagamento(itens, 'Crédito');
}

// ── Saldo (entradas - saídas) ────────────────────────────────────────

function calcularSaldo(entradas, saidas) {
  return somarValores(entradas) - somarValores(saidas);
}

// Saldo separado por "caixa" (dinheiro físico) e "conta" (Pix/Déb/Créd).
// Usado pela Tesouraria para reconciliar com o saldo de abertura.
function calcularSaldoSeparado(entradas, saidas, saldoAberturaDinheiro = 0, saldoAberturaConta = 0) {
  const dinheiroEnt = somarPorFormaPagamento(entradas, 'Dinheiro');
  const dinheiroSai = somarPorFormaPagamento(saidas,   'Dinheiro');
  const contaEnt    = somarPorBancarios(entradas);
  const contaSai    = somarPorBancarios(saidas);
  const dinheiro    = saldoAberturaDinheiro + dinheiroEnt - dinheiroSai;
  const conta       = saldoAberturaConta    + contaEnt    - contaSai;
  return { dinheiro, conta, total: dinheiro + conta };
}

// ── Agrupamentos ─────────────────────────────────────────────────────

// Soma valores de entradas por curso. Lida com o caso de uma entrada
// ter múltiplos alunos (cada um com seu curso) — divide o valor.
function agruparEntradasPorCurso(entradas) {
  const porCurso = {};
  entradas.forEach(i => {
    const cursos = Array.isArray(i.alunos)
      ? i.alunos.map(a => a.curso).filter(Boolean)
      : [i.curso].filter(Boolean);
    if (!cursos.length) return;
    const fatia = parseBRL(i.valor) / cursos.length;
    cursos.forEach(c => { porCurso[c] = (porCurso[c] || 0) + fatia; });
  });
  return porCurso;
}

function agruparSaidasPorCategoria(saidas) {
  const porCategoria = {};
  saidas.forEach(i => {
    const cat = i.categoria || 'Outros';
    porCategoria[cat] = (porCategoria[cat] || 0) + parseBRL(i.valor);
  });
  return porCategoria;
}

// ── Helpers de período (mês ISO yyyy-mm) ─────────────────────────────

function diasDoMes(anoMesISO) {
  const [year, month] = anoMesISO.split('-').map(Number);
  return new Date(year, month, 0).getDate();
}

function inicioFimDoMes(anoMesISO) {
  const ultimo = String(diasDoMes(anoMesISO)).padStart(2, '0');
  return { de: `${anoMesISO}-01`, ate: `${anoMesISO}-${ultimo}` };
}
