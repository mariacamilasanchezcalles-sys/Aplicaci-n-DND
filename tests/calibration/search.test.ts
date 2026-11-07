import { describe, expect, it } from "vitest";
import type { PersonalityId } from "../../src/models";
import { personalityWeights, planTurn } from "../../src/tactical-brain";
import type { SearchParameters } from "../../src/tactical-brain";
import { SCENARIOS, comparisonsFor, scenarioContext, scenarioFeatures } from "./scenarios";

/**
 * Con búsqueda libre, cada personalidad elige lo decidido en la calibración:
 * la respuesta de la jugadora o un plan juzgado equivalente
 * (tests/calibration/judged-plans.json). Se compara por rasgos medidos.
 */
const SEARCH: SearchParameters = { beamWidth: 4, maxPhases: 3, maxMoveCandidates: null, maxAreaPlacements: null, maxTargetCombinations: null };
const PERSONALITIES: readonly PersonalityId[] = ["pragmatic", "aggressive", "pacifist"];

describe("búsqueda libre frente a lo decidido", () => {
  for (const scenario of SCENARIOS) {
    for (const personality of PERSONALITIES) {
      const comparison = comparisonsFor(scenario, personality);
      if (comparison === null) continue;
      it(`${scenario.id} ${personality}`, () => {
        const { port, view } = scenarioContext(scenario);
        const features = scenarioFeatures(scenario);
        const best = planTurn(port, view, scenario.actorId, personalityWeights(personality), SEARCH)!.best;
        const accepted = [comparison.answer, ...comparison.acceptable].map((key) => features[key]);
        expect(accepted).toContainEqual(best.features);
      });
    }
  }
});
