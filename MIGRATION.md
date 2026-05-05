# Migração GitHub Pages → Netlify (ou Cloudflare Pages)

Guia prático para sair do GitHub Pages (que não permite customizar headers
HTTP nem cache) e migrar para Netlify (configuração já preparada em
[netlify.toml](netlify.toml)) ou Cloudflare Pages (configuração análoga).

---

## Por que migrar?

| Item | GitHub Pages | Netlify / Cloudflare |
|---|---|---|
| Headers HTTP customizados | ❌ | ✅ |
| HSTS server-side | ❌ | ✅ |
| Permissions-Policy server-side | ❌ | ✅ |
| Cache-Control granular | ❌ | ✅ |
| Edge functions (rate limit, AB tests) | ❌ | ✅ |
| Preview deploys por PR | ❌ | ✅ |
| Custo | Grátis | Grátis (free tier) |
| HTTPS | ✅ | ✅ |

---

## Opção A — Netlify (recomendado)

### A.1 Pré-requisitos
- Conta gratuita em [netlify.com](https://netlify.com).
- Repo no GitHub (já está).
- `netlify.toml` no repo (já está, com headers de segurança).

### A.2 Deploy via UI Netlify (5 min)
1. Login em netlify.com → **Add new site → Import an existing project**.
2. Selecionar **GitHub** → autorizar → escolher o repo `IETEBFinanceiro`.
3. Configurações:
   - **Branch to deploy:** `master`
   - **Build command:** *(vazio — sem build)*
   - **Publish directory:** `.`
4. Clicar **Deploy site**.
5. Após o deploy, o site fica em `https://<nome-aleatorio>.netlify.app`.

### A.3 Domínio customizado (opcional)
1. Site settings → Domain management → Add domain.
2. Apontar DNS do domínio (ex.: `app.ieteb.org.br`) para Netlify (CNAME ou A
   record conforme instruções da própria Netlify).
3. SSL é provisionado automaticamente via Let's Encrypt.

### A.4 Atualizar Firebase Auth
1. Console Firebase → Authentication → Settings → **Authorized domains**.
2. Adicionar o domínio Netlify (`<nome>.netlify.app` ou seu domínio custom).
3. Sem isso, login dá erro `auth/unauthorized-domain`.

### A.5 Desativar GitHub Pages (após validar)
1. Repo no GitHub → Settings → Pages → **Source: None**.
2. (Opcional) atualizar o README pra apontar para a nova URL.

---

## Opção B — Cloudflare Pages

### B.1 Setup
1. Conta em [pages.cloudflare.com](https://pages.cloudflare.com).
2. **Create a project → Connect to Git → Selecionar repo.**
3. Configurações iguais à Netlify (sem build, publish na raiz).

### B.2 Headers e cache
Cloudflare Pages **NÃO lê `netlify.toml`**. Precisa criar um arquivo
`_headers` na raiz com formato próprio:

```
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Referrer-Policy: strict-origin-when-cross-origin

/index.html
  Cache-Control: no-cache, no-store, must-revalidate

/js/*
  Cache-Control: public, max-age=31536000, immutable

/sw.js
  Cache-Control: no-cache, no-store, must-revalidate
```

E redirects em `_redirects`:
```
/*  /index.html  200
```

---

## Validar a migração

Depois do deploy, rodar:

### 1. Headers HTTP
Abrir DevTools → Network → recarregar → clicar no `index.html` → aba **Headers**.

Conferir presença de:
- ✅ `Strict-Transport-Security`
- ✅ `X-Frame-Options: DENY`
- ✅ `Cross-Origin-Opener-Policy`
- ✅ `Content-Security-Policy`
- ✅ `Cache-Control: no-cache` no `index.html`
- ✅ `Cache-Control: max-age=31536000, immutable` em `js/*`

### 2. Auditoria automática
- [Mozilla Observatory](https://observatory.mozilla.org/) — meta = nota A ou A+.
- [securityheaders.com](https://securityheaders.com/) — meta = A ou A+.
- Lighthouse (Chrome DevTools → aba Lighthouse) — meta = ≥90 em todas as
  categorias.

### 3. Funcionalidade
- [ ] Login admin funciona
- [ ] Login tester funciona
- [ ] Cadastro de entrada salva no Firestore
- [ ] OCR de comprovante funciona
- [ ] Export PDF e Excel funcionam
- [ ] PWA é instalável (banner aparece)
- [ ] Service Worker registra (`navigator.serviceWorker.controller`)
- [ ] Cache do SW funciona offline

### 4. Performance
- TTFB (Time To First Byte) deve cair vs GitHub Pages.
- O Cache-Control immutable em `/js/*` faz reloads serem ~instantâneos.

---

## Rollback de emergência

Se algo quebrar após a migração:

1. **Caminho A — voltar pra GitHub Pages:**
   - Repo no GitHub → Settings → Pages → Source: master → /
   - DNS aponta de volta pro `*.github.io` (se tiver domínio custom).

2. **Caminho B — desfazer último deploy no Netlify:**
   - Site → Deploys → encontrar o último deploy verde → "Publish deploy".
   - Rollback é instantâneo.

---

## Troubleshooting

**Login falhando com `auth/unauthorized-domain` após migração:**
→ Esqueceu de adicionar o novo domínio em Firebase Auth → Authorized domains.
Veja A.4.

**Service Worker não atualiza no novo domínio:**
→ É outro origin pro browser; o SW antigo continua válido no domínio antigo.
Bumpar `CACHE_VERSION` em `sw.js` força refresh.

**CORS errors em chamadas Firestore:**
→ Verificar CSP em `connect-src` — domínios `*.googleapis.com` precisam estar
liberados (já estão no `netlify.toml` atual).

**Tesseract.js não carrega o modelo:**
→ Verificar que `tessdata.projectnaptha.com` está em `connect-src` (já está).
