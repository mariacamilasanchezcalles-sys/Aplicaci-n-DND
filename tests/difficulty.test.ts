import { describe, expect, it } from "vitest";
import type { PersonalityId } from "../src/models";
import { DIFFICULTY_PROFILES, FEATURE_NAMES, personalityWeights, planTurn, simulatePlan } from "../src/tactical-brain";
import type { FeatureWeights, PresetDifficultyId as DifficultyId } from "../src/tactical-brain";
import { SCENARIOS, comparisonsFor, scenarioContext } from "./calibration/scenarios";

/**
 * Niveles de dificultad (decisión 96, valores PENDIENTES de aprobación):
 * solo se comprueba el mecanismo (cuánto busca, legalidad, determinismo).
 */
const LEVELS: readonly DifficultyId[] = ["easy", "normal", "hard"];
const PERSONALITIES: readonly PersonalityId[] = ["pragmatic", "aggressive", "pacifist"];

describe("niveles de dificultad", () => {
  it("más dificultad examina más planes; todos los planes elegidos son legales", () => {
    const total: Record<DifficultyId, number> = { easy: 0, normal: 0, hard: 0 };
    for (const scenario of SCENARIOS) {
      const { port, view } = scenarioContext(scenario);
      for (const personality of PERSONALITIES) {
        if (comparisonsFor(scenario, personality) === null) continue;
        for (const level of LEVELS) {
          const decision = planTurn(port, view, scenario.actorId, personalityWeights(personality), DIFFICULTY_PROFILES[level].search)!;
          total[level] += decision.evaluated;
          expect(simulatePlan(port, scenario.actorId, decision.best.plan).ok, `${scenario.id} ${personality} ${level}`).toBe(true);
        }
      }
    }
    expect(total.easy).toBeLessThan(total.normal);
    expect(total.normal).toBeLessThan(total.hard);
  }, 60_000);

  it("un rasgo que el nivel no calcula no puntúa", () => {
    const scenario = SCENARIOS.find((s) => s.id === "E4")!;
    const { port, view } = scenarioContext(scenario);
    const onlyFlanking = { ...Object.fromEntries(FEATURE_NAMES.map((n) => [n, 0])), flankingPairs: 1 } as FeatureWeights;
    const counted = planTurn(port, view, scenario.actorId, onlyFlanking, DIFFICULTY_PROFILES.hard.search)!;
    expect(counted.best.score).toBeGreaterThan(0);
    const ignored = planTurn(port, view, scenario.actorId, onlyFlanking, { ...DIFFICULTY_PROFILES.hard.search, ignoredFeatures: ["flankingPairs"] })!;
    expect(ignored.best.score).toBe(0);
  });

  it("los niveles nunca cambian estadísticas ni información: solo parámetros de búsqueda", () => {
    for (const level of LEVELS) {
      expect(Object.keys(DIFFICULTY_PROFILES[level]).sort()).toEqual(["coordination", "replanAfterEachOperation", "search"]);
    }
  });
});
