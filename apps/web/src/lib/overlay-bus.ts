/**
 * Side channel telling the star field when something is sitting on top of it.
 *
 * The same reasoning as the keystroke bus, for the opposite direction: the
 * canvas must not subscribe to React state, so the shell says out here whether
 * an overlay is covering it and the field reads it inside its own loop.
 *
 * What it buys is a frame budget. A drawer or the settings dialog covers the
 * whole field with a scrim it cannot be seen through, and a `requestAnimationFrame`
 * loop redrawing several hundred shapes underneath an opaque sheet is work
 * nobody can see — work that competes for frames with the panel animating on
 * top of it, which is the one thing on screen anybody is looking at.
 */
export type OverlayListener = (covered: boolean) => void;

const listeners = new Set<OverlayListener>();

/** How many overlays are open. Counted, not flagged: a drawer can be opened
 *  over the settings dialog, and the field stays down until the last one goes. */
let depth = 0;

export function setOverlayOpen(open: boolean, id: string): void {
  const was = depth > 0;
  if (open) open_.add(id);
  else open_.delete(id);
  depth = open_.size;
  const now = depth > 0;
  if (was !== now) for (const listener of listeners) listener(now);
}

/** Named rather than counted so a double-open of the same panel cannot leak. */
const open_ = new Set<string>();

export function isOverlayOpen(): boolean {
  return depth > 0;
}

export function onOverlayChange(listener: OverlayListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
