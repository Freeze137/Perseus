# PERSEUS

Treinador de digitação para navegador, em português e inglês, para texto corrido
e para código.

O nome é uma constelação e o produto ensina um mapa: o teclado virtual é
desenhado como um mapa estelar, onde o brilho de cada tecla reflete o domínio
real do usuário sobre ela.

## Rodando

```bash
corepack enable pnpm     # uma vez, se `pnpm` não estiver no PATH
pnpm install
pnpm dev                 # web em :3000, api em :3001
```

Outros comandos:

| Comando | O que faz |
|---|---|
| `pnpm build` | Compila os pacotes e depois os dois apps |
| `pnpm test` | Vitest nos pacotes, Jest na api |
| `pnpm typecheck` | `tsc --noEmit` em todo o workspace |
| `pnpm lint` | ESLint em todo o workspace |
| `pnpm dev:web` / `pnpm dev:api` | Sobe só um dos apps |

## Estrutura

```
apps/
  web/       Next.js 16 · React 19 · Tailwind 4
  api/       NestJS 11
packages/
  engine/    motor de digitação — TS puro, sem DOM e sem React
  corpus/    frases pt-BR/en e snippets de código + gerador determinístico
  contracts/ schemas Zod compartilhados entre web e api
supabase/
  migrations/ schema, políticas de RLS e a função do ranking
docs/
  PHASE-2.md  protocolo do que falta: Supabase, deploy, multiplayer
```

## Decisões de arquitetura

**O motor não conhece React.** `packages/engine` é um reducer puro sobre um
stream de caracteres: `applyInput`, `applyBackspace`, `metrics`, `keyStats`.
Roda em milissegundos no Vitest, sem browser. Nenhuma regra de PPM, precisão ou
consistência mora em componente — se morasse, testá-la exigiria montar a árvore
React inteira.

**Grafemas, não caracteres.** `target` e `typed` são arrays de grafemas, não
strings. Em teclado ABNT2 a tecla morta `´` seguida de `a` produz um caractere
visível formado por dois code points, e o usuário vive isso como uma tecla só.
A entrada é lida de `beforeinput`, nunca de `keydown`: só ali o caractere
composto existe.

**O canvas nunca entra no caminho crítico da tecla.** A comunicação entre a área
de digitação e qualquer visualização passa por `lib/keystroke-bus.ts`, um
emissor fora do React. Se a visualização assinasse estado React, cada tecla
re-renderizaria texto e cena juntos, e o caractere apareceria um frame atrasado.

**Gerador determinístico.** `packages/corpus` gera texto a partir de um seed com
mulberry32. Mesmo seed, mesmo texto — é o que torna um teste reproduzível e um
link de desafio possível.

**Backspace não é keystroke.** Correções não entram na timeline, então nunca
inflam o PPM bruto. Mas o erro corrigido continua contando contra a precisão:
ele aconteceu, e esconder isso bajularia o aprendiz.

**Todo texto tem sentido.** Nenhum modo concatena tokens soltos. `words` e
`numbers` também saem do banco de frases — o primeiro sem maiúsculas e sem
pontuação, o segundo escolhendo frases que já carregam números. Uma sopa de
palavras treina as letras enquanto ensina um ritmo que língua nenhuma tem, e o
ritmo é boa parte do que se está treinando. `generate.test.ts` tem um teste que
falha se algum builder voltar a montar texto por concatenação.

**O cliente não pontua a si mesmo.** Resultados sobem como linha do tempo de
teclas, não como números. A API regenera o texto a partir do seed, reproduz a
digitação com `replay()` e calcula ppm, precisão e consistência ela mesma. Um
`wpm` vindo do navegador é um número que qualquer pessoa digita no console.

**Nem o relógio dele.** Reproduzir a digitação prova os caracteres e não diz
nada sobre *quando* foram pressionados — e os carimbos de tempo eram a última
parte do envio ainda escrita pelo cliente. Uma timeline com os mesmos caracteres
comprimida em 40 ms valia 60 mil ppm e era gravada. `checkTimeline()`
(`packages/engine/src/plausibility.ts`) recusa relógio andando para trás, ritmo
uniforme demais para ser mão humana, e média acima do que mão nenhuma faz. O que
ele **não** promete: distinguir um script paciente digitando em velocidade
plausível de uma pessoa. Isso não está na timeline, e fingir que está seria a
pior das seguranças — a que se acredita.

**Uma corrida, um bilhete.** A primeira tecla abre a corrida no servidor
(`POST /runs`), que devolve um bilhete assinado. O envio vai debaixo dele, e as
duas restrições que isso cria são as que faltavam: a mesma corrida não pode ser
gravada duas vezes, e a duração declarada não pode passar do relógio de parede
que o servidor observou. A gravação de uma corrida boa reenviada mais tarde
esbarra no `timeline_hash`.

**`CORPUS_VERSION` acompanha o banco de frases.** O mesmo seed produz texto
diferente depois que o corpus muda; sem a versão gravada junto, um resultado
antigo apontaria para um texto que o dono nunca digitou. Suba o número em
`packages/contracts/src/index.ts` sempre que mexer num builder ou nos bancos.

## Estado atual

Fase 1 concluída. Cinco modos de texto (`words`, `quote`, `punctuation`,
`numbers`, `code`), quinze linguagens de código com auto-indentação, cancelar
com Esc, tela de resultado com cpm, e conta + ranking prontos para ligar.
132 testes.

Layout de teclado (ABNT2, US, US Internacional) entrou no `SessionConfig` e
alcança o corpus: um teclado sem tecla morta não sorteia frase com acento, e o
painel de configurações desenha quais teclas custam o quê. Ver
`packages/corpus/src/reach.ts`.

A camada de verificação do ranking está pronta e testada: bilhete de corrida,
recusa de timeline implausível, limite de requisições por pessoa, fila local
para corridas que a rede não levou, e cache de board. Falta escolher onde o
banco vai morar — o Supabase continua sendo a única implementação, e nada disso
depende dele.

O treinador funciona **offline**: sem credenciais de Supabase ele roda inteiro,
só não oferece conta nem ranking.

Fase 2 e o que falta para ela: **[`docs/PHASE-2.md`](docs/PHASE-2.md)** — ligar o
Supabase, o modelo de segurança do ranking, deploy, e o desenho do multiplayer.

Depois disso: mapa estelar do teclado com heatmap · testes por tempo ·
compartilhamento · progresso.

## Adicionando idioma ou conteúdo

Frases e snippets vivem em `packages/corpus/src/data/`.

**Novo idioma:** adicione o arquivo de frases, registre-o em `PHRASES` dentro de
`generate.ts`, e inclua o código do idioma em `LanguageSchema`
(`packages/contracts/src/index.ts`). Escreva as frases nativamente — as duas
listas compartilham a regra, não as sentenças.

**Nova linguagem de programação:** adicione os snippets em `data/snippets.ts` e
o identificador em `SyntaxSchema`. Cada snippet é uma função inteira que
compila, com a indentação exata; `generate.test.ts` recusa mistura de tabs com
espaços dentro de um mesmo snippet.

**Qualquer um dos dois:** suba `CORPUS_VERSION`. O motor e o gerador não
precisam de alteração.
