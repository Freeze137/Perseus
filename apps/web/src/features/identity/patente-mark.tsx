"use client";

import { ALGOL_PERIOD_DAYS, TIERS, type TierId } from "@perseus/contracts";
import { useMotionLevel } from "@/features/settings/use-motion-level";

/**
 * Como cada patente é desenhada.
 *
 * As cores são as das estrelas de verdade, pela classe espectral: M4 é
 * vermelha, K3 laranja, F5 branco-amarelada, B8 branco-azulada, B1 azul. É essa
 * sequência — a OBAFGKM, a escada de temperatura — que dá ao conjunto uma
 * progressão que o olho lê sem legenda, e é também por que a escada não é de
 * magnitude: as magnitudes aparentes de Perseu não acompanham a cor.
 *
 * `halo` cresce com a temperatura porque estrela quente é mais luminosa, e é o
 * único lugar em que o emblema exagera: numa tela de preto verdadeiro, o halo é
 * o que separa cinco discos pequenos uns dos outros a dois metros de distância.
 */
const LOOK: Record<
  TierId,
  { core: string; glow: string; halo: number; spike: number }
> = {
  gorgonea: { core: "#f4b9a6", glow: "#c8503f", halo: 0.62, spike: 0.9 },
  miram: { core: "#f7d3a4", glow: "#d98b45", halo: 0.72, spike: 1.05 },
  mirfak: { core: "#fdf6e0", glow: "#e8d7a4", halo: 0.86, spike: 1.25 },
  algol: { core: "#ffffff", glow: "#cfe3f5", halo: 0.96, spike: 1.45 },
  atik: { core: "#ffffff", glow: "#8fb4ee", halo: 1.08, spike: 1.7 },
};

export type MarkState =
  /** Conquistada e recente. A estrela acesa. */
  | "earned"
  /** Conquistada e velha: sete dias sem corrida. Mesma forma, sem luz. */
  | "dormant"
  /** Ainda não alcançada. O contorno de onde ela vai estar. */
  | "locked";

type Props = {
  tier: TierId;
  size?: number;
  state?: MarkState;
  className?: string;
};

/**
 * Uma patente, desenhada.
 *
 * SVG e não imagem: o emblema precisa existir em 28 pixels ao lado de um nome
 * no ranking e em 240 dentro da vitrine, e um PNG que sirva aos dois é um PNG
 * grande demais pro primeiro. Também é o mesmo objeto que a carta estelar do
 * teclado vai querer quando existir — um disco espectral com brilho variável é
 * exatamente o que aquela tela promete desenhar por tecla.
 *
 * Três estados, e a diferença entre dois deles carrega uma regra do produto:
 * `locked` é "ainda não deu pra medir" e `dormant` é "a medida envelheceu".
 * Nada foi perdido num nem no outro, e a forma é a mesma nos três — o que muda
 * é a luz.
 */
export function PatenteMark({
  tier,
  size = 64,
  state = "earned",
  className,
}: Props) {
  const motion = useMotionLevel();
  const look = LOOK[tier];
  const info = TIERS[tier];
  const lit = state === "earned";

  // Algol some por horas a cada 2,87 dias porque a companheira passa na frente
  // dela. O emblema pisca nesse período real, e não num ritmo escolhido a dedo
  // — é a única animação do conjunto, e ela existe porque a estrela é real.
  const eclipses = tier === "algol" && lit && motion !== "none";
  const id = `patente-${tier}-${state}`;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={`${info.star}, ${info.designation}`}
      className={className}
      style={eclipses ? { animation: `algol ${ALGOL_PERIOD_DAYS * 8}s ease-in-out infinite` } : undefined}
    >
      <defs>
        <radialGradient id={`${id}-core`}>
          <stop offset="0%" stopColor={look.core} />
          <stop offset="45%" stopColor={look.glow} />
          <stop offset="100%" stopColor={look.glow} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* A órbita. Fecha a composição num círculo e dá ao emblema uma borda
          própria, que é o que faz cinco deles lado a lado lerem como um
          conjunto em vez de cinco manchas. */}
      <circle
        cx="50"
        cy="50"
        r="44"
        fill="none"
        stroke={lit ? look.glow : "var(--color-slate)"}
        strokeOpacity={lit ? 0.45 : 1}
        strokeWidth="1"
      />

      {state === "locked" ? (
        // Nada aceso: o contorno de onde a estrela vai estar, e o ponto que
        // marca o lugar. Uma vitrine que escondesse o que falta esconderia
        // justamente o que se abre a vitrine pra ver.
        <circle cx="50" cy="50" r="4" fill="var(--color-slate)" />
      ) : (
        <>
          {/* O halo, primeiro, pra tudo o mais cair por cima dele. */}
          <circle
            cx="50"
            cy="50"
            r={34 * look.halo}
            fill={`url(#${id}-core)`}
            opacity={lit ? 0.9 : 0.18}
          />

          {/* As quatro hastes de difração. Quatro porque é o que uma aranha de
              telescópio faz com a luz de uma estrela — não é enfeite, é o
              motivo pelo qual estrelas em fotografia têm pontas. */}
          <g
            stroke={lit ? look.core : "var(--color-ash)"}
            strokeOpacity={lit ? 0.75 : 0.35}
            strokeWidth="1"
            strokeLinecap="round"
          >
            <line x1={50 - 30 * look.spike} y1="50" x2={50 + 30 * look.spike} y2="50" />
            <line x1="50" y1={50 - 30 * look.spike} x2="50" y2={50 + 30 * look.spike} />
          </g>

          <circle
            cx="50"
            cy="50"
            r={7}
            fill={lit ? look.core : "var(--color-ash)"}
            opacity={lit ? 1 : 0.5}
          />
        </>
      )}
    </svg>
  );
}

/** O nome da patente e a estrela por trás dele, pra legenda de qualquer tamanho. */
export function patenteLabel(tier: TierId): string {
  return TIERS[tier].star;
}
