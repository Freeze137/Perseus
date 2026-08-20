import type { ButtonHTMLAttributes } from "react";

type Variant = "ghost" | "edge" | "quiet";
type Size = "sm" | "md";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-sm font-medium transition-colors duration-150 " +
  "disabled:pointer-events-none disabled:opacity-40";

const VARIANTS: Record<Variant, string> = {
  // The default action: a 1px gradient edge, never a filled green slab.
  edge: "bg-obsidian text-bone shadow-[inset_0_0_0_1px] shadow-emerald/60 hover:shadow-mint/80 hover:text-mint",
  ghost: "text-ash hover:text-bone hover:bg-obsidian",
  quiet: "text-ash hover:text-mint",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-sm tracking-[0.01em]",
  md: "h-10 px-5 text-base tracking-[0.01em]",
};

export function Button({
  variant = "ghost",
  size = "md",
  className = "",
  type = "button",
  ...props
}: Props) {
  return (
    <button
      type={type}
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  );
}
