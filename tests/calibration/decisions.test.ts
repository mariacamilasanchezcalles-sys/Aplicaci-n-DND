import { describe, expect, it } from "vitest";
import { personalityWeights, scoreFeatures } from "../../src/tactical-brain";
import type { PersonalityId } from "../../src/models";
import { SCENARIOS, comparisonsFor, scenarioFeatures } from "./scenarios";

/**
 * Regresión de la calibración: con los pesos guardados en
 * src/tactical-brain/personalities.json, cada personalidad debe preferir lo
 * que eligió la jugadora frente a cada plan que juzgó peor (opciones escritas
 * y planes de la búsqueda rechazados).
 */
const PERSONALITIES: readonly PersonalityId[] = ["pragmatic", "aggressive", "pacifist"];

describe("decisiones de la jugadora (docs/BRAIN_CALIBRATION.md)", () => {
  for (const scenario of SCENARIOS) {
    const features = scenarioFeatures(scenario);
    for (const personality of PERSONALITIES) {
      const comparison = comparisonsFor(scenario, personality);
      if (comparison === null) continue;
      it(`${scenario.id} ${personality}: elige (${comparison.answer})`, () => {
        const weights = personalityWeights(personality);
        const score = (option: string): number => scoreFeatures(features[option]!, weights);
        for (const option of comparison.worse) expect(score(comparison.answer), option).toBeGreaterThan(score(option));
      });
    }
  }
});
