'use client';

import { useSettings, useSettingsHydration } from '@/features/settings/use-settings';
import { fieldLevelOf } from '@/features/settings/performance-tiers';
import { StarField } from './star-field';

/**
 * Sits in the root layout so the field spans every screen of the product, not
 * one page inside a box. The setting lives here rather than inside the canvas,
 * which keeps the animation free of React entirely.
 *
 * At 'off' the canvas is not rendered at all — not hidden, not paused. A
 * machine that cannot afford the field should not be paying for the element,
 * the context, or the resize listener either.
 */
export function AmbientBackground() {
  useSettingsHydration();
  const tier = useSettings((state) => state.performance);
  const level = fieldLevelOf(tier);

  return level === 'off' ? null : <StarField level={level} />;
}
