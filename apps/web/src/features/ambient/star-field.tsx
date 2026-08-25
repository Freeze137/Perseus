'use client';

import { useEffect, useRef } from 'react';
import { onKeystroke } from '@/lib/keystroke-bus';
import { isOverlayOpen, onOverlayChange } from '@/lib/overlay-bus';
import type { FieldLevel } from '@/features/settings/performance-tiers';

type Kind = 'star' | 'quatrefoil' | 'dot';

type Shape = {
  x: number;
  y: number;
  /** Profundidade, de Z_FAR a Z_NEAR: manda no tamanho, velocidade, opacidade e giro. */
  z: number;
  angle: number;
  spin: number;
  vx: number;
  vy: number;
  size: number;
  kind: Kind;
  /**
   * A pintura da forma, montada uma vez no espalhamento. A opacidade vai pelo
   * globalAlpha e não pela cor, então o gradiente nunca precisa ser
   * reconstruído — ver a nota sobre CACHE DE PREENCHIMENTO abaixo.
   */
  fill: CanvasGradient;
  /** Cor da sombra do brilho permanente, pré-formatada pelo mesmo motivo. */
  glow: string;
  /** 0..1, um clareamento curto disparado por uma tecla certa. */
  flash: number;
  /** 0..1, um tremor curto disparado por uma tecla errada. */
  shake: number;
  /** Deslocamento de fase, pra duas formas tremendo juntas nunca tremerem em sincronia. */
  shakeSeed: number;
};

type Streak = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  alpha: number;
  colour: string;
  /** 1 enquanto viva, 0 quando aposentada. Risco de ambiente fica em 1 pra sempre. */
  life: number;
  /** Vida perdida por tick. Zero pros riscos de ambiente, que nunca aposentam. */
  decay: number;
};

/* Canais, não strings, porque toda forma treme o próprio matiz a partir destes
   — quatro cores literais repetidas em oitenta formas lê como padrão. */
const EMERALD = [29, 185, 129] as const;
const MINT = [125, 245, 196] as const;
const JADE = [15, 92, 74] as const;
const RUST = [226, 86, 74] as const;

const MINT_SOLID = rgb(MINT);
const RUST_SOLID = rgb(RUST);

/* ---- density ----
   One shape per this many square pixels, so a big screen is not left empty.
   The field is meant to read as a populated volume rather than a handful of
   drifting marks, which is why the clamp is generous and the breathing room
   is only about a shape's own width. */
const AREA_PER_SHAPE = 34_000;
const MIN_SHAPES = 24;
const MAX_SHAPES = 80;
/** Espaço livre que toda forma mantém em volta de si, além do próprio raio. */
const BREATHING_ROOM = 28;

/* ---- a camada rápida ----
   As formas lentas atravessam a tela em minutos, o que lê como imagem parada
   que você por acaso pega se mexendo. Uma segunda população, bem mais rápida,
   resolve isso sem encostar na primeira: são pequenas, fracas e somem em
   segundos, então registram como viagem pelo campo e não como mais objetos nele.

   Dividem um rumo só — o olho lê direção comum como movimento pelo espaço, e
   direções independentes como ruído. Também pulam o separate() inteiro: ser
   ultrapassado é o ponto todo, e colidir uma camada que existe pra cortar a
   outra cancelaria o efeito. */
const STREAK_SHARE = 0.4;
const STREAK_SPEED_MIN = 6;
const STREAK_SPEED_MAX = 14;
/** Pra cima e pra direita, uns 24° — fora do eixo o bastante pra não ler como varrida. */
const STREAK_HEADING = -0.42;
const STREAK_SPREAD = 0.22;
const STREAK_ALPHA_MIN = 0.05;
const STREAK_ALPHA_MAX = 0.15;
const STREAK_WIDTH_MIN = 1;
const STREAK_WIDTH_MAX = 3;
/**
 * O rastro é desenhado pra trás ao longo da velocidade por esta quantidade de
 * ticks, e não a partir da posição do frame anterior: assim o risco tem o mesmo
 * comprimento numa tela de 60Hz e numa de 144Hz, onde o passo real por frame
 * difere em 2,4x.
 */
