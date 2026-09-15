"use client";

import { ALGOL_PERIOD_DAYS, TIERS, type TierId } from "@perseus/contracts";
import { useId } from "react";
import { useMotionLevel } from "@/features/settings/use-motion-level";

/**
 * A geometria de cada patente.
 *
 * Um corpo estelar visto sempre pelo mesmo instrumento: disco, halo, cruz de
 * difração e arco de posição idênticos em construção. O que muda de degrau para
 * degrau é a temperatura da cor e a energia da luz — frio é um disco grande e
 * mole com halo curto e cruz mínima; quente é um ponto pequeno e duro com halo
 * amplo e cruz atravessando o quadrado.
 *
 * As cores são as das estrelas reais, pela classe espectral, e a ordem é a de
 * temperatura (OBAFGKM) e não a de brilho: as magnitudes aparentes de Perseu
 * não acompanham a cor, então uma escada por magnitude daria cinco emblemas sem
 * progressão nenhuma para o olho.
 *
 * `arc` é o canal que não é cor, e por isso ele existe. Na lista do ranking o
 * emblema aparece sozinho ao lado de um nome, sem o nome da patente escrito em
 * lugar nenhum — quem não distingue vermelho de laranja perderia a escada
 * inteira se a cor fosse o único sinal. Cinco traços separados somem em 28px
 * (o vão entre eles fica abaixo de um pixel), então a posição é o *comprimento*
 * de um arco único que começa sempre no mesmo ponto.
 */
type Look = {
  /** O núcleo, e a cor que o halo e o arco herdam. */
  readonly core: string;
  readonly glow: string;
  /** Raio do halo e sua opacidade no centro. */
  readonly haloR: number;
  readonly haloAlpha: number;
  /** O brilho intermediário entre núcleo e halo. */
  readonly bloomR: number;
  readonly coreR: number;
  /** Meio-comprimento e meia-espessura da cruz de difração. */
  readonly spikeReach: number;
  readonly spikeWidth: number;
  readonly spikeAlpha: number;
  /** O arco preenchido: um quinto, dois quintos, até a volta inteira. */
  readonly arc: string;
};

/** O trilho completo, atrás do arco de todos os degraus. */
const ARC_TRACK = "M 12.09 52.65 A 38 38 0 0 0 78.68 74.93";

const LOOK: Record<TierId, Look> = {
  gorgonea: {
    core: "#f4b9a6",
    glow: "#c8503f",
    haloR: 36,
    haloAlpha: 0.391,
    bloomR: 26,
    coreR: 10,
    spikeReach: 16,
    spikeWidth: 2.6,
    spikeAlpha: 0.4,
    arc: "M 12.09 52.65 A 38 38 0 0 0 17.43 69.57",
  },
  miram: {
    core: "#f7d3a4",
    glow: "#d98b45",
    haloR: 39,
    haloAlpha: 0.425,
    bloomR: 22.88,
    coreR: 8.8,
    spikeReach: 26,
    spikeWidth: 2.3,
    spikeAlpha: 0.52,
    arc: "M 12.09 52.65 A 38 38 0 0 0 29.86 82.23",
  },
  mirfak: {
    core: "#fdf6e0",
    glow: "#e8d7a4",
    haloR: 42,
    haloAlpha: 0.459,
    bloomR: 19.76,
    coreR: 7.6,
    spikeReach: 34,
    spikeWidth: 2,
    spikeAlpha: 0.66,
    arc: "M 12.09 52.65 A 38 38 0 0 0 46.69 87.85",
  },
  algol: {
    core: "#ffffff",
    glow: "#cfe3f5",
    haloR: 45,
    haloAlpha: 0.493,
    bloomR: 18.2,
    coreR: 7,
    spikeReach: 40,
    spikeWidth: 1.8,
    spikeAlpha: 0.82,
    arc: "M 12.09 52.65 A 38 38 0 0 0 64.24 85.23",
  },
  atik: {
    core: "#ffffff",
    glow: "#8fb4ee",
    haloR: 48,
    haloAlpha: 0.527,
    bloomR: 16.12,
    coreR: 6.2,
    spikeReach: 46,
    spikeWidth: 1.6,
    spikeAlpha: 0.95,
    arc: ARC_TRACK,
  },
};

