type Props = {
  /**
   * Quando o movimento está calado, por escolha de desempenho ou por
   * `prefers-reduced-motion`. Vem do `useMotionLevel`, que é onde as duas
   * entradas são combinadas — perguntar só uma delas aqui veria metade.
   */
  still: boolean;
};

/**
 * Dois traços de menta dando a volta pela borda de uma caixa.
 *
 * Desenhados por cima de tudo e fora do fluxo, com `vector-effect` pra a
 * espessura não esticar junto com a caixa — o `preserveAspectRatio="none"`
 * estica o quadrado de 100 por 100 até o formato real, e sem isso a linha
 * sairia grossa em cima e fina dos lados.
 *
 * Duas voltas e não quatro: com quatro a borda vira uma corrente contínua e
 * para de ler como algo que dá a volta. Parado, a segunda some e a primeira
 * vira moldura — o que fica é o verde, e o que sai é a viagem.
 */
export function LiveLines({ still }: Props) {
  return (
    <svg
      aria-hidden="true"
      className="live-lines"
      data-still={still}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <rect className="live-line" x="1" y="1" width="98" height="98" rx="2" pathLength={100} />
      <rect
        className="live-line live-line-tail"
        x="1"
        y="1"
        width="98"
        height="98"
        rx="2"
        pathLength={100}
      />
    </svg>
  );
}
