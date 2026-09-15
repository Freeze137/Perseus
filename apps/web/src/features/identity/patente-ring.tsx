"use client";

import {
  familyOf,
  TIERS,
  TIER_ORDER,
  type Patente,
  type RankFamily,
  type TierId,
} from "@perseus/contracts";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useMotionLevel } from "@/features/settings/use-motion-level";
import { useSettings } from "@/features/settings/use-settings";
import { PatenteMark, type MarkState } from "./patente-mark";

/** Uma face do anel: uma patente numa família. */
type Face = { tier: TierId; family: RankFamily };

/**
 * As dez faces, em dois arcos contíguos.
 *
 * Prosa inteira e depois código inteiro, nunca intercalados. O anel gira, e um
 * anel que alternasse as famílias trocaria de rótulo a cada face — o nome da
 * metade que está de frente piscaria o tempo todo, e é exatamente a confusão
 * que o rótulo existe pra evitar. Em dois arcos ele muda uma vez por meia volta.
 */
const FACES: readonly Face[] = [
  ...TIER_ORDER.map((tier) => ({ tier, family: "prose" as const })),
  ...TIER_ORDER.map((tier) => ({ tier, family: "code" as const })),
];

const STEP = 360 / FACES.length;
/** Raio do anel, em pixels. Sai do tamanho da face e de quantas são. */
const RADIUS = Math.round(150 / Math.tan(Math.PI / FACES.length));
/** Graus por segundo no ocioso. Devagar o bastante pra não pedir atenção. */
const IDLE_SPEED = 6;
/** Quanto tempo o anel fica parado depois de um toque antes de voltar a girar. */
const SETTLE_MS = 2_000;
/** Onde a preferência de girar fica guardada. */
const SPIN_KEY = "perseus:patente-spin";

/**
 * A preferência de girar, como fonte externa em vez de estado do React.
 *
 * O `localStorage` é um sistema de fora, e lê-lo dentro de um efeito pra então
 * escrever estado produz um render a mais em toda montagem. `useSyncExternalStore`
 * é o que existe pra exatamente esta forma — e o instantâneo do servidor é
 * `false`, que é o padrão e é o que o HTML entregue já diz.
 */
const spinStore = {
  listeners: new Set<() => void>(),
  subscribe(listener: () => void) {
    spinStore.listeners.add(listener);
    return () => {
      spinStore.listeners.delete(listener);
    };
  },
  read(): boolean {
    try {
      return window.localStorage.getItem(SPIN_KEY) === "on";
    } catch {
      // Armazenamento bloqueado é um navegador com as configurações de alguém
      // dentro, não uma falha. O padrão já é o certo.
      return false;
    }
  },
  write(value: boolean): void {
    try {
      window.localStorage.setItem(SPIN_KEY, value ? "on" : "off");
    } catch {
      // A escolha continua valendo nesta sessão.
    }
    for (const listener of spinStore.listeners) listener();
  },
};

type Props = {
  /** As patentes de quem está olhando. Vazio pra quem ainda não tem nenhuma. */
  patentes: readonly Patente[];
};

/**
 * A vitrine das patentes.
 *
 * Dez faces num anel, que é CSS 3D e não WebGL de propósito: são placas chatas
 * giradas em torno de um eixo, que é o caso em que `preserve-3d` faz tudo o que
 * um renderizador faria sem abrir contexto, sem carregar biblioteca e sem nada
 * pra descartar depois. O three.js do projeto continua onde está, na marca.
 *
 * O que a vitrine mostra é a escada inteira, inclusive o que falta. Uma vitrine
 * que escondesse as patentes não alcançadas esconderia a informação pela qual
 * alguém a abre — quanto falta, e para onde.
 *
 * **O movimento é ramificado em três**, e nenhum ramo tira a transição:
 *
 *   - Movimento normal: o anel gira devagar sozinho, arrasta com inércia e
 *     encaixa a face clicada na frente.
 *   - Movimento reduzido: o anel não gira. Trocar de patente atravessa por
 *     opacidade, que o próprio `performance-tiers` chama de não-movimento —
 *     e continua sendo uma transição, não um corte.
 *   - Desempenho mínimo: uma grade chapada, sem anel. Esse nível prometeu "sem
 *     canvas e sem movimento" por escrito, e promessa de desempenho que só vale
 *     nas telas fáceis não vale.
 *
 * O laço de animação só existe enquanto há movimento acontecendo, e morre com o
 * componente. Nada pode ficar respirando atrás de um painel enquanto a próxima
 * tecla é digitada.
 */
