type Props = {
  /** O que está sendo esperado, dito por extenso para quem não vê o grid. */
  label: string;
};

/** Nove casas, três por linha. Cada uma cai no seu tempo. */
const CELLS = Array.from({ length: 9 }, (_, index) => index);

/**
 * A espera desenhada: um grid de estrelas que caem em cascata.
 *
 * O glifo é o mesmo `✦` do campo de fundo e do tique da lista — a espera não
 * precisava de vocabulário novo, e o original de onde isto vem caía em `0` e
 * `1` verde-neon, que é matrix e não é este site.
 *
 * O texto continua existindo debaixo do grid, em `sr-only`: um enfeite que
 * anima não diz a ninguém o que está sendo carregado, e `role="status"` sem
 * conteúdo é uma região que nunca fala.
 */
export function StarLoader({ label }: Props) {
  return (
    <div role="status" className="star-loader">
      {CELLS.map((cell) => (
        <span key={cell} aria-hidden="true" className="star-loader-cell">
          ✦
        </span>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}
