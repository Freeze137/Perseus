"use client";

import type { CSSProperties } from "react";
import { useSettings } from "@/features/settings/use-settings";
import { useMotionLevel } from "@/features/settings/use-motion-level";

/** Quantas colunas atravessam o painel. Doze cobrem 352px sem virar parede. */
const COLUMNS = 12;
/** Glifos por coluna. A tira é desenhada duas vezes pra volta não ter emenda. */
const PER_COLUMN = 22;

/**
 * A sequência de uma coluna, derivada do índice dela.
 *
 * Nada de `Math.random`: o servidor sortearia uma sequência e o cliente outra,
 * e o React reclamaria da divergência — o mesmo motivo pelo qual os nove
 * caracteres da espera são uma lista fixa. Dois primos e um deslocamento por
 * coluna bastam pra doze tiras não lerem como a mesma tira repetida.
 */
function column(index: number): string {
  let out = "";
  for (let row = 0; row < PER_COLUMN; row += 1) {
    out += String((index * 7 + row * 13 + row * row * 3) % 10);
    out += "\n";
  }
  return out;
}

/**
 * Dígitos caindo atrás do ranking.
 *
 * O painel do ranking é quase todo vazio enquanto o board for curto, e vazio
 * nesta gaveta não é silêncio: é um retângulo preto de 700px debaixo de duas
 * linhas. O que enche não é conteúdo inventado — é atmosfera, e ela para na
 * porta do conteúdo: 14% de opacidade, esmeralda, atrás de tudo e sem capturar
 * ponteiro.
 *
 * A mecânica é a do "matrix rain" que corre por aí, e o que ela evita é como
 * essas versões costumam ser feitas: um canvas com laço de `requestAnimationFrame`
 * por cima do campo de estrelas, que já tem o dele. Aqui cada coluna é um
 * elemento de texto que translada em Y — transformação e nada mais, que é o que
 * o compositor faz sozinho, sem repintar o painel a cada quadro.
 *
 * Doze colunas com durações diferentes e atrasos negativos: elas começam
 * desencontradas em vez de largarem juntas na abertura da gaveta, que é a
 * diferença entre chuva e cortina.
 */
export function DigitRain() {
  const still = useMotionLevel() === "none";
  const tier = useSettings((state) => state.performance);

  // No nível mínimo não há campo de estrelas, e uma chuva de dígitos no lugar
  // dele seria o nível trocando uma decoração por outra. "Sem canvas e sem
  // movimento" é o que ele promete, e isto é a segunda metade.
  if (tier === "minimal") return null;

  return (
    <div aria-hidden="true" className="digit-rain" data-still={still}>
      {Array.from({ length: COLUMNS }, (_, index) => {
        const strip = column(index);
        return (
          <span
            key={index}
            className="digit-rain-column"
            // Variáveis e não `animation-duration` direto: o valor em linha
            // ganha de qualquer classe, e com movimento calado a folha precisa
            // poder trocar a queda por um desvanecimento. Primos de novo, em
            // segundos — entre 9 e 20s, sem duas colunas dividindo a mesma
            // volta —, e o atraso negativo é o que as põe no meio da queda já
            // no primeiro quadro, em vez de todas largando do topo juntas.
            style={
              {
                "--fall-duration": `${9 + ((index * 5) % 12)}s`,
                "--fall-delay": `-${(index * 3) % 11}s`,
              } as CSSProperties
            }
          >
            {/* A mesma tira duas vezes. A volta desliza metade da própria
                altura, então a segunda cópia chega exatamente onde a primeira
                estava — sem isso a emenda pisca uma vez por volta. */}
            {strip}
            {strip}
          </span>
        );
      })}
    </div>
  );
}
