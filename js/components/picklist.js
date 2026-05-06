/**
 * PickList — converte um `<select>` nativo em uma UI custom premium,
 * consistente em desktop, tablet e celular.
 *
 * Por que existe: o `<select>` nativo abre um picker do OS no mobile
 * (roda no iOS, dialog no Android), o que conflita visualmente com os
 * dropdowns custom que o app já tem (Igreja e Aluno). Esse componente
 * substitui o picker nativo por um painel com busca, mantendo o
 * `<select>` original no DOM como source of truth (compat total: o
 * `.value`, eventos `change`, validação HTML, FormData, etc continuam
 * funcionando).
 *
 * Como usar:
 *   <select data-picklist id="curso">
 *     <option value="">Selecione...</option>
 *     <option value="x">X</option>
 *   </select>
 *
 *   No boot (main.js):
 *     PickList.initAll();
 *
 * O PickList lê os <option> do select original, esconde o select e
 * renderiza um trigger + panel logo após. Toda mudança espelha pro
 * select original e dispara `change` event nele.
 *
 * Acessibilidade:
 *  - Trigger é um <button>, foco com Tab funciona normal.
 *  - Setas ↑↓ navegam pelas opções, Enter seleciona, Esc fecha.
 *  - Atributos ARIA (combobox, listbox, option) implementados.
 */
class PickList {
  /**
   * @param {HTMLSelectElement} selectEl
   * @param {Object} opts
   * @param {boolean} [opts.searchable] - força/desabilita busca (default: auto pelo nº de opções)
   * @param {string} [opts.searchPlaceholder] - placeholder do input de busca
   */
  constructor(selectEl, opts = {}) {
    if (!selectEl || selectEl.tagName !== 'SELECT') {
      throw new Error('PickList requer um <select>');
    }
    if (selectEl._picklist) return selectEl._picklist; // idempotente
    this.select = selectEl;
    this.opts = opts;
    // Auto: ativa busca se >= 6 opções (excluindo placeholder)
    const optionCount = selectEl.options.length - (selectEl.options[0] && !selectEl.options[0].value ? 1 : 0);
    this.searchable = opts.searchable != null ? opts.searchable : optionCount >= 6;
    this._build();
    this._attachListeners();
    this._syncFromSelect();
    selectEl._picklist = this;
  }

  static initAll(root = document) {
    root.querySelectorAll('select[data-picklist]').forEach((el) => {
      try {
        new PickList(el);
      } catch (e) {
        console.warn('PickList: falha ao inicializar', el, e);
      }
    });
  }

  _build() {
    const sel = this.select;
    const placeholder = (sel.options[0] && !sel.options[0].value && sel.options[0].textContent) || 'Selecione...';
    this._placeholder = placeholder;

    // Wrapper: posicionado, mesma largura do select original
    const wrap = document.createElement('div');
    wrap.className = 'picklist';
    if (sel.disabled) wrap.classList.add('picklist--disabled');

    // Trigger (botão visível que abre o painel)
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'picklist-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = `
      <span class="picklist-value picklist-value--empty">${escHtml(placeholder)}</span>
      <svg class="picklist-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    `;

    // Painel (dropdown)
    const panel = document.createElement('div');
    panel.className = 'picklist-panel';
    panel.setAttribute('role', 'listbox');

    if (this.searchable) {
      const searchWrap = document.createElement('div');
      searchWrap.className = 'picklist-search-wrap';
      searchWrap.innerHTML = `
        <svg class="picklist-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input type="text" class="picklist-search" placeholder="${escHtml(this.opts.searchPlaceholder || 'Buscar...')}" autocomplete="off" />
      `;
      panel.appendChild(searchWrap);
    }

    const list = document.createElement('ul');
    list.className = 'picklist-options';
    panel.appendChild(list);

    wrap.appendChild(trigger);
    wrap.appendChild(panel);

    // Esconde o select original mas mantém no DOM (preserva submit, value, change events)
    sel.classList.add('picklist-native');
    sel.setAttribute('aria-hidden', 'true');
    sel.setAttribute('tabindex', '-1');
    sel.parentNode.insertBefore(wrap, sel.nextSibling);

    this.wrap = wrap;
    this.trigger = trigger;
    this.valueEl = trigger.querySelector('.picklist-value');
    this.panel = panel;
    this.search = panel.querySelector('.picklist-search');
    this.list = list;

    this._buildOptions('');
  }

