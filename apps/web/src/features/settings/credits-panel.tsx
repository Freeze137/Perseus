import { SITE_NAME } from "@/lib/site";

/**
 * Quem fez, e de onde vêm as frases.
 *
 * Os dois blocos são separados por régua de propósito. O do Tatoeba é
 * exigência da licença CC-BY, não gentileza — grudado na assinatura ele
 * parece gentileza e para de cumprir a licença.
 *
 * Fica nas configurações porque não existe rodapé. A tela é pra digitar.
 */

/** Onde a pessoa está. Portfólio primeiro: é o que ele mesmo escolheu mostrar. */
const LINKS = [
  { label: "Portfólio", href: "https://portfolio-delta-ten-covuf9ebim.vercel.app/" },
  { label: "GitHub", href: "https://github.com/Freeze137" },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/in/rafael-souza-71481b2b5",
  },
] as const;

/** Sublinhado dos links. Estava copiado três vezes. */
const LINK =
  "text-bone underline decoration-slate underline-offset-4 transition-colors hover:decoration-bone";

export function CreditsPanel() {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h3 className="label">Créditos</h3>
        {/* Nada de "feito com carinho por". Diz o que a pessoa fez e para. */}
        <p className="text-sm leading-relaxed text-ash">
          {SITE_NAME} foi escrito por Rafael Souza Costa. Motor de digitação,
          corpus, servidor e desenho.
        </p>
        {/* Os três links numa linha só, separados por ponto. Três âncoras
            dentro da frase acima picotavam a leitura. */}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ash">
          {LINKS.map((link, i) => (
            <span key={link.href} className="flex items-center gap-x-2">
              {i > 0 ? <span aria-hidden="true">·</span> : null}
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className={LINK}
              >
                {link.label}
              </a>
            </span>
          ))}
        </p>
      </div>

      <div className="rule" />

      <p className="text-sm leading-relaxed text-ash">
        Parte das frases de treino vem do{" "}
        <a
          href="https://tatoeba.org"
          target="_blank"
          rel="noreferrer"
          className={LINK}
        >
          Tatoeba
        </a>
        , escritas e revisadas por falantes nativos e usadas sob a licença{" "}
        <a
          href="https://creativecommons.org/licenses/by/2.0/fr/"
          target="_blank"
          rel="noreferrer"
          className={LINK}
        >
          CC-BY 2.0 FR
        </a>
        . As frases foram selecionadas e filtradas, não modificadas.
      </p>
    </section>
  );
}