const TRAIL_TICKS = 6;

/* ---- depth ----
   A wider z range than the shapes strictly need, because everything else here
   hangs off it: size, opacity, spin, softness and parallax. */
const Z_FAR = 0.12;
const Z_NEAR = 1.15;
/** A deriva escala com z nesta potência. Parallax linear é chapado demais pra ler. */
const PARALLAX_EXPONENT = 1.5;
/** Acima desta profundidade a forma ganha o preenchimento de dois tons, não o suave. */
const GRADIENT_Z = 0.7;
/** Acima desta profundidade ela também ganha brilho permanente, do tamanho do próprio raio. */
const GLOW_Z = 1.0;
const GLOW_SCALE = 0.4;

/* ---- reactions ----
   A correct keystroke throws a few sparks off the lit shape; a wrong one makes
   the shape flinch instead. Both are drawn from fixed pools and decay on their
   own, so a burst of typing allocates nothing. */
const BURST_MIN = 2;
const BURST_MAX = 4;
const BURST_POOL = 24;
const BURST_SPEED_MIN = 3;
const BURST_SPEED_MAX = 7;
const BURST_ALPHA = 0.35;
const BURST_DECAY = 0.05;
const SHAKE_DECAY = 0.035;
const SHAKE_AMPLITUDE = 3.5;
const SHAKE_FREQUENCY = 0.05;
const SHAKE_SHRINK = 0.22;

/** Quanto tempo depois da última tecla o campo volta à força total. */
const IDLE_MS = 1_400;

/**
 * O fundo de ambiente: estrelas de quatro pontas, quadrifólios e pontos
 * derivando pela viewport inteira, com uma camada mais rápida de riscos
 * cortando eles.
 *
 * É 3D no sentido que importa aqui — toda forma carrega uma profundidade que
 * define tamanho, opacidade, giro, suavidade e quão rápido a deriva a leva —
 * mas é desenhado num canvas 2D. WebGL custaria mais que o app inteiro pra um
 * efeito que vive atrás de texto, e o canvas nunca encosta no React: o loop é
 * dono dos próprios pixels e não re-renderiza nada.
 *
 * CACHE DE PREENCHIMENTO: a pintura de cada forma é montada uma vez, no
 * espalhamento, e a opacidade é aplicada pelo globalAlpha na hora de desenhar.
 * Formatar uma string `rgba(...)` ou montar um gradiente por forma por frame
 * alocaria milhares de objetos de vida curta por segundo pra cores que nunca
 * mudam.
 *
 * Montado no layout raiz, não numa página, pra pertencer ao produto e não a uma
 * tela só.
 */
/**
 * O que cada nível do campo custa pra máquina que o desenha.
 *
 * Os três botões são os três custos reais, na ordem em que doem. `blur` é o
 * `shadowBlur` do canvas, que na maioria dos motores é rasterizado na CPU e é
 * de longe a chamada mais cara deste canvas — o código já dizia isso num
 * comentário antes de existir jeito de desligar. `dpr` eleva ao quadrado: em 2
 * numa tela 1920x1080 o loop limpa e repinta 8,3 milhões de pixels por frame,
 * em 1 limpa 2,1 milhões. `shapes` é o meramente linear, e por isso é o último
 * a ser entregue.
 */
const BUDGETS = {
  rich: { maxDpr: 2, maxShapes: MAX_SHAPES, blur: true },
  plain: { maxDpr: 1, maxShapes: Math.round(MAX_SHAPES / 2), blur: false },
} as const satisfies Record<Exclude<FieldLevel, 'off'>, unknown>;

