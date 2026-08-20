"use client";

import { motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { setOverlayOpen } from "@/lib/overlay-bus";
import { SPRING } from "@/lib/springs";
import { transitionFor } from "@/features/settings/performance-tiers";
import { useMotionLevel } from "@/features/settings/use-motion-level";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

/** Exits are a tween, not a spring: overshoot after the reader has looked away. */
const LEAVE = { duration: 0.14, ease: [0.4, 0, 1, 1] } as const;

/**
 * Built on the native `<dialog>`: focus trapping, Escape, inertness of the page
 * behind, and the top layer all come from the platform instead of from us,
 * which is how they end up correct.
 *
 * ---
 *
 * **The contents stay mounted, exactly like the drawers do.**
 *
 * A version of this gated the panel behind `AnimatePresence`, so opening the
 * dialog mounted its whole subtree — the account panel, the keyboard map, every
 * one of its twelve keys registering with Motion's projection tree — in the one
 * frame the opening animation had to start in. The drawers never felt that way
 * because they were never built that way: they are always in the DOM and only
 * slide. This now matches them. Opening is an animation and nothing else.
 *
 * While the dialog is shut the browser's own `display: none` on a closed
 * `<dialog>` keeps the subtree off the accessibility tree, out of the tab order
 * and out of the render, so permanence costs nothing after the first mount.
 *
 * `close()` waits for the exit to finish, because it drops the element out of
 * the top layer in the frame it is called and would delete the panel mid-exit.
 * Escape is intercepted through `onCancel` for the same reason: the platform's
 * own close is instant, and instant is the one thing the exit cannot be.
 *
 * The scrim is drawn here rather than left to `::backdrop`, which React cannot
 * reach and which only stops existing at `close()` — that is, after the panel
 * has already gone, leaving a dark and empty screen behind it.
 */
export function Modal({ open, onClose, title, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const level = useMotionLevel();
  const still = level === "none";

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
  }, [open]);

  // Tell the star field to stand down: it is fully covered, and its render loop
  // would otherwise compete for frames with this panel's own animation.
  useEffect(() => {
    setOverlayOpen(open, `modal:${title}`);
    return () => setOverlayOpen(false, `modal:${title}`);
  }, [open, title]);

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-0 h-full max-h-full w-full max-w-full overflow-visible bg-transparent p-0 text-bone backdrop:bg-transparent"
    >
      <motion.div
        aria-hidden="true"
        onClick={onClose}
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={transitionFor(level, { duration: 0.18 })}
        // No `backdrop-filter`. A full-screen blur cannot be cached while
        // anything behind it moves, and what is behind it here is an animated
        // canvas — so the compositor was re-blurring the whole viewport every
        // frame, next to the panel trying to animate on top of it. The drawers
        // never had one and never felt heavy, which is the comparison that
        // found this. A solid scrim separates just as well.
        className="absolute inset-0 bg-void/85"
      />

      {/* Anchored near the top rather than centred. The panel's content can
          change height while it is open — the keyboard consequence appears and
          disappears — and a centred box answers that by moving everything
          already on screen half the difference. Anchored, it grows downward
          into empty space and nothing the reader is looking at shifts. */}
      <div className="pointer-events-none absolute inset-0 grid items-start justify-items-center p-4 pt-[max(1rem,8vh)]">
        <motion.div
          initial={false}
          animate={
            open
              ? { opacity: 1, scale: 1, y: 0 }
              : {
                  // The resting place the panel springs out of and tweens back
                  // into. Far enough that arriving reads as arriving.
                  opacity: 0,
                  scale: still ? 1 : 0.94,
                  y: still ? 0 : 12,
                }
          }
          transition={transitionFor(level, open ? SPRING.panel : LEAVE)}
          onAnimationComplete={() => {
            if (!open) ref.current?.close();
          }}
          className="scroll-silent pointer-events-auto max-h-full w-[min(30rem,100%)] overflow-y-auto rounded-md border border-slate bg-obsidian p-6"
        >
          <header className="mb-4 flex items-center justify-between">
            <h2 className="label">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="grid h-8 w-8 place-items-center rounded-sm text-ash transition-colors hover:bg-slate hover:text-bone"
            >
              ✕
            </button>
          </header>
          {children}
        </motion.div>
      </div>
    </dialog>
  );
}
