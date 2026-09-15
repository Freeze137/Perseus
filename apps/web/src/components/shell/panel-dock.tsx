"use client";

import { LinkMark } from "@/components/shell/link-marks";
import { useSettings } from "@/features/settings/use-settings";
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
 * Embaixo da régua, os três lugares onde o autor está. Eles já viviam nos
 * créditos, atrás de duas aberturas — configurações, e então rolar até o pé
 * do painel. Não havia rodapé pra pôr um link, e a coluna é o rodapé que
 * faltava. A régua existe porque as duas metades não fazem a mesma coisa:
 * em cima, algo desta página abre; embaixo, você sai dela.
 *
 * O crédito do Tatoeba não vem junto e fica onde está, em prosa: CC-BY pede
 * atribuição legível, e um ícone que só diz o nome quando o ponteiro chega
 * não é atribuição — é uma pista.
 *
 * O rótulo continua no DOM com `opacity: 0`, e não `sr-only` nem
 * `visibility: hidden`: transparente ele ainda é o nome acessível do botão,
 * então a mesma marcação serve o olho e o leitor de tela.
 *
 * A cabeça abre e fecha o conjunto. Aberta por padrão e a escolha fica
 * guardada: atalho que nasce escondido cobra de todo mundo a descoberta dele,
 * e o que isto compra é a tela mais vazia possível pra quem pedir por ela.
 *
 * `aria-expanded` no botão e `inert` no corpo, então quem navega por teclado ou
 * leitor de tela recebe o mesmo estado que o olho recebe — e não tabula por
 * sete controles que não estão na tela.
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

  const open = useSettings((state) => state.dockOpen);
  const setOpen = useSettings((state) => state.setDockOpen);

  return (
    <nav
      aria-label="Painéis e links do autor"
      data-dimmed={dimmed}
      className="panel-dock fixed left-4 top-1/2 flex -translate-y-1/2 flex-col items-center gap-3 opacity-100 transition-opacity duration-300 data-[dimmed=true]:opacity-25 hover:opacity-100"
    >
      <button
        type="button"
        data-open={open}
        aria-expanded={open}
        aria-controls="panel-dock-body"
        onClick={() => setOpen(!open)}
        className="dock-key dock-head"
      >
        {/* Seta lateral, e não as três barras: elas foram pro seletor, onde a
            pessoa pediu por elas, e a mesma marca em dois lugares diferentes
            marcaria duas coisas diferentes. A seta aponta pra onde a coluna
            vai — pra fora quando está pra abrir, pra dentro quando está pra
            recolher. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 10 6"
          className="dock-head-arrow h-2 w-3 fill-none stroke-current stroke-[1.5]"
        >
          <path d="M1 1l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {/* Nome parado. Quem conta o estado é `aria-expanded`, e rótulo que
            troca de palavra faz o leitor de tela anunciar um controle novo
            onde só houve uma mudança de estado. */}
        <span className="dock-label">Painéis</span>
      </button>

      <div
        id="panel-dock-body"
        data-open={open}
        inert={!open}
        className="dock-body control-enter flex flex-col items-center gap-3"
      >
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <li key={entry.label}>
              <button
                type="button"
                onClick={entry.onSelect}
                className="dock-key"
              >
                <span aria-hidden="true" className="dock-glyph">
                  {entry.glyph}
                </span>
                <span className="dock-label">{entry.label}</span>
              </button>
            </li>
          ))}
        </ul>

        <span aria-hidden="true" className="dock-rule" />

        <ul className="flex flex-col gap-2">
          {PERSONAL_LINKS.map((link) => (
            <li key={link.id}>
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="dock-key dock-link"
              >
                <LinkMark id={link.id} />
                <span className="dock-label">{link.label}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
