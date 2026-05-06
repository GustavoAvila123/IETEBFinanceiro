# IETEB Financeiro — Processo de Release

A partir de 2026-05-05 o projeto opera em **2 branches** com gates explícitos
antes de qualquer mudança chegar em produção.

```
                                           AUTORIZAÇÃO
   ┌─────────┐    push (auto)    ┌─────────┐    EXPLÍCITA    ┌─────────┐
   │   Eu    │ ─────────────────▶│   dev   │ ───────────────▶│ master  │
   │ (código)│                   │  (DEV)  │                 │ (PROD)  │
   └─────────┘                   └────┬────┘                 └────┬────┘
                                       │                           │
                                       ▼                           ▼
                            (futuro: Netlify)           GitHub Pages atual
                            preview.netlify.app         gustavoavila123.github.io
```

---

## Branches

| Branch | Papel | Quem comita | Hospedagem |
|---|---|---|---|
| `dev` | Desenvolvimento ativo (default) | Desenvolvedores / agente | Netlify (após ativar) |
| `master` | Produção (estável) | **Apenas via merge autorizado de dev** | GitHub Pages |

### Regras

1. **Não comitar diretamente em `master`.** Sempre em `dev`.
2. **Só promover para `master` com autorização EXPLÍCITA do dono do projeto.**
3. **Toda promoção `dev → master` precisa passar:** Vitest, ESLint e
   E2E (Playwright). Configurado em `.github/workflows/test.yml`.
4. **GitHub Pages só serve `master`.** Configurado em `.github/workflows/deploy-prod.yml`.

---

## Fluxo do dia-a-dia

### Trabalhar em uma feature/fix

```bash
git checkout dev
git pull origin dev

# ... fazer mudanças, npm test, lint ...

git add .
git commit -m "feat/fix: ..."
git push origin dev
```

→ GitHub Actions roda `test.yml` (lint + Vitest unit). Se passar,
o código está OK em DEV.

### Promover DEV → PROD

**Pré-requisitos:**
- [ ] Dono autorizou release explicitamente
- [ ] Última suite de E2E passou em `dev`
- [ ] Funcionalidade testada manualmente em ambiente DEV
- [ ] CHANGELOG ou release notes preparados (opcional)

**Comandos:**

```bash
# 1. Garante que dev está atualizado e estável
git checkout dev
git pull origin dev
npm test
npm run lint
npm run test:e2e

# 2. Vai pra master e merge fast-forward
git checkout master
git pull origin master
git merge --ff-only dev

# 3. Push (dispara deploy-prod.yml automaticamente)
git push origin master
```

Em ~2-3 minutos, o GitHub Action `Deploy PROD` roda os testes de
novo e publica em `gustavoavila123.github.io/IETEBFinanceiro`.

---

## 🔥 Setup do ambiente — Cloudflare Pages

A partir de 2026-05-06 a hospedagem de **AMBOS** ambientes vai pra
Cloudflare Pages. URLs ficam:

- **PROD** (`master`) → `https://<projeto>.pages.dev`
- **DEV** (`dev`) → `https://dev.<projeto>.pages.dev`
- Cada feature branch ganha URL automática (`https://feat-x.<projeto>.pages.dev`)

### Setup inicial (uma vez, ~5 min)

