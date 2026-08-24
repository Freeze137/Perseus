# PERSEUS

## O projeto está no ar

Não mande o Rafael para `localhost`. Ele olha o site publicado, e uma mudança
que só existe no disco é uma mudança que ele não vê.

| Parte | Onde vive | Como uma mudança chega lá |
| --- | --- | --- |
| `apps/web` | Vercel (projeto `perseus`) | `git push origin main` — a Vercel builda sozinha |
| `apps/api` | Fly.io (`perseus-api`, região `gru`) | `fly deploy --remote-only` |
| Banco | Neon | fora do caminho do duelo; ver `docs/DEPLOY-FLY.md` |

**Frontend não precisa de deploy manual e não precisa de servidor local.**
Commit e push, e o site atualiza. Rodar `next dev` para "mostrar o resultado"
resolve um problema que ele não tem.

Pior ainda: rodar `next build` enquanto um `next dev` está de pé sobrescreve o
`.next` que o dev serve e derruba o servidor dele. Se precisar validar antes de
empurrar, use `tsc --noEmit`, `eslint` e leia o CSS gerado — não suba processo.

**Todo deploy da API encerra os duelos em andamento.** O do site não; é estático
mais uma rota dinâmica. Isso torna o push do frontend barato e o da API caro, e
a diferença deve aparecer no que você propõe.

## Commits

O hook global exige conventional commits: `type(escopo): descrição`, primeira
linha em no máximo 72 caracteres. O histórico antigo não segue isso — o gate é
mais novo que o repositório. Siga o gate, e escreva o corpo na voz do resto do
histórico: em português, dizendo o que o código passou a fazer e por quê.

Sem rodapé de coautoria.
