# IETEB Financeiro — Runbook

Guia operacional para tarefas críticas, debug de incidentes e procedimentos
administrativos. Complementa o [CLAUDE.md](CLAUDE.md) (que cobre arquitetura).

---

## 1. Acesso e contas

> 📘 **Para criar/desativar/trocar usuários:** ver [CRIAR_USUARIO.md](CRIAR_USUARIO.md) — passo a passo completo com prints e templates.
>
> **Princípio de segurança:** senhas vivem APENAS no Firebase Auth
> (server-side, criptografadas). Não existem senhas no código nem no
> `config.js`. Toda criação/troca/desativação é feita pelo Firebase
> Console — nunca por commit.

### 1.1 Adicionar um novo usuário (admin ou tester)

1. **Firebase Console → Authentication → Users → Add user**
   - Email: `<legacyId>@ieteb.app` (legacyId em minúsculo, sem acento;
     ex.: `tester5@ieteb.app`, `avila@ieteb.app`)
   - Password: senha forte (ex.: gerada por gerenciador de senhas)
   - Clica **Add user**. Copia o **UID** mostrado na lista.
2. **Firebase Console → Firestore Database → coleção `Users`** → adiciona
   um novo documento com **Document ID = o UID copiado** e os campos:
   ```
   legacyId : string  → "tester5"      (mesmo legacyId usado no email)
   name     : string  → "Nome Completo"
   role     : string  → "tester"       (ou "admin")
   active   : boolean → true
   ```
3. Comunica ao usuário: ele faz login com `<legacyId>` (ex.: "Tester5")
   e a senha que você definiu. Ele pode trocar a senha depois pelo
   DevTools (F12 → Console → `firebase.auth().currentUser.updatePassword('nova-senha')`)
   ou pedir um reset (1.2).

### 1.2 Trocar a senha de um usuário

- **Pelo próprio usuário (recomendado, sem privilégio admin):**
  - Logado no app, abre DevTools → Console:
    ```js
    firebase.auth().currentUser.updatePassword('nova-senha-forte');
    ```
- **Pelo admin (sem mexer no código):**
  - Não dá pra setar senha específica direto pelo Firebase Console
    (apenas mandar email reset, que requer email funcional).
  - Caminho prático: **deletar a conta no Auth** (1.4 passos 1-2)
    **e recriar** com a senha nova (1.1). O UID muda, então o doc
    `/Users/{uid}` antigo precisa ser apagado e recriado com o novo UID.

### 1.3 Resetar dados de um usuário (sem deletar a conta)

1. Console Firebase → Firestore Database
2. Filtrar `Entradas` (e `Saidas`, sem acento) onde `userId == "TesterX"`
3. Deletar manualmente OU via script:
   ```js
   // No console do navegador, logado como admin:
   const db = firebase.firestore();
   db.collection('Entradas')
     .where('userId', '==', 'Tester3')
     .get()
     .then((s) => s.docs.forEach((d) => d.ref.delete()));
   ```

### 1.4 Excluir conta de tester

1. Console Firebase → Authentication → Users → deletar `testerX@ieteb.app`
2. Firestore → `/Users/{uid}` do tester → deletar
3. (Opcional) Limpar dados criados por esse legacyId (ver 1.3)

### 1.5 Desativar temporariamente (sem apagar)

1. Firestore → `/Users/{uid}` → setar `active: false`
2. Quando reativar: voltar `active: true`. (Hoje as rules ainda não
   bloqueiam por `active`; quando habilitar, as rules vão filtrar
   automaticamente.)

---

## 2. Cache-buster e Service Worker

### 2.1 Bumpar cache-buster manualmente

- Padrão: `?v=AAAAMMDD<letra>`. Letra incrementa a cada commit do dia (`a`→`b`→`c`...),
  reseta para `a` no dia seguinte.
- O pre-commit hook (`.githooks/pre-commit`) faz isso **automaticamente** quando
  algum `.js`/`.css` é commitado. Para forçar manualmente: alterar todas as 16+
  ocorrências de `?v=...` no `index.html`.

### 2.2 Bumpar `CACHE_VERSION` do Service Worker

