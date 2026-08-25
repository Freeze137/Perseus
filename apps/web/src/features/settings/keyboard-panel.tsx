"use client";

import type { KeyboardLayout } from "@perseus/contracts";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { SPRING } from "@/lib/springs";
import { transitionFor } from "./performance-tiers";
import { useMotionLevel } from "./use-motion-level";
import {
  LAYOUTS,
  LAYOUT_OPTIONS,
  REACH_GROUPS,
  type KeyReach,
} from "./keyboard-layouts";

type Props = {
  layout: KeyboardLayout;
  onLayoutChange: (layout: KeyboardLayout) => void;
  /** How much of this run's bank the keyboard reaches. */
  share: { available: number; total: number };
  /** Offered when the keyboard is what is costing the typist sentences. */
  onUseEnglish: () => void;
};

/**
 * O seletor de teclado, desenhado como mapa de alcance em vez de dropdown.
 *
 * Um `<select>` e dois parágrafos era o mínimo honesto e lia como formulário: a
 * única coisa que a pessoa quer saber — o que este teclado custa aos meus dedos
 * — era prosa pra aceitar na confiança. Aqui os doze caracteres que importam
 * estão na tela, ordenados pelo que custam, e trocar o layout faz eles viajarem
 * entre os grupos.
 *
 * O movimento é o argumento. Troque de ABNT2 pra US e os quatro acentos caem
 * fisicamente em "Fora de alcance", que é o mesmo evento que encolhe o corpus
 * embaixo. Ninguém precisa ouvir duas vezes.
 *
 * ---
 *
 * **Nada aqui muda de tamanho, e é esse o truque inteiro.**
 *
 * A primeira versão animava os contêineres de grupo com `layout`. O Motion
 * implementa isso como transform de escala, que estica todo glifo lá dentro
 * pela duração da animação — as teclas e os rótulos visivelmente achatados a
 * caminho do novo tamanho. Também significava três contêineres refazendo layout
 * enquanto doze teclas tentavam voar entre eles.
 *
 * Então a estrutura é fixa: os três grupos sempre renderizam, um vazio diz que
 * está vazio em vez de sumir, e a fileira de teclas é uma linha em todo layout
 * (o grupo mais largo são oito caps ≈ 298px dentro de 432px de painel). A altura
 * do painel é portanto idêntica pros três teclados, nenhum contêiner muda de
 * tamanho, e as teclas ficam livres pra se mover só em transform — que é a única
 * coisa que anima barato e a única que não deforma letra.
 */