export function PatenteRing({ patentes }: Props) {
  const motion = useMotionLevel();
  const tier = useSettings((state) => state.performance);
  const spin = useSyncExternalStore(
    spinStore.subscribe,
    spinStore.read,
    () => false,
  );
  const [index, setIndex] = useState(0);

  const reduced = motion === "none";
  const flat = tier === "minimal";
  const spinning = !reduced || spin;

  const held = new Map(patentes.map((p) => [p.family, p]));

  /**
   * Toda face acende, tenha você a patente ou não.
   *
   * A vitrine é a escada, não o seu inventário: quem a abre está perguntando
   * para onde ela leva, e emblema apagado por não ter sido alcançado esconde
   * exatamente essa resposta. O escuro teria ainda um segundo problema — ele já
   * quer dizer outra coisa na lista do ranking, onde emblema apagado é patente
   * dormente, e o mesmo pixel com dois significados não é um sinal.
   *
   * Quem diz o que é seu é a legenda, embaixo do emblema, onde não há como
   * confundir com falta de luz.
   */
  const stateOf = (face: Face): MarkState => {
    const mine = held.get(face.family);
    if (!mine || mine.tier !== face.tier) return "earned";
    return mine.dormant ? "dormant" : "earned";
  };

  /** Se esta face é a patente que a pessoa tem agora naquela família. */
  const isMine = (face: Face): boolean =>
    held.get(face.family)?.tier === face.tier;

  const current = FACES[index]!;

  if (flat) {
    return (
      <Grid
        faces={FACES}
        stateOf={stateOf}
        isMine={isMine}
        selected={index}
        onSelect={setIndex}
      />
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {reduced && !spin ? (
        <Stack
          faces={FACES}
          stateOf={stateOf}
          isMine={isMine}
          index={index}
          onSelect={setIndex}
        />
      ) : (
        <Ring
          faces={FACES}
          stateOf={stateOf}
          isMine={isMine}
          index={index}
          onSelect={setIndex}
          spinning={spinning}
        />
      )}

      {/* O rótulo da metade que está de frente. É ele que impede alguém de ler
          uma patente de código como se fosse de prosa. */}
      <p className="flex flex-col items-center gap-1 text-center">
        <span className="display text-xl text-bone">
          {TIERS[current.tier].star}
        </span>
        <span className="font-mono text-xs uppercase tracking-wider text-ash">
          {current.family === "code" ? "código" : "prosa"} ·{" "}
          {TIERS[current.tier].from[current.family]} ppm
        </span>
        <span className="font-mono text-xs text-slate">
          {TIERS[current.tier].designation} · {TIERS[current.tier].spectral}
        </span>
      </p>

      {reduced ? (
        <button
          type="button"
          onClick={() => spinStore.write(!spin)}
          className="text-xs text-ash underline decoration-slate underline-offset-4 hover:text-bone"
        >
          {spin ? "Parar de girar as patentes" : "Girar as patentes"}
        </button>
      ) : null}
    </div>
  );
}

/**
 * O anel.
 *
 * Um `requestAnimationFrame` que só roda quando há algo pra mover: giro ocioso,
 * inércia de um arrasto, ou o encaixe de uma face clicada. Parado, não há laço.
 */
function Ring({
  faces,
  stateOf,
  isMine,
  index,
  onSelect,
  spinning,
}: {
  faces: readonly Face[];
  stateOf: (face: Face) => MarkState;
  isMine: (face: Face) => boolean;
  index: number;
  onSelect: (index: number) => void;
  spinning: boolean;
}) {
  const ring = useRef<HTMLDivElement>(null);
  const angle = useRef(0);
  const velocity = useRef(0);
  const target = useRef<number | null>(null);
  const idleAt = useRef(0);
  const frame = useRef(0);
  const drag = useRef<{ active: boolean; x: number }>({ active: false, x: 0 });

  /** Qual face está de frente, dado o ângulo. */
  const facing = useCallback(
    (deg: number) => {
      const slot = Math.round(-deg / STEP) % faces.length;
      return (slot + faces.length) % faces.length;
    },
    [faces.length],
  );

  const apply = useCallback(() => {
    const node = ring.current;
    if (!node) return;
    node.style.transform = `translateZ(${-RADIUS}px) rotateY(${angle.current}deg)`;
  }, []);

  useEffect(() => {
    let last = performance.now();
    let seen = -1;

    const draw = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      if (!drag.current.active) {
        if (target.current !== null) {
          // Encaixe: um passo proporcional à distância que falta, que chega
          // rápido e desacelera sozinho sem precisar de curva escrita à mão.
          const delta = target.current - angle.current;
          if (Math.abs(delta) < 0.1) {
            angle.current = target.current;
            target.current = null;
          } else {
            angle.current += delta * Math.min(dt * 9, 1);
          }
        } else if (Math.abs(velocity.current) > 1) {
          angle.current += velocity.current * dt;
          velocity.current *= 0.94;
        } else if (spinning && now >= idleAt.current) {
          angle.current += IDLE_SPEED * dt;
        }
      }

      apply();
      const front = facing(angle.current);
      if (front !== seen) {
        seen = front;
        onSelect(front);
      }
      frame.current = requestAnimationFrame(draw);
    };

    frame.current = requestAnimationFrame(draw);
    // Morre com o componente, que morre com o painel. Um anel girando atrás de
    // uma gaveta fechada é quadro gasto no caminho da próxima tecla.
    return () => cancelAnimationFrame(frame.current);
  }, [apply, facing, onSelect, spinning]);

  const select = useCallback((slot: number) => {
    target.current = -slot * STEP;
    velocity.current = 0;
    idleAt.current = performance.now() + SETTLE_MS;
  }, []);

  return (
    <div
      className="flex h-[320px] w-full items-center justify-center overflow-hidden"
      style={{ perspective: "1800px", touchAction: "none" }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { active: true, x: event.clientX };
        velocity.current = 0;
        target.current = null;
      }}
      onPointerMove={(event) => {
        if (!drag.current.active) return;
        const dx = event.clientX - drag.current.x;
        drag.current.x = event.clientX;
        angle.current += dx * 0.35;
        velocity.current = dx * 21;
      }}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture(event.pointerId);
        drag.current.active = false;
        idleAt.current = performance.now() + SETTLE_MS;
      }}
      onPointerCancel={() => {
        drag.current.active = false;
      }}
      onKeyDown={(event) => {
        // O anel inteiro responde às setas. Sem isto, a única forma de girar
        // seria arrastar — um controle que metade das pessoas não alcança.
        if (event.key === "ArrowRight") select((index + 1) % faces.length);
        if (event.key === "ArrowLeft")
          select((index - 1 + faces.length) % faces.length);
      }}
    >
      <div style={{ transformStyle: "preserve-3d", transform: "rotateX(-6deg)" }}>
        <div
          ref={ring}
          className="relative h-[180px] w-[180px]"
          style={{ transformStyle: "preserve-3d" }}
        >
          {faces.map((face, slot) => (
            <div
              key={`${face.family}-${face.tier}`}
              className="absolute inset-0"
              style={{
                transform: `rotateY(${slot * STEP}deg) translateZ(${RADIUS}px)`,
              }}
            >
              <FaceButton
                face={face}
                state={stateOf(face)}
                mine={isMine(face)}
                active={slot === index}
                onSelect={() => select(slot)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * A vitrine sem giro, pra quem pediu movimento reduzido.
 *
 * Uma face de cada vez, e a troca atravessa por opacidade em vez de cortar.
 * Mesmo volume, mesma luz, mesma escada — o que saiu foi a rotação, que é
 * exatamente o que a preferência do sistema pediu que saísse.
 */
function Stack({
  faces,
  stateOf,
  isMine,
  index,
  onSelect,
}: {
  faces: readonly Face[];
  stateOf: (face: Face) => MarkState;
  isMine: (face: Face) => boolean;
  index: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="flex items-center gap-6">
      <StepButton
        label="Patente anterior"
        glyph="‹"
        onClick={() => onSelect((index - 1 + faces.length) % faces.length)}
      />

      <div className="relative h-[180px] w-[180px]">
        {faces.map((face, slot) => (
          <div
            key={`${face.family}-${face.tier}`}
            aria-hidden={slot !== index}
            className="absolute inset-0 transition-opacity duration-300"
            style={{
              opacity: slot === index ? 1 : 0,
              pointerEvents: slot === index ? "auto" : "none",
            }}
          >
            <FaceButton
              face={face}
              state={stateOf(face)}
              mine={isMine(face)}
              active={slot === index}
              onSelect={() => onSelect(slot)}
            />
          </div>
        ))}
      </div>

      <StepButton
        label="Próxima patente"
        glyph="›"
        onClick={() => onSelect((index + 1) % faces.length)}
      />
    </div>
  );
}

/** Sem anel e sem transição: o nível que prometeu não gastar nada. */
function Grid({
  faces,
  stateOf,
  isMine,
  selected,
  onSelect,
}: {
  faces: readonly Face[];
  stateOf: (face: Face) => MarkState;
  isMine: (face: Face) => boolean;
  selected: number;
  onSelect: (index: number) => void;
}) {
  return (
    <ul className="grid grid-cols-5 gap-3">
      {faces.map((face, slot) => (
        <li key={`${face.family}-${face.tier}`}>
          <FaceButton
            face={face}
            state={stateOf(face)}
            mine={isMine(face)}
            active={slot === selected}
            onSelect={() => onSelect(slot)}
            compact
          />
        </li>
      ))}
    </ul>
  );
}

function FaceButton({
  face,
  state,
  mine,
  active,
  onSelect,
  compact = false,
}: {
  face: Face;
  state: MarkState;
  mine: boolean;
  active: boolean;
  onSelect: () => void;
  compact?: boolean;
}) {
  const info = TIERS[face.tier];
  const family = face.family === "code" ? "código" : "prosa";

  return (
    <button
      type="button"
      onClick={onSelect}
      data-active={active}
      data-mine={mine}
      className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-lg border border-slate bg-obsidian/70 p-3 transition-colors data-[active=true]:border-jade data-[mine=true]:border-emerald"
    >
      <PatenteMark tier={face.tier} size={compact ? 48 : 104} state={state} />
      <span className="flex flex-col items-center leading-tight">
        <span className="text-xs text-bone">{info.star}</span>
        {/* O que é seu está escrito, não aceso: duas patentes acesas lado a
            lado não diriam qual das duas é a sua, e esta linha diz. */}
        <span className="font-mono text-[10px] uppercase tracking-wider text-ash">
          {mine ? `sua · ${family}` : `${family} · ${info.from[face.family]} ppm`}
        </span>
      </span>
    </button>
  );
}

function StepButton({
  label,
  glyph,
  onClick,
}: {
  label: string;
  glyph: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="h-10 w-10 rounded-full border border-slate text-lg text-ash hover:text-bone"
    >
      <span aria-hidden="true">{glyph}</span>
    </button>
  );
}

/** Reexportado pra quem precisa classificar um modo sem reimplementar a regra. */
export { familyOf };
