"use client";

import Image from "next/image";
import perseusMark from "@/assets/perseus-mark.png";
import { Button } from "@/components/ui/button";

type Props = {
  onOpenRanking: () => void;
  onOpenDuel: () => void;
  onOpenStats: () => void;
  onOpenSettings: () => void;
  /** Header steps back during a run, like everything that is not the text. */
  dimmed: boolean;
};

export function AppHeader({
  onOpenRanking,
  onOpenDuel,
  onOpenStats,
  onOpenSettings,
  dimmed,
}: Props) {
  return (
    <header
      data-dimmed={dimmed}
      className="flex h-18 shrink-0 items-center justify-between px-6 opacity-100 transition-opacity duration-300 data-[dimmed=true]:opacity-40 hover:opacity-100"
    >
      <div className="flex items-center gap-2">
        <Button variant="quiet" size="sm" onClick={onOpenRanking}>
          ◆ Ranking
        </Button>
        {/* Next to the ranking rather than in the settings: both are the same
            question — how do I do against somebody else — and one of them
            happens live. */}
        <Button variant="quiet" size="sm" onClick={onOpenDuel}>
          ⚔ Duelo
        </Button>
      </div>

      <span className="display flex items-center gap-2 text-2xl tracking-[0.3em] text-bone">
        {/* The project mark: the 3D letter P raised off a black plate. It
            leads the lockup, so the wordmark's letterspacing does not have to
            be undone on the last letter to keep the gap even. */}
        <Image
          src={perseusMark}
          alt=""
          priority
          className="h-12 w-12 shrink-0"
        />
        PERSEUS
      </span>

      <div className="flex items-center gap-2">
        <Button variant="quiet" size="sm" onClick={onOpenStats}>
          Sessão ▸
        </Button>
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Configurações"
          className="grid h-10 w-10 place-items-center rounded-sm text-2xl leading-none text-ash transition-colors hover:bg-obsidian hover:text-mint"
        >
          ⚙
        </button>
      </div>
    </header>
  );
}
