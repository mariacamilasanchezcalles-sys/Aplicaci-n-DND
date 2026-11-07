import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PERSONALITY_SIGNS, solveWeights } from "../../src/tactical-brain";
import { SCENARIOS, calibrationCases, scenarioFeatures } from "./scenarios";

/**
 * Solucionador de pesos. Solo corre con CALIBRATE=1 (`npm run calibrate`):
 * imprime los rasgos de cada escenario y escribe los pesos en
 * src/tactical-brain/personalities.json para que la jugadora los apruebe.
 */
describe.runIf(process.env["CALIBRATE"] === "1")("calibración (CALIBRATE=1)", () => {
  it("calcula los pesos por personalidad", () => {
    for (const scenario of SCENARIOS) console.log(scenario.id, JSON.stringify(scenarioFeatures(scenario), null, 1));
    const out: Record<string, unknown> = {
      _comment:
        "Pesos por personalidad. Salen de la calibración con escenarios aprobados por la jugadora (docs/BRAIN_CALIBRATION.md); no se editan a mano. Pendientes de su aprobación.",
    };
    for (const personality of ["pragmatic", "aggressive", "pacifist"] as const) {
      const result = solveWeights(calibrationCases(personality), 1, 10_000, PERSONALITY_SIGNS[personality]);
      console.log(personality, JSON.stringify(result));
      out[personality] = result.weights;
      expect(result.violations, personality).toEqual([]);
    }
    writeFileSync(join(__dirname, "../../src/tactical-brain/personalities.json"), JSON.stringify(out, null, 2) + "\n");
  });
});