export function StarField({ level }: { level: Exclude<FieldLevel, 'off'> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const budget = BUDGETS[level];
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !context) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let shapes: Shape[] = [];
    let streaks: Streak[] = [];
    /* As faíscas são recicladas em rodízio: a quatro por tecla e vinte ticks de
       vida, o pool sobrevive a qualquer coisa que uma pessoa digite. */
    const bursts: Streak[] = Array.from({ length: BURST_POOL }, makeSpark);
    let burstCursor = 0;
    let width = 0;
    let height = 0;
    let frame = 0;
    let last = performance.now();
    let lastKeystroke = -Infinity;
    let strength = 1;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, budget.maxDpr);
      // A viewport em si, nunca uma caixa pai — este canvas é o fundo do
      // produto inteiro.
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = clamp(
        Math.round((width * height) / AREA_PER_SHAPE),
        Math.min(MIN_SHAPES, budget.maxShapes),
        budget.maxShapes,
      );
      shapes = scatter(context, count, width, height);
      // STREAK_SHARE é uma fatia de tudo que está na tela, não um múltiplo da
      // contagem de formas, então continua honesto quando o limite morde em
      // telas grandes.
      streaks = reduced
        ? []
        : Array.from({ length: Math.round((count * STREAK_SHARE) / (1 - STREAK_SHARE)) }, () =>
            makeStreak(width, height),
          );
    };

    const step = (now: number) => {
      // Por delta de tempo, pra deriva ler igual numa tela de 60Hz e numa de 144Hz.
      const delta = Math.min((now - last) / 16.667, 3);
      last = now;

      // Digitar puxa o campo pra trás; uma pausa o traz de volta. Fazer isso
      // aqui em vez de por prop mantém o React fora da animação inteira.
      const idle = now - lastKeystroke > IDLE_MS;
      const target = idle ? 1 : 0.35;
      strength += (target - strength) * 0.06 * delta;

      separate(shapes, delta);
      context.clearRect(0, 0, width, height);

      for (const shape of shapes) {
        advance(shape, delta, width, height);
        draw(context, shape, width, height, strength, now, budget.blur);
      }

      // Desenhada por último, pra camada rápida passar na frente da lenta.
      context.lineCap = 'round';
      for (const streak of streaks) {
        advanceStreak(streak, delta, width, height);
        drawStreak(context, streak, strength);
      }
      for (const spark of bursts) {
        if (spark.life <= 0) continue;
        advanceStreak(spark, delta, width, height);
        drawStreak(context, spark, strength);
      }

      context.globalAlpha = 1;
      frame = requestAnimationFrame(step);
    };

    // Com guarda, porque agora dois chamadores podem pedir o loop — a aba
    // ficando visível e a última camada fechando. Sem a flag o segundo agendaria
    // uma cadeia paralela de `requestAnimationFrame` e o campo rodaria calado no
    // dobro da velocidade pelo resto da sessão.
    let running = false;

    const start = () => {
      if (running) return;
      running = true;
      // Zera em vez de continuar: o delta desde o último frame é o tempo em que
      // o campo ficou coberto, e alimentar isso teleportaria toda forma pela
      // tela no primeiro frame de volta.
      last = performance.now();
      frame = requestAnimationFrame(step);
    };

    const stop = () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(frame);
    };

    /** O campo só roda quando está na tela e de fato visível. */
    const sync = () => {
      if (reduced) return;
      if (document.hidden || isOverlayOpen()) stop();
      else start();
    };

    const paintOnce = () => {
      context.clearRect(0, 0, width, height);
      for (const shape of shapes) draw(context, shape, width, height, 1, 0, budget.blur);
      context.globalAlpha = 1;
    };

    resize();

    if (reduced) {
      // Movimento reduzido mantém a composição e larga o movimento inteiro — o
      // que descarta os riscos, cujo conteúdo inteiro é movimento.
      paintOnce();
    } else {
      start();
    }

    const handleResize = () => {
      resize();
      if (reduced) paintOnce();
    };

    // Animação de fundo não tem por que queimar bateria numa aba escondida —
    // nem embaixo de um véu que não deixa ver através.
    const handleVisibility = sync;
    const unwatchOverlay = onOverlayChange(sync);

    // Toda tecla acende uma forma: o campo pertence à digitação, não a um
    // protetor de tela rodando ao lado. Acerto joga faísca, erro faz encolher —
    // os dois precisam ser distinguidos de relance, e duas cores do mesmo brilho
    // não bastavam.
    const unsubscribe = onKeystroke((keystroke) => {
      lastKeystroke = performance.now();
      if (reduced || shapes.length === 0) return;
      const shape = shapes[Math.floor(Math.random() * shapes.length)];
      if (!shape) return;

      if (keystroke.correct) {
        shape.flash = 1;
        shape.shake = 0;
        const count = BURST_MIN + Math.floor(Math.random() * (BURST_MAX - BURST_MIN + 1));
        for (let i = 0; i < count; i += 1) {
          const spark = bursts[burstCursor];
          burstCursor = (burstCursor + 1) % bursts.length;
          if (spark) igniteSpark(spark, shape.x, shape.y);
        }
      } else {
        shape.shake = 1;
        shape.flash = 0;
      }
    });

    window.addEventListener('resize', handleResize);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stop();
      unsubscribe();
      unwatchOverlay();
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
    // Reespalhado quando o nível muda: o orçamento decide a razão de pixel e a
    // contagem de formas, e os dois são lidos no setup, não por frame.
  }, [level]);

  return <canvas ref={canvasRef} aria-hidden="true" className="star-field" />;
}

