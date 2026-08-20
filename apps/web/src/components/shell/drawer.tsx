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
  side: "left" | "right";
  children: ReactNode;
};

/**
 * A side panel that stays out of the way until asked for.
 *
 * The screen belongs to the text: anything permanently parked beside it is
 * something the eye has to keep dismissing while typing.
 *
 * It stays mounted and slides on a spring rather than unmounting, so that a
 * panel caught halfway — opened, reconsidered, closed again — leaves from where
 * it actually is. A tween would snap back to the start of a new one.
 *
 * Mounted is not the same as reachable: `inert` takes the whole subtree out of
 * the tab order and off the accessibility tree while it is closed. Before it,
 * every control inside a shut drawer was still tabbable from the typing screen.
 */
export function Drawer({ open, onClose, title, side, children }: Props) {
  const level = useMotionLevel();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  useEffect(() => {
    setOverlayOpen(open, `drawer:${title}`);
    return () => setOverlayOpen(false, `drawer:${title}`);
  }, [open, title]);

  // Focus follows the panel in. Without it the drawer opens somewhere a
  // keyboard cannot get to, and the tab order carries on behind it as though
  // nothing had happened. Going back out is the page's job — it hands focus to
  // the typing input, which is where the next keystroke should land anyway.
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  return (
    <>
      <motion.div
        aria-hidden="true"
        onClick={onClose}
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={transitionFor(level, { duration: 0.2 })}
        data-open={open}
        className="pointer-events-none fixed inset-0 z-20 bg-void/60 data-[open=true]:pointer-events-auto"
      />
      <motion.aside
        aria-label={title}
        inert={!open}
        data-open={open}
        initial={false}
        animate={{ x: open ? 0 : side === "left" ? "-100%" : "100%" }}
        transition={transitionFor(level, SPRING.panel)}
        className={`fixed inset-y-0 z-30 flex w-[min(22rem,88vw)] flex-col gap-5 bg-obsidian p-6 ${
          side === "left"
            ? "left-0 border-r border-slate"
            : "right-0 border-l border-slate"
        }`}
      >
        <header className="flex items-center justify-between">
          <h2 className="label">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={`Fechar ${title}`}
            className="grid h-8 w-8 place-items-center rounded-sm text-lg leading-none text-ash transition-colors hover:bg-slate hover:text-bone"
          >
            ✕
          </button>
        </header>
        {children}
      </motion.aside>
    </>
  );
}
