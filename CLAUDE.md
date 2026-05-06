# IETEB Financeiro — Guia do projeto

Sistema de gestão financeira: registra entradas (mensalidades de cursos
teológicos), saídas (despesas), gera relatórios, dashboard e monitora
sessões de testers. Roda no navegador, hospedado no GitHub Pages, com
persistência no Firebase Firestore.

## ⚠️ Branches — workflow obrigatório

A partir de 2026-05-05 o projeto opera em DUAS branches:

- **`dev`** — branch de desenvolvimento. **TODA mudança vai aqui primeiro.**
- **`master`** — branch de produção. **Só recebe merges após autorização explícita do dono do projeto.**

Detalhes completos em [RELEASE.md](RELEASE.md). Resumo do dia-a-dia:

```bash
git checkout dev               # SEMPRE começar aqui
# ... mudanças, commits ...
git push origin dev            # CI roda lint+test, NÃO deploya nada

# Quando dono autorizar a release:
git checkout master
git merge --ff-only dev
git push origin master         # dispara deploy-prod.yml automático
```

**Regra absoluta para o agente:** nunca commitar direto em `master`.
Sempre em `dev`. Promoção só com pedido explícito do usuário.

## Stack

- **Frontend**: HTML + JS vanilla (sem build), CSS único
- **Auth**: Firebase Authentication (Email/Password)
- **Persistência**: Firestore + cache em `localStorage`
- **OCR**: Tesseract.js (imagens) + pdf.js (PDFs vetorizados)
- **Charts**: Chart.js (carregado sob demanda)
- **Export**: jsPDF/autotable + SheetJS (xlsx) — sob demanda
- **Tests**: Vitest
- **PWA**: manifest.json + service worker (cache offline)

## Como rodar localmente

```bash
# Servir o app (qualquer servidor HTTP estático)
python -m http.server 8000
# OU
npx serve .

# Abrir em http://localhost:8000
```

> Não há build. `index.html` carrega os JS direto da pasta `js/`.

## Como rodar os testes

```bash
npm install        # primeira vez
npm test           # roda todos os testes uma vez
npm run test:watch # roda em modo watch
```

Os testes rodam **automaticamente**:

- **Antes de cada commit** (via `.githooks/pre-commit`) — bloqueia se falhar
- **Em cada push para master** (via `.github/workflows/test.yml`)

Para pular o hook em um commit específico:

```bash
git commit --no-verify -m "..."
```

## Estrutura de pastas

```
js/
  config.js              # USERS, CHURCHES, MESES, DASH_COLORS
  main.js                # wiring: instancia tudo + window.* globals
  utils/
    helpers.js           # escHtml, getCurrentUser, getEntradas/Saidas
    format.js            # parseBRL, formatBRL, dateInputToISO
  domain/
    financeiro.js        # somas, saldos, agrupamentos (puro, sem DOM)
  components/
    igreja-dropdown.js   # dropdown de igreja (Entradas)
    alunos-manager.js    # CRUD da lista de alunos (Entradas)
  core/
    modal.js             # ModalManager: open/close + scroll lock
    firebase.js          # FirebaseManager: auth + firestore + sessoes
    navigation.js        # NavigationManager: showPage, sidebar
  ocr/
    entradas.js          # OCREntradas: extrai dados de comprovante PIX
    saidas.js            # OCRSaidas: extrai dados de NF/cupom/boleto
  pages/
    login.js             # tela de login + auto-logout 5min
    entradas.js          # página Lançamento de Entradas
    saidas.js            # página Lançamento de Saídas
    relatorios.js        # tabela + filtros + export PDF/Excel
    tesouraria.js        # saldo do mês + entradas/saídas
    dashboard.js         # gráficos + filtro mês/ano + datas
    monitor.js           # admin: sessões dos testers + tempo logado

tests/
  setup.js               # helper para carregar globals do projeto
  fixtures/              # textos de OCR salvos como .txt
    ocr-entradas/
    ocr-saidas/
  utils/format.test.js
  domain/financeiro.test.js
  ocr/entradas.test.js
  ocr/saidas.test.js

.githooks/
  pre-commit             # roda testes + bumpa cache-buster
.github/workflows/
  test.yml               # CI no GitHub
firestore.rules          # regras de acesso (auth + role)
storage.rules            # regras de Storage
netlify.toml             # config + headers HTTP (se migrar)
```

## Decisões importantes

### Por que Firebase Auth?

