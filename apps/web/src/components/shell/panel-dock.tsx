"use client";

import { LinkMark } from "@/components/shell/link-marks";
import { PERSONAL_LINKS } from "@/lib/links";

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
 * Embaixo, na placa acesa, os três lugares onde o autor está. Eles já viviam nos
 * créditos, atrás de duas aberturas — configurações, e então rolar até o pé
 * do painel. Não havia rodapé pra pôr um link, e a coluna é o rodapé que
 * faltava. As duas metades não fazem a mesma coisa — em cima algo desta
 * página abre, embaixo você sai dela — e é a placa que marca a diferença,
 * com o aro verde que só ela tem.
 *
 * O crédito do Tatoeba não vem junto e fica onde está, em prosa: CC-BY pede
 * atribuição legível, e um ícone que só diz o nome quando o ponteiro chega
 * não é atribuição — é uma pista.
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
      aria-label="Painéis e links do autor"
      data-dimmed={dimmed}
      className="panel-dock fixed left-4 top-1/2 flex -translate-y-1/2 flex-col items-center gap-3 opacity-100 transition-opacity duration-300 data-[dimmed=true]:opacity-25 hover:opacity-100"
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

      {/* Placa, e não mais três teclas soltas atrás de uma régua: o que diz
          que os três são um conjunto é a coisa que os segura. */}
      <ul className="dock-card">
        {PERSONAL_LINKS.map((link) => (
          <li key={link.id}>
            <a
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="dock-key"
            >
              <LinkMark id={link.id} />
              <span className="dock-label">{link.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
