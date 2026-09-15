type Glyphs = "stars" | "bits";

type Props = {
  /** O que está sendo esperado, dito por extenso para quem não vê o grid. */
  label: string;
  /**
   * `bits` em código, `stars` no resto.
   *
   * Zero e um são literais em código e mentem em prosa: quem espera uma frase
   * em português não está esperando binário. A espera fala a língua do modo,
   * como a dica embaixo da barra já faz.
   */
  glyphs?: Glyphs;
};

/**
 * Os nove caracteres que caem, em ordem fixa.
 *
 * Fixa e não sorteada: `Math.random` aqui daria uma sequência no servidor e
 * outra no cliente, e o React reclamaria da divergência numa animação que não
 * ganha nada em ser imprevisível — nove casas caindo em cascata já não se
 * leem como padrão.
 */
const BITS = ["0", "1", "1", "1", "0", "1", "0", "1", "0"] as const;
const STARS = Array.from({ length: BITS.length }, () => "✦");

/**
 * A espera desenhada: um grid de caracteres que caem em cascata.
 *
 * O glifo é o mesmo `✦` do campo de fundo e do tique da lista — a espera não
 * precisava de vocabulário novo. Em código ele vira zero e um, que é o
 * original de onde isto vem, sem o verde-neon e sem o brilho: caractere
 * caindo como espera amarra num site cujo assunto é caractere chegando na
 * tela.
 *
 * O texto continua existindo debaixo do grid, em `sr-only`: um enfeite que
 * anima não diz a ninguém o que está sendo carregado, e `role="status"` sem
 * conteúdo é uma região que nunca fala.
 */
export function FallLoader({ label, glyphs = "stars" }: Props) {
  const cells = glyphs === "bits" ? BITS : STARS;

  return (
    <div role="status" data-glyphs={glyphs} className="fall-loader">
      {cells.map((cell, index) => (
        <span
          // A posição é a identidade aqui: as nove casas são um grid parado, e
          // o que muda de uma pra outra é só o atraso da queda.
          key={index}
          aria-hidden="true"
          className="fall-loader-cell"
        >
          {cell}
        </span>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}
