"use client";

import { useReducedMotion } from "motion/react";
import { useSettings } from "./use-settings";
import { motionLevelOf, type MotionLevel } from "./performance-tiers";

/**
 * Com o que a interface desta pessoa pode animar, agora.
 *
 * Um hook só pras duas entradas — o nível de desempenho que ela escolheu e a
 * preferência de movimento que o sistema dela carrega — serem combinadas num
 * lugar. Componente que perguntasse `useReducedMotion()` sozinho só conseguiria
 * ver metade da resposta.
 */
export function useMotionLevel(): MotionLevel {
  const reduced = useReducedMotion();
  const tier = useSettings((state) => state.performance);
  return motionLevelOf(tier, reduced ?? false);
}
