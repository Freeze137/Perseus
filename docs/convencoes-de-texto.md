# Convenções de texto

Como o PERSEUS escreve o que aparece na tela. Vale para botão, rótulo, título,
aba, menu, campo, aviso, erro, modal, estado vazio, tela de carregamento — e
também para o que não se vê: `aria-label`, `title`, `alt`, `<meta>` e o título
da aba.

A checagem automática é `apps/web/scripts/check-text.mjs`, rodada pelo CI.

## Caixa

**Português: sentence case.** Só a primeira letra em maiúscula, mais nomes
próprios e siglas.

```
Nova corrida          não  Nova Corrida
Melhor pontuação      não  Melhor Pontuação
Modo programador      não  Modo Programador
```

Title Case é padrão do inglês e fica errado em português. **Nos textos em
inglês, siga o inglês** — Title Case em títulos e botões.

`PERSEUS` sempre em maiúscula, é nome próprio.

Siglas preservadas: `PPM`, `WPM`, `CPM`, `FPS`.

## Teclas

Nome de tecla vai em caixa alta, pela mesma razão que ela tem contorno: quem
procura um atalho no meio de uma corrida procura a tecla, não a frase que a
explica.

```jsx
<Key>esc</Key> abandona e sorteia outro
```

Renderiza `ESC abandona e sorteia outro`. A caixa vem do `<kbd>` em
`start-bar.tsx`, não da string — escrever `<Key>ESC</Key>` colocaria a mesma
decisão em dois lugares para divergirem depois.

**A ação que acompanha a tecla continua em minúscula.** Só a tecla sobe.

## Quando a caixa vem do CSS

Três formas, e o verificador conhece as três:

| forma | onde |
|---|---|
| `className="label"` | `globals.css` — `text-transform: uppercase` |
| `className="... uppercase"` | utilitário do Tailwind |
| `style={{ textTransform: "uppercase" }}` | imagens OG, que não usam Tailwind |

Nesses casos **a string fica em minúscula no código**. `<span className="label">precisão</span>`
aparece como `PRECISÃO` na tela, e escrever `PRECISÃO` no código faria o texto
passar duas vezes pela mesma decisão.

Se um componente novo sobe a caixa por dentro, acrescente o nome dele a
`RAISING_COMPONENTS` no verificador. Senão ele vai cobrar uma maiúscula que o
CSS já dá.

## Continuação de frase

Texto depois de uma tag de fechamento é continuação, e continua em minúscula:

```jsx
<Key>enter</Key> repete o mesmo texto
Em código, prefira o <strong>cpm</strong>. O ppm divide por cinco caracteres
```

O verificador não reclama porque vê o `</...>` antes do texto.

## O que não é texto de interface

E-mails (`voce@exemplo.com`), unidades, URLs, identificadores de código que
caíram dentro de um template. Todos legitimamente minúsculos.

## Rodar

```bash
cd apps/web && node scripts/check-text.mjs
```

Sai `0` quando está limpo, `1` com a lista de arquivo, linha e trecho.
