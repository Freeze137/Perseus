import { SITE_NAME } from "@/lib/site";

/**
 * Quem escreveu o produto, e de onde vêm as frases.
 *
 * Os dois blocos abaixo parecem a mesma coisa e não são, e é por isso que uma
 * régua os separa. O segundo não é cortesia: as frases dos bancos `tatoeba-*`
 * são usadas sob CC-BY 2.0 FR, e o crédito é condição da licença. Enquanto
 * vivia só num arquivo do repositório, a condição estava cumprida para quem
 * clona e descumprida para quem usa o site — que é justamente quem a licença
 * quer que saiba. Misturar a autoria no mesmo parágrafo diluiria isso: uma
 * obrigação legal lida como assinatura deixa de ser lida como obrigação.
 *
 * Fica nas configurações, não no rodapé, porque não existe rodapé: a tela é uma
 * superfície de digitação e um rodapé permanente competiria por atenção com a
 * única coisa que ela pede.
 */

/** O sublinhado dos três links daqui, escrito uma vez. */
const LINK =
  "text-bone underline decoration-slate underline-offset-4 transition-colors hover:decoration-bone";

export function CreditsPanel() {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h3 className="label">Créditos</h3>
        {/* Sem "feito com carinho por". O produto não bajula quem digita e não
            tem por que bajular quem o escreveu: a frase diz o que a pessoa fez,
            que é a informação, e para. */}
        <p className="text-sm leading-relaxed text-ash">
          {SITE_NAME} foi escrito por{" "}
          <a
            href="https://github.com/Freeze137"
            target="_blank"
            rel="noreferrer"
            className={LINK}
          >
            Rafael Souza Costa
          </a>
          . Motor de digitação, corpus, servidor e desenho.
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
