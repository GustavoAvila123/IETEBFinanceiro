/**
 * AlunosManager — componente CRUD da lista de alunos em Entradas
 *
 * Gerencia a lista dinâmica de alunos do lançamento (nome + parcela),
 * com botões de adicionar/remover e validação dedicada.
 *
 * IDs esperados no DOM:
 *  - #alunosContainer (host das rows)
 *  - #alunosError (resumo de erros)
 *  - Para cada row criada: #alunoRow_{id}, #alunoNome_{id},
 *    #alunoParcela_{id}, #alunoNomeError_{id}, #alunoParcelaError_{id}
 *
 * Globals consumidos no HTML inline (mantidos por compat):
 *  - addAlunoRow(), removeAlunoRow(id), onlyNumbers(input)
 */
class AlunosManager {
  constructor() {
    this.nextId = 0;
  }

  init() {
    this.nextId = 0;
    document.getElementById('alunosContainer').innerHTML = this._buildRowHTML(this.nextId, true);
    this._attachListeners(this.nextId++);
  }

  addRow() {
    const id = this.nextId++;
    document.getElementById('alunosContainer').insertAdjacentHTML('beforeend', this._buildRowHTML(id, false));
    this._attachListeners(id);
  }

  removeRow(id) {
    const row = document.getElementById(`alunoRow_${id}`);
    if (row) row.remove();
  }

  getData() {
    return Array.from(document.querySelectorAll('#alunosContainer .aluno-row')).map(row => {
      const id = row.dataset.alunoId;
      return {
        nome:    document.getElementById(`alunoNome_${id}`).value.trim(),
        parcela: document.getElementById(`alunoParcela_${id}`).value.trim(),
      };
    });
  }

  validate() {
    let ok = true;
    const errEl = document.getElementById('alunosError');
    if (errEl) errEl.textContent = '';
    document.querySelectorAll('#alunosContainer .aluno-row').forEach(row => {
      const id      = row.dataset.alunoId;
      const nome    = document.getElementById(`alunoNome_${id}`).value.trim();
      const parcela = document.getElementById(`alunoParcela_${id}`).value.trim();
      const nomeErr = document.getElementById(`alunoNomeError_${id}`);
      const parErr  = document.getElementById(`alunoParcelaError_${id}`);
      if (!nome) { nomeErr.textContent = 'Informe o nome do aluno.'; ok = false; }
      else         nomeErr.textContent = '';
      if (!parcela) {
        parErr.textContent = 'Informe a parcela.';
        ok = false;
      } else {
        const n = parseInt(parcela, 10);
        if (isNaN(n) || n < 1 || n > 500) {
          parErr.textContent = 'A parcela deve ser entre 1 e 500.';
          ok = false;
        } else {
          parErr.textContent = '';
        }
      }
    });
    return ok;
  }

  _attachListeners(id) {
    const nome    = document.getElementById(`alunoNome_${id}`);
    const parcela = document.getElementById(`alunoParcela_${id}`);
    if (nome)    nome.addEventListener('input',    () => clearFieldError(`alunoNomeError_${id}`));
    if (parcela) parcela.addEventListener('input', () => clearFieldError(`alunoParcelaError_${id}`));
  }

  _buildRowHTML(id, isFirst) {
    const labelNome = isFirst
      ? `<label class="form-label" for="alunoNome_${id}">Nome do Aluno <span class="required">*</span></label>`
      : `<label class="form-label form-label--dim" for="alunoNome_${id}">Aluno adicional</label>`;

    const labelParcela = isFirst
      ? `<label class="form-label" for="alunoParcela_${id}">Parcela <span class="required">*</span></label>`
      : `<label class="form-label form-label--dim" for="alunoParcela_${id}">Parcela</label>`;

    const btn = isFirst
      ? `<button type="button" class="btn-add-aluno" onclick="addAlunoRow()" title="Adicionar outro aluno">
           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
             <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
           </svg>
         </button>`
      : `<button type="button" class="btn-remove-aluno" onclick="removeAlunoRow(${id})" title="Remover aluno">
           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
             <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
           </svg>
         </button>`;

    return `<div class="aluno-row" id="alunoRow_${id}" data-aluno-id="${id}">
      <div class="form-group">
        ${labelNome}
        <input type="text" class="form-input" id="alunoNome_${id}" placeholder="Nome completo do aluno" />
        <span class="field-error" id="alunoNomeError_${id}"></span>
      </div>
      <div class="form-group">
        ${labelParcela}
        <input type="text" class="form-input" id="alunoParcela_${id}"
               placeholder="Ex: 1" inputmode="numeric" maxlength="3" oninput="onlyNumbers(this)" />
        <span class="field-error" id="alunoParcelaError_${id}"></span>
      </div>
      <div class="aluno-row-btn">
        <span class="aluno-btn-spacer" aria-hidden="true"></span>
        ${btn}
      </div>
    </div>`;
  }
}
