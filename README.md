# PERSEUSS

Treinador de digitação para navegador, em português e inglês, para texto corrido
e para código. Quinze linguagens de programação com auto-indentação real, cinco
modos de texto, corpus determinístico, duelo 1v1 e um servidor que não aceita a
palavra do cliente sobre o próprio resultado.

**[perseuss.tech](https://perseuss.tech/)** — site na Vercel, API no Fly.io em
São Paulo (`gru`), banco no Neon.

O nome é uma constelação e o produto ensina um mapa: o teclado virtual é
desenhado como um mapa estelar, onde o brilho de cada tecla reflete o domínio
real do usuário sobre ela. O segundo s é do endereço: `perseus.tech` já tinha
dono, e a marca preferiu acompanhar o domínio a brigar com ele.

## O que ele faz

| | |
|---|---|
| **Modos** | `words`, `quote`, `punctuation`, `numbers`, `code` |
| **Idiomas** | pt-BR e en — bancos escritos nativamente, não traduzidos |
| **Código** | TypeScript, JavaScript, Python, Rust, Go, Java, Kotlin, Swift, C#, C++, C, Ruby, PHP, Bash, SQL — com a indentação exata |
| **Teclados** | ABNT2, US, US Internacional — a escolha alcança o sorteio das frases |
| **Corpus** | onze mil frases, geradas a partir de um seed: mesmo seed, mesmo texto |
| **Duelo** | sala privada por código, dois jogadores, o mesmo texto, servidor decidindo quem venceu |
| **Offline** | sem credenciais o treinador roda inteiro; só não oferece conta nem ranking |
| **Janela própria** | casca Electron opcional: o site sem barra de endereço |

Uma corrida dura de trinta segundos a poucos minutos. Há uma tela só, e a tarefa
dela é a corrida em andamento — configurações, ranking e estatísticas são
camadas por cima, nunca destinos.

## Como ele mede

**Backspace não é keystroke.** Correções não entram na timeline, então nunca
inflam o PPM bruto. Mas o erro corrigido continua contando contra a precisão:
ele aconteceu, e esconder isso bajularia o aprendiz.

**O cliente não pontua a si mesmo.** Resultados sobem como linha do tempo de
teclas, não como números. A API regenera o texto a partir do seed, reproduz a
digitação com `replay()` e calcula ppm, precisão e consistência ela mesma. Um
`wpm` vindo do navegador é um número que qualquer pessoa digita no console.

**Nem o relógio dele.** Reproduzir a digitação prova os caracteres e não diz
nada sobre *quando* foram pressionados. Uma timeline com os mesmos caracteres
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

## Como foi construído

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

**Todo texto tem sentido.** Nenhum modo concatena tokens soltos. `words` e
`numbers` também saem do banco de frases — o primeiro sem maiúsculas e sem
pontuação, o segundo escolhendo frases que já carregam números. Uma sopa de
palavras treina as letras enquanto ensina um ritmo que língua nenhuma tem, e o
ritmo é boa parte do que se está treinando. `generate.test.ts` tem um teste que
falha se algum builder voltar a montar texto por concatenação.

**Uma instância só, por desenho.** O duelo vive em memória no processo da API:
duas máquinas, e quem criou a sala e quem entrou pelo link caem em processos que
não se enxergam. `fly.toml` fixa `count = 1` e a máquina não dorme — dormir é
perder as salas.

## Onde ele mora

```
apps/
  web/       Next.js 16 · React 19 · Tailwind 4      → Vercel
  api/       NestJS 11                                → Fly.io (gru)
  desktop/   casca Electron: o site numa janela própria
packages/
  engine/    motor de digitação — TS puro, sem DOM e sem React
  corpus/    frases pt-BR/en e snippets de código + gerador determinístico
  contracts/ schemas Zod compartilhados entre web e api
supabase/
  migrations/ schema, políticas de RLS e a função do ranking
docs/
  DUELO.md       documento canônico do multiplayer
  DEPLOY-FLY.md  a rota que está no ar: Fly + Neon + Vercel
  PHASE-2.md     o que ficou para depois
```

199 testes: 46 no motor, 91 no corpus, 44 na API, 18 no site.

## Créditos

Escrito por **Rafael Souza Costa** — [@Freeze137](https://github.com/Freeze137).
Produto, engenharia e desenho, do motor de digitação ao mapa estelar.

Parte do corpus vem do [Tatoeba](https://tatoeba.org) sob CC BY 2.0 FR — a
atribuição por frase está em `packages/corpus/ATTRIBUTION.md` e nos créditos
dentro do produto.

## Uso

Código de um produto, não um projeto aberto. Sem licença de uso, sem
redistribuição e sem contribuições externas.
