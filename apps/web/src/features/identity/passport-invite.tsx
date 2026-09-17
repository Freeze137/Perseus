"use client";

import { TIERS, TIER_ORDER } from "@perseus/contracts";
import { BeaconButton } from "@/components/ui/beacon-button";
import { LiveLines } from "@/components/ui/live-lines";
import { useMotionLevel } from "@/features/settings/use-motion-level";
import type { PerformanceTier } from "@/features/settings/performance-tiers";
import { PatenteMark } from "./patente-mark";

type Props = {
  tier: PerformanceTier;
  onCreate: () => void;
};

/**
 * O convite, no lugar onde a posição apareceria se houvesse passaporte.
 *
 * Quem não tem passaporte terminava a corrida e não via uma palavra sobre
 * ranking ou patente — as duas coisas viviam atrás do ícone de configurações,
 * dentro de um painel que ninguém abre pra procurar algo que não sabe que
 * existe. O resultado é que a metade mais interessante do produto era invisível
 * exatamente pra quem ainda não tinha entrado nela.
 *
 * Ocupa a mesma caixa de vidro da posição de propósito: é o mesmo lugar da tela
 * respondendo a mesma pergunta — onde esta corrida me deixou —, e a resposta pra
 * quem não tem passaporte é que ela não deixou em lugar nenhum ainda.
 *
 * Os cinco emblemas estão acesos, e não apagados. Emblema escuro já quer dizer
 * uma coisa neste produto — patente dormente, sete dias sem corrida — e usá-lo
 * aqui pra dizer "você não tem" daria dois significados ao mesmo desenho. O que
 * diz que eles ainda não são seus é a frase, não a luz.
 */
export function PassportInvite({ tier, onCreate }: Props) {
  const still = useMotionLevel() === "none";

  return (
    <div
      className="standing-panel relative overflow-hidden rounded-md px-5 py-5"
      data-still={still}
      data-glass={tier !== "minimal"}
    >
      <LiveLines still={still} />

      <div className="relative z-10 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="label">Esta corrida não entrou no ranking</p>
          <p className="display text-2xl text-bone">
            Com um passaporte, ela entraria.
          </p>
        </div>

        <ul className="flex flex-wrap items-center gap-3">
          {TIER_ORDER.map((id) => (
            <li key={id} className="flex items-center gap-2">
              <PatenteMark tier={id} size={30} state="earned" />
              <span className="font-mono text-xs text-ash">{TIERS[id].star}</span>
            </li>
          ))}
        </ul>

        <p className="max-w-prose text-sm leading-relaxed text-ash">
          As cinco patentes são estrelas de Perseu, da mais fria à mais quente.
          A sua nasce na quinta corrida válida de cada família e é a média das
          cinco mais recentes, com o texto curto pesando menos — ela mede o que
          você digita, e não o seu melhor dia. Com passaporte, cada corrida
          passa a ter uma posição também.
        </p>

        <div className="flex flex-wrap items-center gap-4">
          <BeaconButton onClick={onCreate}>Criar passaporte</BeaconButton>
          {/* Dito ao lado do botão e não dentro dele: o passaporte é um apelido
              e seis palavras, sem e-mail e sem conta, e essa é a objeção que
              faz alguém não clicar. */}
          <p className="max-w-[22rem] text-xs leading-relaxed text-ash">
            Um apelido e seis palavras pra guardar. Sem e-mail, sem senha, sem
            conta. Já tem um código? Ele entra na mesma janela.
          </p>
        </div>
      </div>
    </div>
  );
}
