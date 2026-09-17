"use client";

import type { ButtonHTMLAttributes } from "react";
import { useMotionLevel } from "@/features/settings/use-motion-level";

type Props = ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * O botão que chama.
 *
 * Existe pra uma ação só do site — criar o passaporte — e é por isso que ele
 * pode ser o que é. O resto dos botões daqui é borda de 1px e nada mais, e
 * essa contenção é justamente o que faz um botão com halo girando atrás
 * significar alguma coisa. Um segundo botão assim e os dois viram enfeite.
 *
 * A mecânica é a do `spin` do uiverse: um gradiente girando atrás de uma placa
 * escura, desfocado, mais um aro do mesmo gradiente na beirada. O que não vem
 * de lá são três camadas de filtro SVG com `feColorMatrix`, um backdrop de
 * `inset: -9900%` e um `clip-path: path()` que fixa o botão em 120 por 60 — o
 * caminho é desenhado em pixels absolutos e qualquer palavra maior que "Button"
 * sai por fora dele. Aqui são dois gradientes cônicos e um desfoque, e o botão
 * tem a largura do que estiver escrito nele.
 *
 * A cor é uma só. O original vai de verde a azul, e azul neste site é o que
 * nenhuma superfície faz — a paleta inteira é preta e verde de propósito, e um
 * azul-royal girando atrás de um botão seria a única coisa da tela que não
 * pertence a ela.
 */
export function BeaconButton({ className = "", type = "button", ...props }: Props) {
  const still = useMotionLevel() === "none";

  return (
    <span className="beacon" data-still={still}>
      {/* O halo. Fora do botão e marcado como decoração: quem lê por leitor de
          tela recebe o rótulo do botão e mais nada. */}
      <span aria-hidden="true" className="beacon-halo" />
      <button type={type} className={`beacon-face ${className}`} {...props} />
    </span>
  );
}
