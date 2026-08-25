'use client';

import { useSettings, useSettingsHydration } from '@/features/settings/use-settings';
import { fieldLevelOf } from '@/features/settings/performance-tiers';
import { StarField } from './star-field';

/**
 * Fica no layout raiz pro campo cobrir toda tela do produto, e não uma página
 * dentro de uma caixa. A configuração mora aqui e não dentro do canvas, o que
 * mantém a animação livre do React por inteiro.
 *
 * No 'off' o canvas não é renderizado — não escondido, não pausado. Máquina que
 * não aguenta o campo também não pode estar pagando pelo elemento, pelo contexto
 * ou pelo listener de resize.
 */
export function AmbientBackground() {
  useSettingsHydration();
  const tier = useSettings((state) => state.performance);
  const level = fieldLevelOf(tier);

  return level === 'off' ? null : <StarField level={level} />;
}
