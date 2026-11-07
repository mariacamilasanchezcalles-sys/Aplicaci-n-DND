import { describe, expect, it } from "vitest";
import { asAttackId, asCreatureId } from "../src/models";
import type { PersonalityId } from "../src/models";
import {
  FEATURE_NAMES,
  computeFeatures,
  continueSimulation,
  decideOpportunityAttack,
  personalityWeights,
  planTurn,
  scoreFeatures,
  simulatePlan,
  startSimulation,
} from "../src/tactical-brain";
import type { FeatureWeights, SearchParameters } from "../src/tactical-brain";
import { SCENARIOS, scenarioContext } from "./calibration/scenarios";

/**
 * Planificador (etapa 4). Solo se comprueba el MECANISMO: legalidad,
 * determinismo, calidad de la búsqueda y efecto de los parámetros. No se da
 * por aprobada ninguna decisión táctica.
 */
const FULL: SearchParameters = { beamWidth: 4, maxPhases: 3, maxMoveCandidates: null, maxAreaPlacements: null, maxTargetCombinations: null };
const PERSONALITIES: readonly PersonalityId[] = ["pragmatic", "aggressive", "pacifist"];
const scenario = (id: string) => SCENARIOS.find((s) => s.id === id)!;
const zero = Object.fromEntries(FEATURE_NAMES.map((n) => [n, 0])) as FeatureWeights;

describe("planTurn", () => {
  it("devuelve un plan legal cuya puntuación coincide al volver a simularlo", () => {
    const s = scenario("E1");
    const { port, view } = scenarioContext(s);
    const weights = personalityWeights("pragmatic");
    const decision = planTurn(port, view, s.actorId, weights, FULL)!;
    expect(decision.best.plan.steps.at(-1)).toEqual({ kind: "end" });
    const simulation = simulatePlan(port, s.actorId, decision.best.plan);
    expect(simulation.ok).toBe(true);
    if (!simulation.ok) return;
    expect(scoreFeatures(computeFeatures(port, view, s.actorId, simulation), weights)).toBeCloseTo(decision.best.score, 9);
  });

  it("encuentra un plan al menos tan bueno como cada opción escrita a mano de los escenarios", () => {
    for (const s of SCENARIOS) {
      const { port, view } = scenarioContext(s);
      for (const personality of PERSONALITIES) {
        const weights = personalityWeights(personality);
        const best = planTurn(port, view, s.actorId, weights, FULL)!.best.score;
        for (const [option, plan] of Object.entries(s.options)) {
          const simulation = simulatePlan(port, s.actorId, plan);
          if (!simulation.ok) throw new Error(`${s.id}${option}`);
          const manual = scoreFeatures(computeFeatures(port, view, s.actorId, simulation), weights);
          expect(best, `${s.id} ${personality} (${option})`).toBeGreaterThanOrEqual(manual - 1e-9);
        }
      }
    }
  }, 60_000);

  it("es determinista", () => {
    const s = scenario("E4");
    const { port, view } = scenarioContext(s);
    const a = planTurn(port, view, s.actorId, personalityWeights("aggressive"), FULL)!;
    const b = planTurn(port, view, s.actorId, personalityWeights("aggressive"), FULL)!;
    expect(b).toEqual(a);
  });

  it("los parámetros de dificultad reducen la búsqueda sin dar planes ilegales", () => {
    const s = scenario("E1");
    const { port, view } = scenarioContext(s);
    const weights = personalityWeights("pragmatic");
    const full = planTurn(port, view, s.actorId, weights, FULL)!;
    const small = planTurn(port, view, s.actorId, weights, { beamWidth: 1, maxPhases: 1, maxMoveCandidates: 3, maxAreaPlacements: 1, maxTargetCombinations: 1 })!;
    expect(small.evaluated).toBeLessThan(full.evaluated);
    expect(small.best.score).toBeLessThanOrEqual(full.best.score);
    expect(simulatePlan(port, s.actorId, small.best.plan).ok).toBe(true);
  });

  it("replanifica a mitad de turno sin repetir lo ya gastado", () => {
    const s = scenario("E1");
    const { port, view } = scenarioContext(s);
    const started = continueSimulation(port, s.actorId, startSimulation(port, s.actorId), [
      { kind: "begin", source: { kind: "standard", action: "attack" } },
      { kind: "attack", attackId: asAttackId("scimitar"), targetId: asCreatureId("cata") },
    ]);
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const { state, turn } = started.partial;
    const decision = planTurn(port, view, s.actorId, personalityWeights("pragmatic"), FULL, { state, turn })!;
    expect(simulatePlan(port, s.actorId, decision.best.plan, state, turn).ok).toBe(true);
    // La acción ya se usó: el resto del plan no puede volver a Atacar.
    expect(decision.best.plan.steps.some((step) => step.kind === "begin" && step.source.kind === "standard")).toBe(false);
  });
});

describe("decideOpportunityAttack", () => {
  const s = scenario("E1");
  const { port, view } = scenarioContext(s);
  // Cata (jugadora) se aleja del goblin: el bando del goblin decide la reacción.
  const opportunity = {
    kind: "opportunityAttack" as const,
    reactorId: s.actorId,
    moverId: asCreatureId("cata"),
    attackIds: [asAttackId("scimitar")],
    viaMark: false,
  };

  it("no ataca si los rasgos de daño no puntúan", () => {
    expect(decideOpportunityAttack(port, view, opportunity, zero)).toBeNull();
  });

  it("ataca si el daño causado puntúa", () => {
    const decision = decideOpportunityAttack(port, view, opportunity, { ...zero, damageDealt: 1 });
    expect(decision?.attackId).toBe("scimitar");
    expect(decision!.score).toBeGreaterThan(0);
  });
});
