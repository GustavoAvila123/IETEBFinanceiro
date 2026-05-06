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

## ⚠️ Migração obrigatória ANTES da próxima promoção dev → master

A coleção `Saídas` (com acento) foi renomeada para `Saidas` (sem
acento) em 2026-05-06 para resolver erro de parser do Firebase
Rules. PROD ainda tem dados na coleção `Saídas` que precisam ser
movidos antes de promover.

### Passo 1 — Migrar dados em PROD

1. Logue como **Admin** em https://gustavoavila123.github.io/IETEBFinanceiro
2. Abra DevTools (F12) → aba Console
3. Cole e execute:

```js
(async () => {
  const db = firebase.firestore();
  const old = await db.collection('Saídas').get();
  if (old.empty) { console.log('Nenhum doc em Saídas — nada a migrar'); return; }
  const batch = db.batch();
  old.docs.forEach((d) => batch.set(db.collection('Saidas').doc(d.id), d.data()));
  await batch.commit();
  console.log(`✅ Migrados ${old.size} docs de Saídas → Saidas`);
})();
```

4. Verifique no Firebase Console (Firestore) que a coleção `Saidas`
   apareceu com os mesmos docs.
5. **NÃO apague `Saídas` ainda** — guarde como backup até confirmar
   que tudo funciona pós-deploy. Pode apagar manualmente no Console
   uma semana depois.

### Passo 2 — Promover dev → master normalmente

```bash
git checkout master
git merge --ff-only dev
git push origin master
```

GitHub Action faz deploy. Em ~3 min, PROD usa o código novo lendo
de `Saidas`.

### Passo 3 — Validar

- Abrir o app em PROD, logar como tester comum.
- Conferir que histórico de saídas está intacto.
- Cadastrar uma nova saída — deve aparecer na coleção `Saidas` no
  Firebase Console.

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