function rgb(channels: readonly [number, number, number] | number[]): string {
  return `rgb(${channels[0]}, ${channels[1]}, ${channels[2]})`;
}

/** Empurra a cor pra fora do valor literal pra duas formas nunca dividirem o mesmo matiz. */
function jitter(channels: readonly [number, number, number]): [number, number, number] {
  return [
    clamp(Math.round(channels[0] * (0.92 + Math.random() * 0.16)), 0, 255),
    clamp(Math.round(channels[1] * (0.92 + Math.random() * 0.16)), 0, 255),
    clamp(Math.round(channels[2] * (0.92 + Math.random() * 0.16)), 0, 255),
  ];
}

/**
 * Põe as formas numa grade tremida em vez de em pontos aleatórios.
 *
 * Aleatoriedade pura empelota: um punhado de formas cai em cima das outras
 * enquanto regiões inteiras ficam vazias. Uma forma por célula, empurrada dentro
 * dela, espalha pela tela mantendo a colocação irregular.
 */
function scatter(
  context: CanvasRenderingContext2D,
  count: number,
  width: number,
  height: number,
): Shape[] {
  const columns = Math.max(1, Math.round(Math.sqrt((count * width) / height)));
  const rows = Math.max(1, Math.ceil(count / columns));
  const cellWidth = width / columns;
  const cellHeight = height / rows;
  const shapes: Shape[] = [];

  for (let index = 0; index < count; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    // Longe das bordas da célula pra vizinhas não acabarem se encostando.
    const x = (column + 0.25 + Math.random() * 0.5) * cellWidth;
    const y = (row + 0.25 + Math.random() * 0.5) * cellHeight;
    shapes.push(make(context, x, y));
  }
  // Formas distantes primeiro, pras próximas de fato passarem por cima.
  shapes.sort((a, b) => a.z - b.z);
  return shapes;
}

