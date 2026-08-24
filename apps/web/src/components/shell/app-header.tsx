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

          Inert: the wordmark is not a control, so it must not eat clicks that
          belong to the star field behind it. */}
      <span
        data-placement={placement}
        className="group pointer-events-none absolute left-1/2 top-1/2 mt-2.5 flex origin-center -translate-x-1/2 -translate-y-1/2 scale-[0.62] items-center data-[placement=after]:flex-row-reverse sm:scale-100"
      >
        {/* The project mark: the 3D letter P raised off a black plate,
            tumbling on two axes. It sits above the wordmark and clips its
            leading edge, because occlusion is what says "nearer" — a drop
            shadow cannot, on a page whose background is already true black,
            and a CSS filter over a canvas that repaints every frame is a cost
            the keystroke would end up paying. */}
        <PerseusMark3D size={76} className="relative z-10 shrink-0" />
        {/* Two negative margins doing two different jobs.
            The one facing the mark (-ml-5 / -mr-5) is the overlap. Most of it
            is spent crossing the canvas's own transparent margin — the camera
            frames the tumble's bounding sphere, so the plate never reaches the
            edge of its 76px box — and what is left lands on the P. Widen or
            narrow it by one step if the bite is wrong; it is the only number
            here that has to be judged by eye.
            The one on the outer edge cancels the trailing letterspace after
            the final S. Tracking adds a gap the eye does not see but the box
            does, and an uncancelled one drags the lockup half a letter off the
            centre line. With the mark on the right that gap falls between the
            two, where it is wanted, so only the overlap remains. */}
        <span className="display -ml-5 -mr-[0.3em] text-2xl tracking-[0.3em] text-bone group-data-[placement=after]:ml-0 group-data-[placement=after]:-mr-5">
          PERSEUS
        </span>
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
