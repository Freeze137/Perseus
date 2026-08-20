"use client";

type Props = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
};

export function Toggle({ checked, onCheckedChange, label }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(!checked)}
      className="group inline-flex items-center gap-3 text-sm text-ash transition-colors hover:text-bone"
    >
      <span
        aria-hidden="true"
        className={`relative h-4 w-8 rounded-full transition-colors duration-150 ${
          checked ? "bg-emerald/40" : "bg-slate"
        }`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full transition-[left,background-color] duration-150 ${
            checked ? "left-[1.125rem] bg-mint" : "left-0.5 bg-ash"
          }`}
        />
      </span>
      {label}
    </button>
  );
}