function make(context: CanvasRenderingContext2D, x: number, y: number): Shape {
  const z = Z_FAR + Math.random() * (Z_NEAR - Z_FAR);
  const kinds: Kind[] = ['star', 'star', 'quatrefoil', 'dot', 'dot'];
  const hues = [EMERALD, MINT, JADE, JADE];
  const hue = jitter(hues[Math.floor(Math.random() * hues.length)] ?? EMERALD);
  const size = (7 + Math.random() * 22) * z;
  // O parallax anda em z^1.5: forma próxima tem que visivelmente correr mais
  // que a distante, e queda linear nesta faixa de z não separa as camadas.
  const drift = Math.pow(z, PARALLAX_EXPONENT);

  return {
    x,
    y,
    z,
    angle: Math.random() * Math.PI * 2,
    // Forma distante gira mais devagar, e é isso que vende a profundidade.
    spin: (Math.random() - 0.5) * 0.006 * z,
    vx: (Math.random() - 0.5) * 0.4 * drift,
    vy: (Math.random() - 0.5) * 0.3 * drift,
    size,
    kind: kinds[Math.floor(Math.random() * kinds.length)] ?? 'star',
    fill: buildFill(context, z, size, hue),
    glow: rgb(hue),
    flash: 0,
    shake: 0,
    shakeSeed: Math.random() * Math.PI * 2,
  };
}

/**
 * Forma próxima ganha preenchimento de dois tons — um miolo mint esfriando pro
 * tom dela — porque naquele tamanho cor chapada parece impressa. Forma distante
 * em vez disso desvanece pra transparente na borda: é o substituto honesto mais
 * barato pra desfoque, e ao contrário do shadowBlur não custa nada por frame.
 */
function buildFill(
  context: CanvasRenderingContext2D,
  z: number,
  size: number,
  hue: readonly [number, number, number],
): CanvasGradient {
  // Montado em volta da origem porque o contexto é transladado até a forma
  // antes do preenchimento — gradiente de canvas é resolvido na transformação
  // em vigor quando é pintado, não quando é criado.
  const gradient = context.createRadialGradient(0, 0, 0, 0, 0, Math.max(1, size));
  if (z > GRADIENT_Z) {
    gradient.addColorStop(0, MINT_SOLID);
    gradient.addColorStop(1, rgb(hue));
  } else {
    gradient.addColorStop(0, rgb(hue));
    gradient.addColorStop(0.55, rgb(hue));
    gradient.addColorStop(1, `rgba(${hue[0]}, ${hue[1]}, ${hue[2]}, 0)`);
  }
  return gradient;
}

function makeStreak(width: number, height: number): Streak {
  const streak = makeSpark();
  reseedStreak(streak, Math.random() * width, Math.random() * height);
  return streak;
}

/** Um risco em branco, no formato do pool. As duas populações dividem o registro. */
function makeSpark(): Streak {
  return { x: 0, y: 0, vx: 0, vy: 0, width: 1, alpha: 0, colour: MINT_SOLID, life: 0, decay: 0 };
}

function reseedStreak(streak: Streak, x: number, y: number): void {
  const heading = STREAK_HEADING + (Math.random() - 0.5) * 2 * STREAK_SPREAD;
  // As velocidades são dadas como múltiplo da deriva da camada lenta, pras duas
  // populações manterem a mesma relação se essa deriva for reajustada.
  const speed = 0.25 * (STREAK_SPEED_MIN + Math.random() * (STREAK_SPEED_MAX - STREAK_SPEED_MIN));
  streak.x = x;
  streak.y = y;
  streak.vx = Math.cos(heading) * speed;
  streak.vy = Math.sin(heading) * speed;
  streak.width = STREAK_WIDTH_MIN + Math.random() * (STREAK_WIDTH_MAX - STREAK_WIDTH_MIN);
  streak.alpha = STREAK_ALPHA_MIN + Math.random() * (STREAK_ALPHA_MAX - STREAK_ALPHA_MIN);
  streak.colour = Math.random() < 0.5 ? MINT_SOLID : rgb(EMERALD);
  streak.life = 1;
  streak.decay = 0;
}

