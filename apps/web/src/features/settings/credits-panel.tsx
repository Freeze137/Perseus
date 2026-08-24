/**
 * De onde vêm as frases.
 *
 * Isto não é cortesia: as frases dos bancos `tatoeba-*` são usadas sob CC-BY
 * 2.0 FR, e o crédito é condição da licença. Enquanto vivia só num arquivo do
 * repositório, a condição estava cumprida para quem clona e descumprida para
 * quem usa o site — que é justamente quem a licença quer que saiba.
 *
 * Fica nas configurações, não no rodapé, porque não existe rodapé: a tela é uma
 * superfície de digitação e um rodapé permanente competiria por atenção com a
 * única coisa que ela pede.
 */
export function CreditsPanel() {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="label">Créditos</h3>
      <p className="text-sm leading-relaxed text-ash">
        Parte das frases de treino vem do{" "}
        <a
          href="https://tatoeba.org"
          target="_blank"
          rel="noreferrer"
          className="text-bone underline decoration-slate underline-offset-4 transition-colors hover:decoration-bone"
        >
          Tatoeba
        </a>
        , escritas e revisadas por falantes nativos e usadas sob a licença{" "}
        <a
          href="https://creativecommons.org/licenses/by/2.0/fr/"
          target="_blank"
          rel="noreferrer"
          className="text-bone underline decoration-slate underline-offset-4 transition-colors hover:decoration-bone"
        >
          CC-BY 2.0 FR
        </a>
        . As frases foram selecionadas e filtradas, não modificadas.
      </p>
    </section>
  );
}
