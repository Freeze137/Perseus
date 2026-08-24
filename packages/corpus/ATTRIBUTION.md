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

### Onde aparece

Na interface, em Configurações → Créditos
(`apps/web/src/features/settings/credits-panel.tsx`), com link para o Tatoeba e
para o texto da licença. Não fica em rodapé porque não existe rodapé: a tela é
uma superfície de digitação, e um rodapé permanente competiria por atenção com a
única coisa que ela pede.

## Frases originais

`src/data/phrases-pt-br.ts` e `src/data/phrases-en.ts` são escritas à mão para o
Perseus e não vêm do Tatoeba.
