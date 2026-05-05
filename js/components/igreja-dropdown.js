/**
 * IgrejaDropdown — componente de busca/seleção de igreja em Entradas
 *
 * Gerencia o dropdown que aparece quando o usuário clica/digita no
 * campo "Igreja". Usa a constante global CHURCHES como fonte.
 *
 * IDs esperados no DOM:
 *  - #churchDropdown (container das opções)
 *  - #igreja (hidden input com o valor selecionado)
 *  - #igrejaSearch (input de busca)
 *  - #igrejaError (span de erro)
 *  - .select-search-wrap (wrapper para detectar click outside)
 */
class IgrejaDropdown {
  constructor() {
    this._closeOutside = (e) => {
      const wrap = document.querySelector('.select-search-wrap');
      if (wrap && !wrap.contains(e.target)) this._close();
    };
  }

  build(filter) {
    const dd = document.getElementById('churchDropdown');
    const selected = document.getElementById('igreja').value;
    const term = (filter || '').toLowerCase().trim();
    const list = term ? CHURCHES.filter((c) => c.toLowerCase().includes(term)) : CHURCHES;

    if (!list.length) {
      dd.innerHTML =
        '<div class="church-option" style="color:#8090b0;cursor:default">Nenhuma encontrada</div>';
      return;
    }

    dd.innerHTML = list
      .map((c) => {
        const sel = c === selected;
        const safe = c.replace(/'/g, "\\'");
        return `<div class="church-option${sel ? ' church-option--selected' : ''}"
        tabindex="0"
        onclick="selectChurch('${safe}')"
        onkeydown="if(event.key==='Enter'||event.key===' ')selectChurch('${safe}')">
        ${escHtml(c)}
      </div>`;
      })
      .join('');
  }

  open() {
    this.build(document.getElementById('igrejaSearch').value);
    document.getElementById('churchDropdown').classList.add('church-dropdown--open');
    document.addEventListener('mousedown', this._closeOutside);
  }

  filter(val) {
    this.build(val);
    document.getElementById('churchDropdown').classList.add('church-dropdown--open');
    document.getElementById('igreja').value = '';
  }

  select(value) {
    document.getElementById('igreja').value = value;
    document.getElementById('igrejaSearch').value = value;
    this._close();
    document.getElementById('igrejaError').textContent = '';
  }

  _close() {
    document.getElementById('churchDropdown').classList.remove('church-dropdown--open');
    document.removeEventListener('mousedown', this._closeOutside);
  }
}