Antes a auth era 100% client-side (tudo em `sessionStorage`). Era bypassável.
Hoje cada user tem conta no Firebase Auth com email derivado do legacyId
(ex.: `tester1@ieteb.app`). As rules do Firestore validam `request.auth.uid`
contra o doc `/Users/{uid}.role` para distinguir admin/tester.

### Por que cache-buster (`?v=YYYYMMDDx`)?

GitHub Pages serve com cache agressivo. Sem o `?v=`, mudanças em `.js`/`.css`
podem não chegar no usuário até que ele limpe o cache. O hook pre-commit
bumpa automaticamente toda vez que algum `.js`/`.css` é commitado:

- Mesmo dia: a → b → c ...
- Dia novo: reseta para 'a'

### Por que `escHtml` em todos os `innerHTML`?

Defesa contra XSS. Tudo que vem de `localStorage` ou OCR pode conter
caracteres maliciosos.

### Por que Otsu na binarização do OCR?

Cupons fiscais amassados/com sombra ficam ilegíveis com threshold fixo.
Otsu calcula o threshold ideal a partir do histograma. Combinado com
contraste 1.6× e PSM=4 do Tesseract, dá boa cobertura para NFC-e.

### Por que módulos no escopo global (sem ESM)?

Decisão pragmática: sem build, scripts são concatenados pelo browser.
Para os testes no Node, usamos `eval` controlado em `tests/setup.js` que
carrega os arquivos no escopo global do módulo de teste.

## PWA (Progressive Web App)

O app é instalável e funciona offline com cache básico.

- **Instalável**: o navegador mostra prompt "Adicionar à tela inicial"
  automaticamente quando o usuário acessa por uma 2ª vez.
- **Banner próprio** (`#pwaInstallBanner`) aparece após o login, em
  mobile, com botão "Instalar" (Android) ou instruções (iOS).
- **Cache**: `sw.js` na raiz com 3 estratégias:
  - **Network-first** para HTML/JS/CSS (pega versão nova quando online)
  - **Cache-first** para imagens/assets locais
  - **Network-only** para Firestore/Auth (não cacheia dados de banco)
- **Versionamento**: bumpe `CACHE_VERSION` em `sw.js` para forçar
  invalidação total do cache do SW (raro — só se mudar estrutura).

### Testar PWA local

```bash
npx serve .  # SW só funciona em https ou localhost
# Abrir http://localhost:3000 e clicar em "Instalar" no Chrome
```

### Quando bumpar CACHE_VERSION em sw.js

- Se mudar a lista APP_SHELL ou a estratégia de roteamento
- Se um bug de cache estiver "preso" no client e o ?v=YYYYMMDDx
  do index.html não conseguir invalidar
- (No dia a dia, o ?v= já cuida da maioria dos casos.)

## Como adicionar uma nova página

1. Adicionar HTML em `index.html` dentro de `<main class="page-content page-content--hidden" id="pageX">`
2. Criar `js/pages/x.js` com classe `XPage` (init, resetPage, render)
3. Adicionar `<script src="js/pages/x.js?v=...">` em `index.html`
4. Em `js/main.js`: `const x = new XPage(...)` e `window.initX = () => x.init();`
5. Em `js/core/navigation.js`: adicionar 'x' no array de páginas e o resetPage no switch

## Como adicionar um novo banco no OCR

Editar `js/ocr/entradas.js` (ou `saidas.js`), na lista `bancos`:

```js
['NomeDoBanco', /regex_que_casa_no_texto/i],
```

E em `normalizarBanco()` adicionar o mesmo nome.

Sempre adicionar um teste em `tests/ocr/entradas.test.js` ou `saidas.test.js`.

## Onde está o que

| Quero...                                 | Vai em                                      |
| ---------------------------------------- | ------------------------------------------- |
| Mudar a aparência                        | `lancamento.css`                            |
| Adicionar campo no formulário de entrada | `index.html` + `js/pages/entradas.js`       |
| Mudar regra de cálculo de saldo          | `js/domain/financeiro.js`                   |
| Adicionar banco/operadora no OCR         | `js/ocr/entradas.js` ou `saidas.js`         |
| Mudar regras de quem vê o quê            | `firestore.rules`                           |
| Mudar headers HTTP (Netlify)             | `netlify.toml`                              |
| Mudar headers HTTP (GitHub Pages)        | meta `<http-equiv>` em `index.html`         |
| Adicionar teste                          | `tests/...` (segue o padrão dos existentes) |

## Cache-buster atual

Está no `?v=` dos `<script>` e `<link>` do `index.html`. Se precisar bumpar
manualmente, troque os 16 ocorrências de uma vez (ou use o hook).