/** Reusa um risco do pool como faísca jogada por uma forma que acabou de ser acertada. */
function igniteSpark(spark: Streak, x: number, y: number): void {
  const heading = Math.random() * Math.PI * 2;
  const speed = BURST_SPEED_MIN + Math.random() * (BURST_SPEED_MAX - BURST_SPEED_MIN);
  spark.x = x;
  spark.y = y;
  spark.vx = Math.cos(heading) * speed;
  spark.vy = Math.sin(heading) * speed;
  spark.width = 1 + Math.random();
  spark.alpha = BURST_ALPHA;
  spark.colour = MINT_SOLID;
  spark.life = 1;
  spark.decay = BURST_DECAY;
}

/**
 * Afasta duas formas que derivaram perto demais.
 *
 * Colocação parelha só vale no começo: velocidades independentes empilhariam as
 * formas em um minuto. Isto é um empurrãozinho, não colisão — a passada é par a
 * par, mas com oitenta formas isso dá umas três mil comparações de aritmética
 * simples, bem abaixo de qualquer coisa que um orçamento de frame note.
 */
function separate(shapes: readonly Shape[], delta: number): void {
  for (let i = 0; i < shapes.length; i += 1) {
    const a = shapes[i];
    if (!a) continue;

    for (let j = i + 1; j < shapes.length; j += 1) {
      const b = shapes[j];
      if (!b) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const minimum = a.size + b.size + BREATHING_ROOM;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared >= minimum * minimum || distanceSquared === 0) continue;

      const distance = Math.sqrt(distanceSquared);
      const push = ((minimum - distance) / minimum) * 0.35 * delta;
      const nx = dx / distance;
      const ny = dy / distance;

      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
    }
  }
}

function advance(shape: Shape, delta: number, width: number, height: number): void {
  shape.x += shape.vx * delta;
  shape.y += shape.vy * delta;
  shape.angle += shape.spin * delta;
  shape.flash = Math.max(0, shape.flash - 0.02 * delta);
  shape.shake = Math.max(0, shape.shake - SHAKE_DECAY * delta);

  // Sair por uma borda é entrar pela oposta, então o campo nunca rareia e
  // sempre tem forma chegando de algum lugar.
  const margin = shape.size * 2;
  if (shape.x < -margin) shape.x = width + margin;
  if (shape.x > width + margin) shape.x = -margin;
  if (shape.y < -margin) shape.y = height + margin;
  if (shape.y > height + margin) shape.y = -margin;
}

function advanceStreak(streak: Streak, delta: number, width: number, height: number): void {
  streak.x += streak.vx * delta;
  streak.y += streak.vy * delta;
  if (streak.decay > 0) {
    streak.life = Math.max(0, streak.life - streak.decay * delta);
    // Faísca é evento, não cenário: deixa ir embora em vez de dar a volta.
    return;
  }

  // A margem cobre o rastro desenhado além do ponto, pra risco que dá a volta
  // nunca deixar um traço riscado pela viewport inteira.
  const margin = Math.abs(streak.vx * TRAIL_TICKS) + Math.abs(streak.vy * TRAIL_TICKS) + 8;
  if (streak.x < -margin) streak.x = width + margin;
  if (streak.x > width + margin) streak.x = -margin;
  if (streak.y < -margin) streak.y = height + margin;
  if (streak.y > height + margin) streak.y = -margin;
}

/** Apaga a forma conforme ela chega na borda, pra nada aparecer ou sumir de estalo. */
function edgeFade(shape: Shape, width: number, height: number): number {
  const margin = shape.size * 3;
  const distance = Math.min(
    shape.x + margin,
    shape.y + margin,
    width - shape.x + margin,
    height - shape.y + margin,
  );
  return clamp(distance / (margin * 2), 0, 1);
}

