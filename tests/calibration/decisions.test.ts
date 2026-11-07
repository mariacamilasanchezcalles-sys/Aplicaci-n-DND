import { describe, expect, it } from "vitest";
import { personalityWeights, scoreFeatures } from "../../src/tactical-brain";
import { SCENARIOS, scenarioFeatures } from "./scenarios";

/**
 * Regresión de la calibración: con los pesos guardados en
 * src/tactical-brain/personalities.json, cada personalidad debe preferir la
 * opción que eligió la jugadora en cada escenario decidido.
 */
describe("decisiones de la jugadora (docs/BRAIN_CALIBRATION.md)", () => {
  for (const scenario of SCENARIOS) {
    const features = scenarioFeatures(scenario);
    for (const [personality, answer] of Object.entries(scenario.answers)) {
      it(`${scenario.id} ${personality}: elige (${answer})`, () => {
        const weights = personalityWeights(personality as "pragmatic" | "aggressive" | "pacifist");
        const scores = Object.fromEntries(Object.entries(features).map(([option, f]) => [option, scoreFeatures(f, weights)]));
        for (const [option, score] of Object.entries(scores)) {
          if (option !== answer) expect(scores[answer]!, `${option}: ${JSON.stringify(scores)}`).toBeGreaterThan(score);
        }
      });
    }
  }
});
