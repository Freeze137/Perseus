"use client";

type Lane = {
  name: string;
  /** Caracteres confirmados. A barra é isto sobre o tamanho do texto. */
  index: number;
  finished: boolean;
  /** True pra pista de quem está olhando a tela. */
  mine: boolean;
};

type Props = {
  lanes: readonly Lane[];
  total: number;
};

/**
 * Duas pistas, um texto, nenhum número.
 *
 * A tentação aqui é um ppm ao vivo pra cada jogador, e vale dizer por que é
 * recusado: velocidade calculada no browser é o único número deste produto
 * inteiro pelo qual o servidor não responde, e pôr dois lado a lado seria
 * convidar uma comparação feita exatamente dos números que ainda não são
 * comparáveis. Posição no texto é um fato com que os dois clientes concordam —
 * o texto é o mesmo por construção — e é a única coisa sendo disputada.
 *
 * Nada aqui anima em mola. A barra é um transform num elemento fixo, atualizado
 * no ritmo em que as posições chegam, e o caminho da tecla não pode esperar por
 * ela: o caractere cai no mesmo frame da tecla, e a barra pode ficar um frame
 * atrás sem ninguém notar.
 */
export function DuelTrack({ lanes, total }: Props) {
  return (
    <ul className="flex flex-col gap-2">
      {lanes.map((lane) => {
        const share = total > 0 ? Math.min(1, lane.index / total) : 0;
        return (
          <li key={`${lane.name}-${lane.mine}`} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span
                data-mine={lane.mine}
                className="truncate text-sm text-ash data-[mine=true]:text-bone"
              >
                {lane.name}
                {lane.mine ? " · Você" : ""}
              </span>
              <span className="font-mono text-xs tabular-nums text-ash">
                {lane.finished ? "Fim" : `${Math.round(share * 100)}%`}
              </span>
            </div>

            <div
              role="progressbar"
              aria-label={`Progresso de ${lane.name}`}
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={Math.min(lane.index, total)}
              className="h-1 overflow-hidden rounded-full bg-slate"
            >
              <div
                data-mine={lane.mine}
                // scaleX e não width: width é propriedade de layout e isto se
                // move cinco vezes por segundo, ao lado de um texto que não
                // pode ter o layout refeito enquanto alguém digita nele.
                style={{ transform: `scaleX(${share})` }}
                className="h-full origin-left bg-jade transition-transform duration-150 ease-snap data-[mine=true]:bg-mint"
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