function draw(
  context: CanvasRenderingContext2D,
  shape: Shape,
  width: number,
  height: number,
  strength: number,
  now: number,
  blur: boolean,
): void {
  const base = (0.06 + shape.z * 0.2) * strength * edgeFade(shape, width, height);
  const alpha = Math.min(1, base + shape.flash * 0.5 * strength);
  if (alpha <= 0.002) return;

  const flashing = shape.flash > 0.05;
  const flinching = shape.shake > 0.01;

  context.save();
  context.globalAlpha = alpha;
  // Erro tira a forma do próprio centro e a encolhe — um repuxo, que lê como
  // errado sem acrescentar luz a um campo que usa luz pra dizer certo.
  context.translate(
    shape.x + (flinching ? Math.sin(now * SHAKE_FREQUENCY + shape.shakeSeed) * SHAKE_AMPLITUDE * shape.shake : 0),
    shape.y,
  );
  context.rotate(shape.angle);
  if (flinching) {
    const scale = 1 - SHAKE_SHRINK * shape.shake;
    context.scale(scale, scale);
  }

  if (flinching) context.fillStyle = RUST_SOLID;
  else if (flashing) context.fillStyle = MINT_SOLID;
  else context.fillStyle = shape.fill;

  if (!blur) {
    // Nada. Neste nível a forma mantém cor, tamanho e movimento, e entrega só
    // o halo — que é a única coisa deste canvas que a CPU rasteriza por forma
    // por frame.
  } else if (flashing) {
    context.shadowColor = MINT_SOLID;
    context.shadowBlur = shape.size * 1.2;
  } else if (shape.z > GLOW_Z) {
    // Só as formas mais próximas carregam brilho permanente. Blur é a única
    // coisa cara deste canvas, então é gasto no punhado de formas grande o
    // bastante pra ele aparecer.
    context.shadowColor = shape.glow;
    context.shadowBlur = shape.size * GLOW_SCALE;
  }

  if (shape.kind === 'star') traceStar(context, shape.size);
  else if (shape.kind === 'quatrefoil') traceQuatrefoil(context, shape.size);
  else traceDot(context, shape.size * 0.18);

  context.fill();
  context.restore();
}

function drawStreak(
  context: CanvasRenderingContext2D,
  streak: Streak,
  strength: number,
): void {
  const alpha = streak.alpha * strength * streak.life;
  if (alpha <= 0.002) return;

  context.globalAlpha = alpha;
  context.strokeStyle = streak.colour;
  context.lineWidth = streak.width;
  context.beginPath();
  context.moveTo(streak.x - streak.vx * TRAIL_TICKS, streak.y - streak.vy * TRAIL_TICKS);
  context.lineTo(streak.x, streak.y);
  context.stroke();
}

/**
 * Estrela de quatro pontas com lados côncavos: as pontas são os únicos pontos
 * do caminho, e cada lado curva de volta pelo centro.
 */
function traceStar(context: CanvasRenderingContext2D, radius: number): void {
  context.beginPath();
  context.moveTo(radius, 0);
  for (let i = 1; i <= 4; i += 1) {
    const angle = (i * Math.PI) / 2;
    context.quadraticCurveTo(0, 0, Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  context.closePath();
}

/** Quatro pétalas em volta de um centro — a mesma simetria de rotação, preenchida. */
function traceQuatrefoil(context: CanvasRenderingContext2D, radius: number): void {
  const petal = radius * 0.42;
  const offset = radius * 0.5;
  context.beginPath();
  for (let i = 0; i < 4; i += 1) {
    const angle = (i * Math.PI) / 2;
    context.moveTo(Math.cos(angle) * offset + petal, Math.sin(angle) * offset);
    context.arc(Math.cos(angle) * offset, Math.sin(angle) * offset, petal, 0, Math.PI * 2);
  }
  context.closePath();
}

function traceDot(context: CanvasRenderingContext2D, radius: number): void {
  context.beginPath();
  context.arc(0, 0, Math.max(0.8, radius), 0, Math.PI * 2);
  context.closePath();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