export function KeyboardPanel({
  layout,
  onLayoutChange,
  share,
  onUseEnglish,
}: Props) {
  const level = useMotionLevel();
  // A viagem por layout compartilhado é o único efeito daqui que mede o DOM. No
  // 'brief' as teclas continuam trocando de grupo, só param de voar até lá —
  // que é exatamente a troca que este nível existe pra fazer.
  const travels = level === "spring";
  const info = LAYOUTS[layout];
  const narrowed = share.available < share.total;

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="label mb-3">Teclado</legend>

      {/* Radios rather than buttons with aria-checked: the arrow-key roving
          within a group is the platform's job, and it gets it right. */}
      <div className="flex rounded-full bg-void/60 p-1">
        {LAYOUT_OPTIONS.map((option) => {
          const active = option.value === layout;
          return (
            <label
              key={option.value}
              className="relative flex-1 cursor-pointer select-none"
            >
              <input
                type="radio"
                name="keyboard-layout"
                className="peer sr-only"
                value={option.value}
                checked={active}
                onChange={() => onLayoutChange(option.value)}
              />
              {/* One pill, moved by shared layout rather than three pills
                  cross-fading — it is the same object sliding, and it should
                  travel like one. */}
              {active ? (
                <motion.span
                  aria-hidden="true"
                  layoutId={travels ? "keyboard-layout-pill" : undefined}
                  transition={transitionFor(level, SPRING.snap)}
                  className="absolute inset-0 rounded-full bg-slate"
                />
              ) : null}
              <span
                data-active={active}
                className="relative block rounded-full px-3 py-1.5 text-center text-sm font-medium text-ash transition-colors duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-emerald data-[active=true]:text-bone"
              >
                {option.short}
              </span>
            </label>
          );
        })}
      </div>

      {/* Two lines are reserved for this at every layout, so the copy changing
          length cannot move anything below it. `popLayout` takes the outgoing
          line out of flow: the default would stack both for a frame and double
          the height, and `mode="wait"` would hold the box empty for the length
          of the exit before the new line even started. */}
      <div className="min-h-[2.875rem]">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.p
            key={layout}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transitionFor(level, { duration: 0.12 })}
            className="text-sm leading-relaxed text-ash"
          >
            {info.tell}
          </motion.p>
        </AnimatePresence>
      </div>

      <div className="flex flex-col gap-3">
        {REACH_GROUPS.map((group) => {
          const keys = info.keys.filter((key) => key.reach === group.reach);
          return (
            <div key={group.reach} className="flex flex-col gap-1.5">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold text-bone">
                  {group.title}
                </span>
                <span className="text-xs text-ash">{group.note}</span>
              </div>
              {/* Fixed height whether or not there are keys in it: an empty
                  group that collapsed would move every group under it, and
                  "nenhuma" is information anyway — it is how ABNT2 says it
                  leaves nothing out of reach. */}
              <div className="flex h-8 flex-wrap items-center gap-1.5">
                {keys.length > 0 ? (
                  keys.map((key) => (
                    <motion.span
                      key={key.char}
                      // O caractere é a identidade, então a mesma tecla que era
                      // 'direct' num layout é o mesmo objeto quando cai em
                      // 'dead' no seguinte — e viaja até lá.
                      layoutId={travels ? `key-${key.char}` : undefined}
                      transition={transitionFor(level, SPRING.migrate)}
                      title={key.how}
                      data-reach={key.reach}
                      className={CAP[key.reach]}
                    >
                      {key.char}
                      <span className="sr-only"> — {key.how}</span>
                    </motion.span>
                  ))
                ) : (
                  <span className="text-sm text-ash">Nenhuma</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* The consequence, with the real count. Deliberately not a boxed alert:
          nothing has gone wrong, and a warning card would make a fact about
          hardware look like a failure the typist caused.

          Height is animated rather than transformed. It is a layout property
          and normally off limits, but the alternative here is the panel
          snapping taller in one frame — and unlike a scale, an animated height
          on a clipped box leaves the text inside it at its true size. */}
      <AnimatePresence initial={false}>
        {narrowed ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={transitionFor(level, { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] })}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2 border-t border-slate pt-3">
              <p className="text-sm leading-relaxed text-bone">
                Sem os acentos, o sorteio fica em{" "}
                <span className="font-mono font-semibold tabular-nums text-mint">
                  {share.available}
                </span>{" "}
                das {share.total} frases deste modo.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="quiet"
                  size="sm"
                  onClick={() => onLayoutChange("us-intl")}
                >
                  Ativar US Internacional
                </Button>
                <span aria-hidden="true" className="h-4 w-px bg-slate" />
                <Button variant="quiet" size="sm" onClick={onUseEnglish}>
                  Treinar em inglês
                </Button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </fieldset>
  );
}

/**
 * A rampa de brilho, que é a mesma ideia sobre a qual o mapa estelar do teclado
 * é construído: tecla que você alcança é estrela que você vê. Custo é desenhado
 * como luz, nunca como matiz — ferrugem é a cor de erro desta paleta, e tecla
 * que seu hardware não tem é fato, não erro.
 *
 * Todo estado é a mesma caixa no mesmo tamanho. Só a pintura muda, então tecla
 * chegando num grupo novo não tem o que redimensionar no caminho.
 */
const CAP: Record<KeyReach, string> = {
  direct:
    "grid h-8 w-8 shrink-0 place-items-center rounded-sm bg-slate font-mono text-sm text-bone",
  dead: "grid h-8 w-8 shrink-0 place-items-center rounded-sm border border-slate bg-slate/40 font-mono text-sm text-bone/80",
  none: "grid h-8 w-8 shrink-0 place-items-center rounded-sm border border-dashed border-slate font-mono text-sm text-ash line-through decoration-ash/60",
};
