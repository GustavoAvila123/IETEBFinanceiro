// Setup de testes — Vitest
//
// Os módulos do projeto foram escritos para o ambiente browser, sem
// import/export (declaram funções/classes no escopo global). Para testar
// no Node sem reescrever os arquivos, lemos o código deles e avaliamos
// no escopo do módulo de teste, com helpers disponíveis em globalThis.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

/**
 * Carrega um ou mais arquivos JS do projeto e expõe seus símbolos
 * (declarações `function`, `class`, `var/const` no topo) em globalThis,
 * simulando o que o browser faz quando concatena scripts.
 *
 * Usamos `vm.runInThisContext` em vez de `eval` para que as declarações
 * realmente fiquem acessíveis em globalThis dentro de módulos ES.
 *
 * @param {string[]} relativePaths — caminhos relativos à raiz do repo
 */
export function loadProjectGlobals(relativePaths) {
  const code = relativePaths.map((p) => readFileSync(join(root, p), 'utf-8')).join('\n');

  // Wrap: encerra cada declaração em globalThis para garantir exposição
  // mesmo quando o arquivo declara `class X` ou `function fn()` no topo.
  const wrapper = `
    ${code}
    // Coleta exports comuns (declarações no topo do arquivo) em globalThis
    try { globalThis.OCREntradas = typeof OCREntradas !== 'undefined' ? OCREntradas : globalThis.OCREntradas; } catch(_){}
    try { globalThis.OCRSaidas   = typeof OCRSaidas   !== 'undefined' ? OCRSaidas   : globalThis.OCRSaidas;   } catch(_){}
    try { globalThis.parseBRL    = typeof parseBRL    !== 'undefined' ? parseBRL    : globalThis.parseBRL;    } catch(_){}
    try { globalThis.formatBRL   = typeof formatBRL   !== 'undefined' ? formatBRL   : globalThis.formatBRL;   } catch(_){}
    try { globalThis.dateInputToISO = typeof dateInputToISO !== 'undefined' ? dateInputToISO : globalThis.dateInputToISO; } catch(_){}
    try { globalThis.isoToDateInput = typeof isoToDateInput !== 'undefined' ? isoToDateInput : globalThis.isoToDateInput; } catch(_){}
    try { globalThis.escHtml     = typeof escHtml     !== 'undefined' ? escHtml     : globalThis.escHtml;     } catch(_){}
    try { globalThis.toTitleCase = typeof toTitleCase !== 'undefined' ? toTitleCase : globalThis.toTitleCase; } catch(_){}
    try { globalThis.truncate    = typeof truncate    !== 'undefined' ? truncate    : globalThis.truncate;    } catch(_){}
    try { globalThis.setInput    = typeof setInput    !== 'undefined' ? setInput    : globalThis.setInput;    } catch(_){}
    try { globalThis.loadScript  = typeof loadScript  !== 'undefined' ? loadScript  : globalThis.loadScript;  } catch(_){}
    try { globalThis.onlyNumbers = typeof onlyNumbers !== 'undefined' ? onlyNumbers : globalThis.onlyNumbers; } catch(_){}
    try { globalThis.clearFieldError = typeof clearFieldError !== 'undefined' ? clearFieldError : globalThis.clearFieldError; } catch(_){}
    try { globalThis.filtrarEntradasPorPeriodo = typeof filtrarEntradasPorPeriodo !== 'undefined' ? filtrarEntradasPorPeriodo : globalThis.filtrarEntradasPorPeriodo; } catch(_){}
    try { globalThis.filtrarSaidasPorPeriodo   = typeof filtrarSaidasPorPeriodo   !== 'undefined' ? filtrarSaidasPorPeriodo   : globalThis.filtrarSaidasPorPeriodo;   } catch(_){}
    try { globalThis.entradasAntes  = typeof entradasAntes  !== 'undefined' ? entradasAntes  : globalThis.entradasAntes;  } catch(_){}
    try { globalThis.saidasAntes    = typeof saidasAntes    !== 'undefined' ? saidasAntes    : globalThis.saidasAntes;    } catch(_){}
    try { globalThis.somarValores   = typeof somarValores   !== 'undefined' ? somarValores   : globalThis.somarValores;   } catch(_){}
    try { globalThis.somarPorFormaPagamento = typeof somarPorFormaPagamento !== 'undefined' ? somarPorFormaPagamento : globalThis.somarPorFormaPagamento; } catch(_){}
    try { globalThis.somarPorBancarios      = typeof somarPorBancarios      !== 'undefined' ? somarPorBancarios      : globalThis.somarPorBancarios;      } catch(_){}
    try { globalThis.calcularSaldo          = typeof calcularSaldo          !== 'undefined' ? calcularSaldo          : globalThis.calcularSaldo;          } catch(_){}
    try { globalThis.calcularSaldoSeparado  = typeof calcularSaldoSeparado  !== 'undefined' ? calcularSaldoSeparado  : globalThis.calcularSaldoSeparado;  } catch(_){}
    try { globalThis.agruparEntradasPorCurso     = typeof agruparEntradasPorCurso     !== 'undefined' ? agruparEntradasPorCurso     : globalThis.agruparEntradasPorCurso;     } catch(_){}
    try { globalThis.agruparSaidasPorCategoria   = typeof agruparSaidasPorCategoria   !== 'undefined' ? agruparSaidasPorCategoria   : globalThis.agruparSaidasPorCategoria;   } catch(_){}
    try { globalThis.diasDoMes      = typeof diasDoMes      !== 'undefined' ? diasDoMes      : globalThis.diasDoMes;      } catch(_){}
    try { globalThis.inicioFimDoMes = typeof inicioFimDoMes !== 'undefined' ? inicioFimDoMes : globalThis.inicioFimDoMes; } catch(_){}
    try { globalThis.badgePagamento = typeof badgePagamento !== 'undefined' ? badgePagamento : globalThis.badgePagamento; } catch(_){}
    try { globalThis.getCurrentUser = typeof getCurrentUser !== 'undefined' ? getCurrentUser : globalThis.getCurrentUser; } catch(_){}
    try { globalThis.getEntradasData = typeof getEntradasData !== 'undefined' ? getEntradasData : globalThis.getEntradasData; } catch(_){}
    try { globalThis.getSaidasData   = typeof getSaidasData   !== 'undefined' ? getSaidasData   : globalThis.getSaidasData;   } catch(_){}
  `;
  vm.runInThisContext(wrapper);
}

/**
 * Mock mínimo de modal para instanciar classes que dependem dele.
 */
export const modalMock = {
  toasts: [],
  opened: [],
  showToast(msg, type) {
    this.toasts.push({ msg, type });
  },
  showNotif(msg, type) {
    this.toasts.push({ msg, type });
  },
  open(id) {
    this.opened.push(id);
  },
  close(id) {
    /* no-op */
  },
  reset() {
    this.toasts.length = 0;
    this.opened.length = 0;
  },
};