  _buildOptions(filter) {
    const term = (filter || '').toLowerCase().trim();
    const selectedValue = this.select.value;
    const items = Array.from(this.select.options)
      .filter((o) => o.value !== '' || o.dataset.picklistKeep === '1') // ignora placeholder
      .filter((o) => !term || o.textContent.toLowerCase().includes(term));

    if (!items.length) {
      this.list.innerHTML = `<li class="picklist-empty">Nenhuma opção encontrada</li>`;
      return;
    }

    this.list.innerHTML = items
      .map((o) => {
        const isSel = o.value === selectedValue;
        const safeVal = o.value.replace(/"/g, '&quot;');
        return `<li class="picklist-option${isSel ? ' picklist-option--selected' : ''}"
          role="option"
          aria-selected="${isSel ? 'true' : 'false'}"
          tabindex="0"
          data-value="${safeVal}">
          <span>${escHtml(o.textContent)}</span>
          ${isSel ? '<svg class="picklist-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
        </li>`;
      })
      .join('');
  }

  _attachListeners() {
    // Toggle do painel
    this.trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.select.disabled) return;
      this.isOpen ? this.close() : this.open();
    });
    this.trigger.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.open();
        const first = this.list.querySelector('.picklist-option');
        if (first) first.focus();
      }
    });

    // Busca
    if (this.search) {
      this.search.addEventListener('input', (e) => this._buildOptions(e.target.value));
      this.search.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const first = this.list.querySelector('.picklist-option');
          if (first) first.focus();
        } else if (e.key === 'Escape') {
          this.close();
        }
      });
    }

    // Click numa opção (delegação)
    this.list.addEventListener('click', (e) => {
      const li = e.target.closest('.picklist-option');
      if (!li) return;
      this.setValue(li.dataset.value);
      this.close();
      this.trigger.focus();
    });
    this.list.addEventListener('keydown', (e) => {
      const opts = Array.from(this.list.querySelectorAll('.picklist-option'));
      const idx = opts.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = opts[Math.min(idx + 1, opts.length - 1)];
        if (next) next.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (idx <= 0 && this.search) {
          this.search.focus();
        } else {
          const prev = opts[idx - 1];
          if (prev) prev.focus();
        }
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const li = document.activeElement.closest('.picklist-option');
        if (li) {
          this.setValue(li.dataset.value);
          this.close();
          this.trigger.focus();
        }
      } else if (e.key === 'Escape') {
        this.close();
        this.trigger.focus();
      }
    });

    // Click outside fecha
    this._onDocClick = (e) => {
      if (!this.wrap.contains(e.target)) this.close();
    };

    // Sincroniza quando o select for alterado por código externo
    this.select.addEventListener('change', () => this._syncFromSelect());
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.wrap.classList.add('picklist--open');
    this.trigger.setAttribute('aria-expanded', 'true');
    if (this.search) {
      this.search.value = '';
      this._buildOptions('');
      // Pequeno delay no foco pra animação não ser interrompida
      setTimeout(() => this.search && this.search.focus(), 60);
    }
    document.addEventListener('click', this._onDocClick);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.wrap.classList.remove('picklist--open');
    this.trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', this._onDocClick);
  }

  setValue(value) {
    if (this.select.value === value) {
      this._syncFromSelect();
      return;
    }
    this.select.value = value;
    // Dispara 'change' no select original pra todos os listeners existentes
    // (validação, aplicarFiltros, _updateSubmitState etc) continuarem
    // funcionando sem nenhuma alteração.
    this.select.dispatchEvent(new Event('change', { bubbles: true }));
    this._syncFromSelect();
  }

  _syncFromSelect() {
    const opt = this.select.selectedOptions && this.select.selectedOptions[0];
    const text = opt && opt.value ? opt.textContent : this._placeholder;
    const empty = !opt || !opt.value;
    this.valueEl.textContent = text;
    this.valueEl.classList.toggle('picklist-value--empty', empty);
    if (this.list) this._buildOptions(this.search ? this.search.value : '');
  }
}
