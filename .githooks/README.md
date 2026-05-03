# Git Hooks — IETEB Financeiro

## Como ativar (uma vez por clone do repositório)

```bash
git config core.hooksPath .githooks
```

## Hooks disponíveis

### `pre-commit`
Bumpa automaticamente o cache-buster (`?v=YYYYMMDDx`) no `index.html`
sempre que algum arquivo `.js` ou `.css` é commitado, evitando que
o navegador sirva versão antiga em cache.

- **Mesmo dia:** incrementa a letra (`a` → `b` → `c` ...)
- **Dia novo:** reseta para a letra `a` da data atual
- **Letra `z` no mesmo dia:** pula o bump e avisa (precisa bump manual)
- **`index.html` já staged:** não toca (assume bump manual feito)

Para fazer um commit **sem bumpar** (ex.: alteração que não precisa
invalidar cache), use:

```bash
git commit --no-verify -m "..."
```