- Em [sw.js](sw.js), variável `CACHE_VERSION`.
- **Quando bumpar:**
  - Após mudar a lista `APP_SHELL` (arquivos pré-cacheados)
  - Após mudar estratégia de roteamento
  - Quando algum bug de cache ficar "preso" no cliente e o `?v=` do `index.html`
    não conseguir invalidar (raro)
- Formato: `ieteb-v<N>-<YYYYMMDD>`. Bumpar `<N>` quando mudar estrutura grande.

### 2.3 Forçar refresh em clientes "presos"

1. **Desktop:** `Ctrl+Shift+R` (Windows/Linux) ou `Cmd+Shift+R` (Mac).
2. **Chrome DevTools:** Application → Service Workers → Unregister → reload.
3. **PWA mobile:** fechar app totalmente (swipe-up) e reabrir.
4. **Caso extremo:** Configurações do Safari/Chrome → "Limpar dados do site".

---

## 3. Incidentes

### 3.1 Firebase fora do ar / login não funciona

1. Verifique [Firebase Status](https://status.firebase.google.com/).
2. Se for problema do Firebase: avisar usuários, esperar normalizar.
3. Se for específico do app:
   - Console do navegador → ver erros de rede e CSP.
   - Conferir [firestore.rules](firestore.rules) — alguma regra recém-deployada
     pode estar bloqueando leituras válidas.
   - Conferir App Check (quando habilitado) — token expirado?
4. Workaround temporário: o app tem cache em `localStorage`, então leituras
   funcionam offline. Escritas falham silenciosamente até voltar a conexão.

### 3.2 OCR não consegue ler um comprovante

**Diagnóstico:**

1. O modal "Confirmar dados lidos" abre? Se não, o Tesseract falhou ao
   classificar o documento como comprovante (heurística `camposChave`).
2. Algum campo veio vazio? Provavelmente o regex específico não casou.

**Fluxo de calibração:**

1. Reativar temporariamente o bloco `<details>Ver texto detectado (debug)</details>`
   no `#ocrModal` ([index.html:1559](index.html)).
2. Pedir ao usuário um print + o texto bruto que o Tesseract entregou.
3. Adicionar fixture em `tests/fixtures/ocr-entradas/<nome>.txt` reproduzindo
   o caso real.
4. Adicionar teste em `tests/ocr/entradas.test.js`.
5. Ajustar regex em [js/ocr/entradas.js](js/ocr/entradas.js) até passar.
6. Remover o `<details>` antes de subir.

**Casos conhecidos:**

- Mercado Pago renderiza "R$ 200" gigante → 2º pass com PSM 11 + downscale
  resolve (já implementado).
- Bradesco usa hífen entre data e hora → regex de hora aceita `-` (já tratado).
- BB tem CPF/CNPJ logo após "Pix Enviado" → 2º regex de valor exige R$ literal
  para evitar capturar dígitos do CNPJ (já tratado).

### 3.3 PWA não atualiza após deploy

1. Verificar se o `CACHE_VERSION` foi bumpado (passo 2.2 acima).
2. Confirmar que o pre-commit bumpou os `?v=` (`git log -p index.html | head`).
3. Pedir ao usuário para hard-reload (passo 2.3).
4. Em casos persistentes: editar `manifest.json` (mudar `start_url` ou ícone)
   força reinstall do PWA.

### 3.4 Sessões "presas" / usuário continua logado eternamente

1. Auto-logout após 5min de inatividade está em [js/pages/login.js](js/pages/login.js).
2. Se um usuário relata "fica logado horas sem ser deslogado":
   - Confirmar que o timer não está sendo resetado por algum evento (mover
     mouse ou scroll resetam — checar listener de atividade).
   - Verificar `localStorage.ieteb_lastActivity`.
3. Forçar logout: `firebase.auth().signOut()` no console do usuário.

### 3.5 Lançamento sumiu / dado perdido

1. **Não foi deletado pelo usuário:** ver `localStorage.ieteb_deleted_ids` no
   navegador dele — IDs deletados ficam ali até sincronizar.
2. **Foi deletado:** Firestore não tem soft-delete hoje. Recuperar via:
   - Backup periódico (se configurado — ver Sprint 1 do roadmap).
   - **Backup automático do Firestore:** Console → Firestore → Backups
     (precisa ser habilitado no plano Blaze).

---

## 4. Deploy e Ambiente

### 4.1 Branches e ambientes

| Branch | Ambiente | Hospedagem | Deploy |
|---|---|---|---|
| `dev` | DEV | Netlify (após ativar) | manual / Netlify auto |
| `master` | PROD | GitHub Pages | GitHub Actions automático |

- **PROD:** `gustavoavila123.github.io/IETEBFinanceiro` (master).
- **DEV:** URL Netlify após setup. Veja [RELEASE.md](RELEASE.md).
- **Backend:** Firebase project `ieteb-financeiro` (atualmente compartilhado).
  Quando criar `ieteb-financeiro-dev`, preencher `_CONFIGS.dev` em
  [js/core/firebase.js](js/core/firebase.js).

### 4.2 Workflow de release (resumido)

Detalhes completos em [RELEASE.md](RELEASE.md). Resumo:

1. Comitar em `dev`. Nunca em `master` direto.
2. Pedir autorização ao dono.
3. `git checkout master && git merge --ff-only dev && git push`.
4. GitHub Actions roda lint + Vitest + E2E. Se passar, deploya pra Pages.

### 4.3 CI / Pre-commit

- **Pre-commit local:** `.githooks/pre-commit`
  - Roda `npm test` (bloqueia se falhar)
  - Bumpa cache-buster nos `?v=` do `index.html`
  - Para pular em emergência: `git commit --no-verify`
- **GitHub Actions:**
  - `.github/workflows/test.yml` — lint + Vitest em todo push de `dev`/`master`. E2E em PR ou push pra master.
  - `.github/workflows/deploy-prod.yml` — só em push pra master. Lint + Vitest + E2E + deploy GitHub Pages.

### 4.4 Migrar PROD pra Netlify/Cloudflare

- `netlify.toml` já configurado com headers de segurança.
- Veja [MIGRATION.md](MIGRATION.md) para passo-a-passo.

### 4.4 Variáveis sensíveis

- **API Key do Firebase:** pública por design (em `js/core/firebase.js`),
  protegida pelas regras do Firestore + (futuramente) App Check.
- **Senhas seed em `js/config.js`:** ⚠️ **risco conhecido** — repo público.
  Plano de mitigação no relatório de auditoria (item #1 — crítico).

---

## 5. Onde encontrar logs / dashboards

| O quê                    | Onde                                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Erros de Auth            | Firebase Console → Authentication → Users (timestamps de last sign-in)                                          |
| Performance Firestore    | Firebase Console → Firestore → Usage                                                                            |
| Sessões dos testers      | Coleção `/Sessoes` no Firestore Console (Firebase).                                                             |
| Logs do navegador        | DevTools → Console (F12). Os errors são `console.error('[OCR] ...')`, `console.error('[navigation] ...')`, etc. |
| GitHub Actions           | github.com/GustavoAvila123/IETEBFinanceiro/actions                                                              |
| Service Worker no client | DevTools → Application → Service Workers                                                                        |
| LocalStorage do client   | DevTools → Application → Local Storage → `ieteb_lancamentos`, `ieteb_saidas`, `ieteb_user`, `ieteb_deleted_ids` |

---

## 6. Comandos úteis (executar na raiz do projeto)

```bash
# Instalar dependências (primeira vez ou após mudar package.json)
npm install

# Rodar suite de testes Vitest
npm test

# Modo watch (re-roda em cada save)
npm run test:watch

# Lint do código JS
npm run lint

# Auto-fix de lint + format
npm run lint:fix
npm run format

# Servir localmente
python -m http.server 8000   # ou
npx serve .

# E2E com Playwright
npm run test:e2e
npm run test:e2e:ui          # com UI debug
```

---

## 7. Contatos

| Responsável   | Papel               | Contato          |
| ------------- | ------------------- | ---------------- |
| Gustavo Avila | Tech / Manutenção   | (e-mail / Slack) |
| Jader Dias    | Admin / Stakeholder | (preencher)      |

---

> **Quando atualizar este runbook:** sempre que adicionar uma nova feature
> que altere comportamento de produção, mudar regra do Firestore, mudar
> processo de deploy, ou após resolver um incidente novo (documentar a
> causa-raiz e o fix em §3).
