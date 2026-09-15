"use client";

type Props = {
  onOpenRanking: () => void;
  onOpenDuel: () => void;
  onOpenStats: () => void;
  onOpenSettings: () => void;
  /** Recua durante a corrida, como tudo que não é o texto. */
  dimmed: boolean;
};

type Entry = {
  glyph: string;
  label: string;
  onSelect: () => void;
};

/**
 * A coluna que abre os painéis, encostada na borda esquerda.
 *
 * O que havia antes eram quatro controles espalhados pelo cabeçalho, dois de
 * cada lado do nome, e nenhuma pista de que os quatro faziam a mesma coisa:
 * trazer uma gaveta pra cima do texto. Juntos numa coluna eles passam a ler
 * como um conjunto, e o cabeçalho volta a ser só o nome.
 *
 * Cada tecla é um glifo parado; a palavra aparece no hover, deslizando pra
 * fora. O rótulo é absoluto de propósito — se ele ocupasse espaço na coluna,
 * a largura do dock mudaria no hover e as outras teclas andariam de lado.
 *
 * O rótulo continua no DOM com `opacity: 0`, e não `sr-only` nem
 * `visibility: hidden`: transparente ele ainda é o nome acessível do botão,
 * então a mesma marcação serve o olho e o leitor de tela.
 */
export function PanelDock({
  onOpenRanking,
  onOpenDuel,
  onOpenStats,
  onOpenSettings,
  dimmed,
}: Props) {
  const entries: readonly Entry[] = [
    { glyph: "◆", label: "Ranking", onSelect: onOpenRanking },
    // Colado no ranking porque são a mesma pergunta — como eu vou contra
    // outra pessoa — e uma delas acontece ao vivo.
    { glyph: "⚔", label: "Duelo", onSelect: onOpenDuel },
    { glyph: "◈", label: "Nesta sessão", onSelect: onOpenStats },
    { glyph: "⚙", label: "Configurações", onSelect: onOpenSettings },
  ];

  return (
    <nav
      aria-label="Painéis"
      data-dimmed={dimmed}
      className="fixed left-4 top-1/2 -translate-y-1/2 opacity-100 transition-opacity duration-300 data-[dimmed=true]:opacity-25 hover:opacity-100"
    >
      <ul className="flex flex-col gap-2">
        {entries.map((entry) => (
          <li key={entry.label}>
            <button type="button" onClick={entry.onSelect} className="dock-key">
              <span aria-hidden="true" className="dock-glyph">
                {entry.glyph}
              </span>
              <span className="dock-label">{entry.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
