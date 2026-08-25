import type { SelectHTMLAttributes } from "react";

export type Option<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "onChange" | "value"
> & {
  value: T;
  options: readonly Option<T>[];
  onValueChange: (value: T) => void;
  label: string;
};

/**
 * Um `<select>` nativo debaixo da nossa pele.
 *
 * Uma listbox feita à mão custaria navegação por teclado, suporte a leitor de
 * tela e o seletor do celular, e não compraria nada de que o desenho precisa.
 */
export function Select<T extends string>({
  value,
  options,
  onValueChange,
  label,
  className = "",
  ...props
}: Props<T>) {
  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onValueChange(event.target.value as T)}
        className="h-8 cursor-pointer appearance-none rounded-sm bg-transparent py-0 pl-3 pr-7 text-sm font-medium text-ash transition-colors hover:text-bone focus-visible:text-bone"
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-obsidian text-bone">
            {option.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 10 6"
        className="pointer-events-none absolute right-2.5 h-2 w-3 fill-none stroke-current stroke-[1.5] text-ash"
      >
        <path d="M1 1l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
