"use client";

type Lane = {
  name: string;
  /** Characters committed. The bar is this over the length of the text. */
  index: number;
  finished: boolean;
  /** True for the lane belonging to whoever is looking at the screen. */
  mine: boolean;
};

type Props = {
  lanes: readonly Lane[];
  total: number;
};

/**
 * Two lanes, one text, no numbers.
 *
 * The temptation here is a live wpm for each player, and it is worth saying why
 * it is refused: a speed computed in the browser is the one figure in this whole
 * product the server does not stand behind, and putting two of them side by
 * side would be inviting a comparison out of exactly the numbers that are not
 * comparable yet. Position in the text is a fact both clients agree on — the
 * text is the same by construction — and it is the only thing being raced.
 *
 * Nothing here animates on a spring. The bar is a transform on a fixed element,
 * updated at the rate the positions arrive, and the keystroke path must not
 * wait on it: the character lands in the same frame as the keypress, and the
 * bar can be a frame behind without anybody noticing.
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
                // scaleX rather than width: width is a layout property and this
                // moves five times a second, next to a text that must not be
                // relaid out while somebody is typing into it.
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
