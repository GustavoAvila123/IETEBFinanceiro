# Criar usuário no IETEB Financeiro

Guia passo a passo pra criar usuários no app, **sem mexer em código**.
Funciona igual pra DEV e PROD — só atenção pra abrir o **projeto Firebase correto**.

> **Princípio:** senhas vivem APENAS no Firebase Auth (server-side, criptografadas).
> Nada de senha em código, em git, ou em arquivo. Toda criação/troca/desativação
> é feita pelo Firebase Console.

---

## Antes de começar — definir os dados

| Dado | Regra | Exemplos |
|---|---|---|
| `legacyId` | minúsculo, sem acento, sem espaço, único | `avila`, `tester1`, `joao` |
| `name` | nome de exibição (acento ok) | `Gustavo Ávila`, `João da Silva` |
| `role` | `admin` ou `tester` | — |
| `senha` | forte (você define agora; usuário pode trocar depois) | — |

O **email do Firebase Auth é derivado automaticamente** do legacyId:
`<legacyId>@ieteb.app`. Esse email NÃO recebe mensagens — é só identificador.

---

## Passo 1 — Authentication (criar a conta)

1. Abre o **Authentication → Users** do projeto:
   - **DEV** → https://console.firebase.google.com/project/ieteb-financeiro-dev/authentication/users
   - **PROD** → https://console.firebase.google.com/project/ieteb-financeiro/authentication/users

   ⚠️ Confere no topo da tela se está em `IETEB Financeiro Dev` ou `IETEB Financeiro` — não confunda os dois.

2. Botão **Adicionar usuário**
3. **Email**: `<legacyId>@ieteb.app` (ex.: `tester1@ieteb.app`)
4. **Senha**: a que você definiu
5. Clica **Adicionar usuário**
6. **Copia o UID** que aparece na coluna "UID do usuário" da lista — vai precisar no Passo 2.

---

## Passo 2 — Firestore (criar o doc `/Users/{uid}`)

1. Abre o **Firestore → coleção Users** do projeto:
   - **DEV** → https://console.firebase.google.com/project/ieteb-financeiro-dev/firestore/data/~2FUsers
   - **PROD** → https://console.firebase.google.com/project/ieteb-financeiro/firestore/data/~2FUsers

2. Coleção `Users` → **+ Adicionar documento**

3. **ID do documento**: cole o UID copiado no Passo 1

4. Campos (3 strings + 1 boolean):

| Campo | Tipo | Valor |
|---|---|---|
| `legacyId` | string | mesmo legacyId usado no email (ex.: `tester1`) |
| `name` | string | nome de exibição (ex.: `Tester Um`) |
| `role` | string | `admin` ou `tester` ← **atenção, não confunde!** |
| `active` | boolean | `true` |

5. **Salvar**

---

## Passo 3 — Validar o login

URL do app:
- **DEV** → https://dev.ieteb-financeiro.pages.dev/
- **PROD** → https://ieteb-financeiro.pages.dev/

Em **aba anônima** (pra garantir cache limpo):

1. Campo "Usuário": digita o `legacyId` (ex.: `tester1`)
2. Campo "Senha": a senha definida
3. Deve aparecer **"Bom dia/tarde/noite, `<name>`!"**

Se aparecer erro, ver seção [Erros comuns](#erros-comuns) abaixo.

---

## Diferenças admin vs tester

| Comportamento | Admin | Tester |
|---|---|---|
| `role` no `/Users` doc | `admin` | `tester` |
| Sidebar com Auditoria/Backup | aparece | escondida |
| Auto-logout por inatividade | **nunca** | **5 minutos** (com aviso de 60s) |
| Vê entradas/saídas | **de todos** | só as próprias (`userId == legacyId`) |
| Pode deletar entradas/saídas | qualquer uma | só as próprias |

---

## Template de planejamento (criação em lote)

Antes de criar, planeja todos de uma vez:

| LegacyId | Nome | Role | Senha | UID (preencher após Passo 1) |
|---|---|---|---|---|
| | | | | |
| | | | | |
| | | | | |

---

## Trocar a senha de um usuário

**Pelo próprio usuário (recomendado):** logado no app, F12 → Console, e cola:
```js
await window._firebase._auth.currentUser.updatePassword('NOVA_SENHA_FORTE');
```
Sucesso = silêncio (resultado `undefined`). Daí desloga e logga com a senha nova pra confirmar.

**Pelo admin (sem o usuário disponível):** o Firebase Console **não permite**
setar senha específica direto (só envia email reset, que não funciona aqui
porque os emails são fake). Caminho prático:
1. Authentication → menu ⋮ → **Excluir conta** do usuário
2. Adicionar usuário de novo com a senha nova
3. Copiar o **novo** UID
4. Firestore → apagar o doc `/Users/{UID_antigo}` e criar um novo `/Users/{UID_novo}` com os mesmos campos (legacyId/name/role/active)

⚠️ Se o usuário já tinha entradas/saídas registradas, elas continuam ligadas
ao legacyId (não ao UID), então não se perde dado mesmo trocando o UID do Auth.

---

## Desativar / excluir conta

- **Desativar (preserva histórico, pode reativar depois):**
  Firestore → `/Users/{uid}` → editar campo `active` → `false`.
  Pra reativar, volta pra `true`.

- **Excluir definitivo:**
  1. Authentication → Users → menu ⋮ → **Excluir conta**
  2. Firestore → `/Users/{uid}` → menu ⋮ → **Excluir documento**

---

## Erros comuns

| Mensagem na tela | Causa | Correção |
|---|---|---|
| "Usuário não cadastrado" | Doc `/Users/{uid}` não existe ou Document ID está errado | Confere se o UID em Authentication bate com o Document ID em /Users |
| "Credenciais inválidas" / "Ops! Não conseguimos entrar" | Senha errada, OU usuário deletado do Auth | Verifica se a conta existe em Authentication; se sim, tenta a senha; se não lembra, segue [Trocar senha](#trocar-a-senha-de-um-usuário) |
| "Bom dia, undefined" | Doc `/Users/{uid}` existe mas o campo `name` está faltando | Edita o doc no Firestore Console e adiciona o campo `name` (string) |
| "Aparece, mas sidebar sem Auditoria/Backup" sendo admin | Campo `role` está com valor errado (ex.: `Admin` com A maiúsculo) | `role` é case-sensitive — tem que ser `admin` exatamente |
| Login funciona mas dados aparecem vazios | Tester com `role` correto mas as entradas registradas têm `userId` diferente do legacyId dele | Confere o campo `legacyId` no doc /Users — tem que casar com o que o app guarda no `userId` ao salvar entradas |

---

## Por que esse fluxo? (contexto histórico)

Antes de 2026-05-06 o sistema tinha um array `USERS` em `js/config.js` com
todas as senhas em texto puro. Esse arquivo está versionado no GitHub público —
qualquer um lendo o repo via "admin / 863891".

A partir de 2026-05-06 o array foi removido e a autenticação passou a depender
SÓ do Firebase Auth + doc `/Users/{uid}` no Firestore. Não há mais bootstrap
automático de usuários — toda criação é manual via Console.

Ver [CLAUDE.md → Decisões importantes → Por que Firebase Auth?](CLAUDE.md)
e [RUNBOOK.md → 1. Acesso e contas](RUNBOOK.md).