/**
 * A queda do halo, em duas paradas intermediárias.
 *
 * Proporcionais ao pico em vez de escritas uma a uma: a curva é a mesma nos
 * cinco, e três números soltos por degrau seriam quinze chances de um deles
 * divergir sem ninguém notar. O último ponto é alfa zero antes da borda — é o
 * que impede o halo de virar uma placa cinza contra o preto puro da página.
 */
const HALO_FALLOFF = [0.353, 0.105] as const;

/**
 * Os dois estados em que uma patente é desenhada.
 *
 * Não existe estado "bloqueada", e a ausência é deliberada. A vitrine mostra a
 * escada inteira acesa, porque o que se vai lá ver é para onde ela leva — um
 * emblema apagado por não ter sido alcançado esconderia exatamente a
 * informação que motivou a abrir a tela. O que diz se a patente é sua está
 * escrito ao lado dela, onde não há como confundir com falta de luz.
 *
 * Sobrou um único significado para o escuro, e é isso que o torna legível: na
 * lista do ranking, emblema apagado quer dizer patente dormente — sete dias sem
 * corrida. Nada foi perdido; a medida é que envelheceu.
 */
export type MarkState = "earned" | "dormant";

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
 * grande demais para o primeiro. Desenhado em componente e não importado como
 * arquivo porque os dois estados saem do mesmo desenho — apagar um PNG seria um
 * filtro de opacidade por cima, e o que se quer é a luz baixando enquanto a
 * silhueta fica.
 *
 * O halo usa `radialGradient` e nunca `feGaussianBlur`. Dez destes aparecem ao
 * mesmo tempo dentro da vitrine, com transformação 3D por cima, e dez filtros
 * de desfoque compondo a cada quadro é caro exatamente na máquina para a qual o
 * nível de desempenho mais baixo existe.
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
  const dim = state === "dormant";

  // Algol some por horas a cada 2,87 dias porque a companheira passa na frente
  // dela. O pulso fica só no halo: a oclusão já está desenhada na silhueta, e
  // animar o emblema inteiro faria a estrela escurecer duas vezes pelo mesmo
  // motivo — e a segunda vez seria indistinguível do estado dormente.
  const eclipses = tier === "algol" && !dim && motion !== "none";
  /**
   * Um conjunto de gradientes por instância, e não por patente.
   *
   * Os `id` precisam ser únicos no documento inteiro, não dentro deste SVG: a
   * vitrine desenha dez emblemas ao mesmo tempo e as duas famílias repetem os
   * mesmos cinco degraus, então um id derivado só do degrau apareceria duas
   * vezes. `url(#id)` resolve para a primeira definição, e no instante em que
   * ela sai do DOM — trocar de aba, fechar o painel — todo mundo que apontava
   * para ela fica sem preenchimento nenhum. O sintoma é exato: some tudo que é
   * gradiente e sobra o arco, que é traço de cor chapada.
   */
  const uid = useId();
  const id = `pat-${tier}-${uid}`;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={`${info.star}, ${info.designation}`}
      className={className}
    >
      <defs>
        <radialGradient id={`${id}-halo`}>
          <stop offset="0%" stopColor={look.glow} stopOpacity={look.haloAlpha} />
          <stop
            offset="22%"
            stopColor={look.glow}
            stopOpacity={look.haloAlpha * HALO_FALLOFF[0]}
          />
          <stop
            offset="52%"
            stopColor={look.glow}
            stopOpacity={look.haloAlpha * HALO_FALLOFF[1]}
          />
          <stop offset="100%" stopColor={look.glow} stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`${id}-bloom`}>
          <stop offset="0%" stopColor={look.core} stopOpacity={0.85} />
          <stop offset="40%" stopColor={look.glow} stopOpacity={0.45} />
          <stop offset="100%" stopColor={look.glow} stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`${id}-core`}>
          <stop offset="0%" stopColor={look.core} />
          <stop offset="58%" stopColor={look.core} />
          <stop offset="100%" stopColor={look.glow} />
        </radialGradient>
        <linearGradient id={`${id}-spikeH`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={look.glow} stopOpacity={0} />
          <stop offset="50%" stopColor={look.core} stopOpacity={look.spikeAlpha} />
          <stop offset="100%" stopColor={look.glow} stopOpacity={0} />
        </linearGradient>
        <linearGradient id={`${id}-spikeV`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={look.glow} stopOpacity={0} />
          <stop offset="50%" stopColor={look.core} stopOpacity={look.spikeAlpha} />
          <stop offset="100%" stopColor={look.glow} stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* A luz. Baixa no estado dormente, e a silhueta fica igual — é ela que
          diz qual patente é, não o brilho. */}
      <g opacity={dim ? 0.28 : 1}>
          <circle
            cx="50"
            cy="50"
            r={look.haloR}
            fill={`url(#${id}-halo)`}
            style={
              eclipses
                ? {
                    animation: `algol ${ALGOL_PERIOD_DAYS * 8}s ease-in-out infinite`,
                  }
                : undefined
            }
          />
          <circle cx="50" cy="50" r={look.bloomR} fill={`url(#${id}-bloom)`} />
          <polygon
            points={`${50 - look.spikeReach},50 50,${50 - look.spikeWidth} ${50 + look.spikeReach},50 50,${50 + look.spikeWidth}`}
            fill={`url(#${id}-spikeH)`}
          />
          <polygon
            points={`50,${50 - look.spikeReach} ${50 + look.spikeWidth},50 50,${50 + look.spikeReach} ${50 - look.spikeWidth},50`}
            fill={`url(#${id}-spikeV)`}
          />
          <circle cx="50" cy="50" r={look.coreR} fill={`url(#${id}-core)`} />

        {tier === "algol" ? <Companion glow={look.glow} /> : null}
      </g>

      {/* O arco de posição, por último e fora do grupo da luz: é o canal que
          não é cor, e sobrevive ao emblema apagado — que é o estado em que a
          cor também fica difícil de ler. */}
      <path
        d={ARC_TRACK}
        fill="none"
        stroke={look.glow}
        strokeOpacity={0.13}
        strokeWidth="2.8"
      />
      <path
        d={look.arc}
        fill="none"
        stroke={look.glow}
        strokeOpacity={dim ? 0.4 : 0.92}
        strokeWidth="2.8"
      />
    </svg>
  );
}

/**
 * A companheira de Algol.
 *
 * Algol é binária eclipsante: a companheira passa na frente e a primária perde
 * mais de um terço do brilho por algumas horas, a cada 2,87 dias. É por isso
 * que os árabes a chamaram de estrela demônio.
 *
 * É um corpo, não uma falta — disco opaco com limbo próprio e a borda iluminada
 * pela primária. A distinção importa porque a interface já usa escurecimento
 * como significado: emblema apagado quer dizer patente dormente. O que muda
 * aqui é a silhueta, que vira dupla, e o estado dormente nunca produz essa
 * forma.
 */
function Companion({ glow }: { glow: string }) {
  return (
    <>
      <circle cx="54.2" cy="45.8" r="4.8" fill="#000000" />
      <circle
        cx="54.2"
        cy="45.8"
        r="4.8"
        fill="none"
        stroke={glow}
        strokeOpacity={0.8}
        strokeWidth="0.8"
      />
    </>
  );
}

/** O nome da patente, para legenda de qualquer tamanho. */
export function patenteLabel(tier: TierId): string {
  return TIERS[tier].star;
}
