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
 *
 * A lista aberta era o que sobrava de fora: quem a desenhava era o sistema, e
 * `<option>` pintado de obsidiana chegava branco no Windows. Quem resolve é
 * `appearance: base-select`, na folha global sob `.select-native` — o popup
 * passa a aceitar CSS sem que isto deixe de ser um `select`. A classe existe
 * porque uma utilitária `appearance-none` venceria a regra de elemento por
 * especificidade e desligaria o recurso calada.
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
      {/* A mesma estrela que marca a linha escolhida na lista, parada no
          controle fechado.

          Ela só existir com a lista aberta fazia a marca ler como efeito do
          clique: aparecia, e ia embora junto com o popup. Parada aqui ela diz
          uma coisa que vale o tempo todo — este eixo tem um valor, e é este —
          e a lista passa a confirmar um glifo que a pessoa já conhece em vez
          de apresentar um novo no momento da escolha.

          Texto e não SVG de propósito: é literalmente o mesmo caractere na
          mesma família e no mesmo tamanho que `option::checkmark` usa, então
          as duas marcas não podem divergir de forma. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-2.5 text-[0.6875rem] leading-none text-emerald"
      >
        ✦
      </span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onValueChange(event.target.value as T)}
        className="select-native h-8 cursor-pointer rounded-full bg-transparent py-0 pl-7 pr-7 text-sm font-medium text-ash transition-colors hover:text-bone focus-visible:text-bone"
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
