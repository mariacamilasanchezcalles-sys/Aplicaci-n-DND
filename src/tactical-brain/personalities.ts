import type { PersonalityId } from "../models";
import { FEATURE_NAMES } from "./features";
import type { FeatureName, FeatureWeights } from "./features";
import data from "./personalities.json" with { type: "json" };

/**
 * Perfiles de personalidad como DATOS (decisión 71): un peso por rasgo.
 * Un rasgo sin peso vale 0. Los valores salen de `solveWeights`.
 */
export function personalityWeights(personality: PersonalityId): FeatureWeights {
  const raw = (data as Record<string, Partial<Record<FeatureName, number>>>)[personality] ?? {};
  return Object.fromEntries(FEATURE_NAMES.map((n) => [n, raw[n] ?? 0])) as Record<FeatureName, number>;
}