1. Criar conta em [pages.cloudflare.com](https://pages.cloudflare.com).
2. **Connect to Git → GitHub** → autorizar acesso ao repo `IETEBFinanceiro`.
3. Configurar projeto:
   - **Project name:** `ieteb-financeiro` (será usado no subdomínio).
   - **Production branch:** `master`.
   - **Framework preset:** `None`.
   - **Build command:** *(deixar vazio — app é estático)*
   - **Build output directory:** `/`
4. **Save and Deploy**. Aguarda ~30s — primeira deploy de master.
5. URL gerada: `https://ieteb-financeiro.pages.dev` (ou prefixo
   se o nome já estiver tomado).

### Habilitar deploy automático de `dev` (preview branch)

Por padrão Cloudflare deploya TODAS as branches automaticamente —
geralmente já está ativo. Confirme:

1. No projeto Cloudflare → **Settings → Builds & deployments → Branch deployments**.
2. Garantir que está em **All branches** (ou pelo menos `dev`).
3. Cada commit em `dev` agora deploya em ~30s pra
   `https://dev.ieteb-financeiro.pages.dev`.

### Adicionar URLs em Firebase Auth → Authorized domains

Sem isso, login dá `auth/unauthorized-domain`.

**Projeto PROD** (`ieteb-financeiro`):
- Console → Authentication → Settings → Authorized domains → Add domain
- Adicionar: `ieteb-financeiro.pages.dev`

**Projeto DEV** (`ieteb-financeiro-dev`):
- Mesmo caminho no projeto DEV
- Adicionar: `dev.ieteb-financeiro.pages.dev`

### Atualizar `PROD_HOSTS` no código (eu faço)

Após você compartilhar comigo a URL exata gerada (passo 5), eu
adiciono no array `PROD_HOSTS` em `js/core/firebase.js`. Sem isso,
o app pode resolver pro Firebase errado.

### Desativar GitHub Pages (opcional)

Pra evitar dois sites publicados ao mesmo tempo:

1. Repo GitHub → Settings → Pages → **Source: None**.
2. URL antiga (`https://gustavoavila123.github.io/IETEBFinanceiro/`)
   para de funcionar em alguns minutos.
3. Workflow `.github/workflows/deploy-prod.yml` foi DESATIVADO no
   trigger automático em 2026-05-06 (só dispara via
   `workflow_dispatch` manual, como fallback emergencial).

---

## 🧹 Wipe completo de PROD (uma vez, antes do go-live)

Decisão de 2026-05-06: começar PROD do zero, sem dados de teste
acumulados. **DEV mantém os dados** (é o sandbox).

### Quando rodar

- ANTES de promover dev → master pela primeira vez no novo setup.
- O wipe limpa Entradas, Saidas, Saídas (legacy), Sessoes e
  Auditoria. Mantém `/Users` (perfis de auth).

### Como rodar

1. Logue como **Admin** em PROD (URL antiga GitHub Pages enquanto
   ainda estiver no ar; ou a nova URL Cloudflare se já migrou).
2. F12 → aba Console.
3. Cole e execute (vai pedir confirmação):

```js
(async () => {
  if (!confirm('Apagar TODOS os dados de PROD? Ação irreversível.')) return;
  const db = firebase.firestore();
  const cols = ['Entradas', 'Saidas', 'Saídas', 'Sessoes', 'Auditoria'];
  let total = 0;
  for (const col of cols) {
    const snap = await db.collection(col).get();
    if (snap.empty) { console.log(`${col}: vazio`); continue; }
    // Firestore só aceita 500 ops por batch — chunk se preciso
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 400) {
      const batch = db.batch();
      docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    total += docs.length;
    console.log(`✅ ${col}: ${docs.length} docs apagados`);
  }
  console.log(`\n🧹 Total apagado: ${total} docs em PROD`);
})();
```

4. Verifique no Firebase Console (PROD) que as coleções listadas
   estão vazias. **Users continua intocado** (admin/testers).

---

## Rollback (emergência em PROD)

Se um deploy quebrou produção:

```bash
git checkout master
git log --oneline -5            # achar o último commit OK
git revert HEAD                 # cria commit que desfaz o último
git push origin master          # dispara deploy automático com a reversão
```

Ou, mais agressivo (force push — confirmar com dono antes):

```bash
git checkout master
git reset --hard <hash-bom>
git push --force-with-lease origin master
```

---

## Setup do ambiente DEV (uma vez)

### A) Hospedagem DEV — Netlify

1. Criar conta em [netlify.com](https://netlify.com).
2. **Add new site → Import existing project → GitHub** → selecionar
   `IETEBFinanceiro`.
3. **Branch to deploy: `dev`** (não master).
4. Build command: vazio. Publish dir: `.`.
5. Deploy. URL gerada: `https://<random>.netlify.app`.
6. **Adicionar essa URL em Firebase Auth → Authorized domains.**

### B) Projeto Firebase DEV separado (opcional, recomendado)

Sem essa etapa, DEV e PROD compartilham o mesmo banco Firestore —
escritas em DEV poluem PROD.

1. Firebase Console → criar novo projeto: `ieteb-financeiro-dev`.
2. Habilitar Authentication (Email/Password) e Firestore.
3. Criar app web. Copiar a config (apiKey, projectId, etc.).
4. Aplicar `firestore.rules` e `storage.rules` no novo projeto:
   ```bash
   firebase use ieteb-financeiro-dev
   firebase deploy --only firestore:rules,storage:rules
   ```
5. Editar [js/core/firebase.js](js/core/firebase.js) — preencher
   `_CONFIGS.dev` com as credenciais novas.
6. Commit em `dev`, validar que o app conecta no Firebase certo
   (console do browser mostra warning se cair em PROD por engano).
7. Adicionar URL DEV (Netlify) em Firebase Auth → Authorized domains
   do projeto DEV.

### C) Workflow validado

- Comitar uma mudança em `dev` → preview Netlify atualiza em ~30s.
- Testar manualmente.
- Pedir autorização ao dono.
- Promover via `git merge --ff-only` em `master`.
- Pages atualiza em ~2-3min.

---

## CI/CD (GitHub Actions)

| Workflow | Dispara em | O que faz |
|---|---|---|
| `.github/workflows/test.yml` | push/PR em `dev` ou `master` | Lint + Vitest. E2E só em PR ou push master. |
| `.github/workflows/deploy-prod.yml` | push em `master` | Lint + Vitest + E2E. Se tudo passa, deploya pra GitHub Pages. |

### Status badges (opcional, adicionar ao README)

```markdown
![Tests](https://github.com/GustavoAvila123/IETEBFinanceiro/actions/workflows/test.yml/badge.svg?branch=dev)
![Deploy](https://github.com/GustavoAvila123/IETEBFinanceiro/actions/workflows/deploy-prod.yml/badge.svg)
```

---

## Proteção do branch `master` (recomendado)

GitHub → repo → Settings → Branches → Add branch protection rule:

- **Branch name pattern:** `master`
- ☑ Require a pull request before merging
- ☑ Require status checks to pass before merging
  - `test` (do `test.yml`)
- ☑ Require linear history (força fast-forward)
- ☑ Do not allow bypassing the above settings

Isso impede push direto em `master` mesmo com erro humano.

---

## Variáveis sensíveis

API key do Firebase é pública por design (proteção real vem das
Firestore Rules + App Check). Não tem segredo no código atualmente.

Se precisar de segredos no futuro (Stripe, Sentry, etc.):
- GitHub repo → Settings → Secrets and variables → Actions → New
- Referenciar como `${{ secrets.NOME_DO_SEGREDO }}` no workflow

---

> **TL;DR:** comita em `dev`, espera autorização, faz `git merge --ff-only dev` em `master`, push. Pages atualiza sozinho.
