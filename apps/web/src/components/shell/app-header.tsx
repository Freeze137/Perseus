"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { PerseusMark3D } from "@/components/shell/perseus-mark-3d";

type Props = {
  onOpenRanking: () => void;
  onOpenDuel: () => void;
  onOpenStats: () => void;
  onOpenSettings: () => void;
  /** Header steps back during a run, like everything that is not the text. */
  dimmed: boolean;
};

/** Which side of the wordmark the 3D mark leans on. */
type Placement = "before" | "after";

/**
 * Pin the lockup here once the side is decided.
 *
 * `null` alternates the mark from week to week so both arrangements can be
 * lived with before one is chosen. A logo that moves is not a logo, so this is
 * a trial and not a feature: set it to "before" or "after" and everything
 * below stops mattering.
 */
const PINNED: Placement | null = null;

const WEEK_MS = 604_800_000;

/** Nothing to subscribe to: the week does not turn over mid-run. */
const noSubscribe = () => () => {};
/** Stable for a week at a time, which is what makes it a snapshot at all. */
const readWeek = (): Placement =>
  Math.floor(Date.now() / WEEK_MS) % 2 === 0 ? "before" : "after";
const serverWeek = (): Placement => "before";

/**
 * The trial runs on the calendar rather than on a coin toss: the mark has to
 * stay put long enough to be judged, and a side that changes on every reload
 * is a glitch rather than a variant.
 *
 * Client-only on purpose. The prerender has no week it can trust — it would
 * be reading one in UTC for a typist who lives three hours west of it — so it
 * writes "before" and hydration settles the real answer.
 */
function usePlacement(): Placement {
  const week = useSyncExternalStore(noSubscribe, readWeek, serverWeek);
  return PINNED ?? week;
}

export function AppHeader({
  onOpenRanking,
  onOpenDuel,
  onOpenStats,
  onOpenSettings,
  dimmed,
}: Props) {
  const placement = usePlacement();

  return (
    <header
      data-dimmed={dimmed}
      className="relative flex h-18 shrink-0 items-center justify-between px-6 opacity-100 transition-opacity duration-300 data-[dimmed=true]:opacity-40 hover:opacity-100"
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

      {/* Centred against the viewport, not against what is left over between
          the two button groups — those are never the same width, and letting
          flex distribute the slack parked the wordmark a visible ~28px right
          of the page's own centre line. Hung below the header's midline as
          well, so the lockup sits over the star field rather than crowding the
          top edge, and the mark is free to overhang a 72px-tall header.

          The word sits on the centre line and the mark hangs off one side, so
          the pair weighs about sixty-six pixels more on the mark's side than
          on the other. The eye centres mass rather than boxes, which is why a
          mathematically centred word still reads as pushed over. `ml` leans
          the whole thing back against that, by roughly a third of the excess
          rather than all of it — the plate is dark on a black page and does
          not pull as hard as bold white letters do. It flips with the
          placement, so the lean always points away from the mark.

          Judge this one by eye; it is the only number here that cannot be
          derived. More negative moves the pair left on an "after" week.

          Inert: the wordmark is not a control, so it must not eat clicks that
          belong to the star field behind it. */}
      <span
        data-placement={placement}
        className="group pointer-events-none absolute left-1/2 top-1/2 ml-5 mt-2.5 origin-center -translate-x-1/2 -translate-y-1/2 scale-[0.62] data-[placement=after]:-ml-5 sm:scale-100"
      >
        {/* The word is the thing that gets centred, and it is centred alone.
            -mr cancels the trailing letterspace after the final S: tracking
            adds a gap the eye does not see but the box does, and leaving it in
            drags the word half a letter left of the centre line. */}
        <span className="display block -mr-[0.3em] text-3xl tracking-[0.3em] text-bone">
          PERSEUS
        </span>

        {/* The project mark: the 3D letter P raised off a black plate,
            tumbling on two axes. Out of the flow on purpose — it hangs beside
            the word instead of standing next to it in a row.

            A tumbling object has no single width. Face-on the plate covers
            about 47 of its 76 pixels; corner-on it reaches 68. In a row that
            breathing width would drag the word off centre as it turned, and
            any overlap tuned against the face-on silhouette would be eating a
            letter a second and a half later. Hung off the side, it cannot
            move the word and cannot reach a glyph, and the canvas's own
            transparent margin becomes the gap. */}
        <PerseusMark3D
          size={76}
          className="absolute top-1/2 z-10 -translate-y-1/2 right-full group-data-[placement=after]:left-full group-data-[placement=after]:right-auto"
        />
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
