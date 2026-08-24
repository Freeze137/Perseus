# Atribuição

## Tatoeba

Os arquivos `src/data/tatoeba-pt-br.ts` e `src/data/tatoeba-en.ts` contêm
frases do [projeto Tatoeba](https://tatoeba.org), usadas sob a licença
**CC-BY 2.0 FR** (<https://creativecommons.org/licenses/by/2.0/fr/>).

As frases foram **filtradas e selecionadas**, não modificadas: cada uma aparece
exatamente como foi escrita no Tatoeba. O que o `scripts/ingest-tatoeba.mjs` faz
é escolher quais entram — por comprimento, pontuação final, ausência de nomes
próprios, ausência de temas pesados e ausência de quase-duplicatas.

A atribuição é **condição da licença**, não cortesia. Ela precisa aparecer em
algum lugar visível para quem usa o site, não só neste arquivo.

### Pendência

Ainda falta creditar o Tatoeba na interface — rodapé, tela de configurações ou
página de créditos. Enquanto isso não existe, o requisito de atribuição está
cumprido apenas no repositório.

## Frases originais

`src/data/phrases-pt-br.ts` e `src/data/phrases-en.ts` são escritas à mão para o
Perseus e não vêm do Tatoeba.
