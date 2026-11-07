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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createSimulationPort } from "../src/combat-controller";
import { buildKnowledgeView, observeState, priorsForPartyLevel } from "../src/perception";
import { combatantFromSheet, loadCreatureSheet } from "../src/sheets";
import type { CombatantDefinition } from "../src/models";
import { emptyEncounter, engine } from "./helpers";

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

describe("planTurn con fichas (Multiataque)", () => {
  /** Bruto de prueba sin la roca: solo garra (5 pies) y mordisco (10 pies, sin Agarrar). */
  function bruteWithoutRock(): CombatantDefinition {
    const raw = JSON.parse(readFileSync(join(__dirname, "fixtures/sheets/test-brute.json"), "utf8"));
    raw.attacks = raw.attacks.filter((a: { id: string }) => a.id !== "rock");
    // Agarrar al impactar aún no está modelado (el puente omite ese ataque): solo daño.
    const bite = raw.attacks.find((a: { id: string }) => a.id === "bite");
    bite.onHit = bite.onHit.filter((e: { kind: string }) => e.kind === "damage");
    const multiattack = raw.capabilities.find((c: { id: string }) => c.id === "multiattack");
    multiattack.body.steps[0].body = { op: "attack", attackRef: "claw" };
    raw.capabilities = raw.capabilities.filter((c: { id: string }) => c.id === "multiattack");
    const loaded = loadCreatureSheet(JSON.stringify(raw));
    if (!loaded.valid) throw new Error(JSON.stringify(loaded.errors));
    return combatantFromSheet(loaded.sheet, { creatureId: "brute", personality: "pragmatic" }).definition;
  }
  const pc = (name: string): CombatantDefinition => ({
    kind: "playerCharacter",
    registration: "simplified",
    testRole: "melee-fighter",
    id: asCreatureId(name),
    label: name,
    size: "medium",
    stats: { maxHitPoints: 10, armorClass: 14, speedFeet: 30 },
    attacks: [],
    bonusActions: [],
    traits: [],
  });

  it("usa el Multiataque y se mueve entre ataques para alcanzar a otro objetivo", () => {
    let e = engine.addCombatant(emptyEncounter(16, 16), bruteWithoutRock(), { column: 2, row: 2 });
    e = engine.addCombatant(e, pc("cata"), { column: 4, row: 2 });
    e = engine.addCombatant(e, pc("cain"), { column: 2, row: 7 });
    e = observeState(e);
    const brute = asCreatureId("brute");
    const view = buildKnowledgeView(e, brute, priorsForPartyLevel(1));
    const port = createSimulationPort(e, view);
    // Solo cuenta rematar (tope 1 por objetivo): repartir los ataques puntúa más.
    const decision = planTurn(port, view, brute, { ...zero, finishingChance: 1 }, FULL)!;
    const steps = decision.best.plan.steps;
    expect(simulatePlan(port, brute, decision.best.plan).ok).toBe(true);
    expect(steps[0]).toEqual({ kind: "begin", source: { kind: "sheet", capabilityId: "multiattack" } });
    const targets = steps.flatMap((step) => (step.kind === "attack" ? [step.targetId] : []));
    expect(new Set(targets)).toEqual(new Set(["cata", "cain"]));
    const firstAttack = steps.findIndex((step) => step.kind === "attack");
    const lastAttack = steps.length - 1 - [...steps].reverse().findIndex((step) => step.kind === "attack");
    expect(steps.slice(firstAttack, lastAttack).some((step) => step.kind === "move")).toBe(true);
  });
});
