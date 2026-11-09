import { describe, expect, it } from "vitest";
import { asCreatureId } from "../src/models";
import type { Encounter, Intention } from "../src/models";
import {
  DIFFICULTY_PROFILES,
  FEATURE_NAMES,
  alliesActingAfter,
  computeFeatures,
  cooperationFromBoard,
  personalityWeights,
  planCoordinatedTurn,
  planTurn,
  publishIntention,
  simulatePlan,
} from "../src/tactical-brain";
import type { FeatureWeights } from "../src/tactical-brain";
import { SCENARIOS, scenarioContext } from "./calibration/scenarios";

/**
 * Cooperación (etapa 5). Solo el MECANISMO: pizarra, quién cuenta, cómo
 * cambian los rasgos y la coordinación por nivel. No da por aprobada
 * ninguna decisión táctica.
 */
const G1 = asCreatureId("goblin-1");
const G2 = asCreatureId("goblin-2");
const CATA = asCreatureId("cata");
const CAIN = asCreatureId("cain");
const zero = Object.fromEntries(FEATURE_NAMES.map((n) => [n, 0])) as FeatureWeights;
const scenario = (id: string) => SCENARIOS.find((s) => s.id === id)!;

const intention = (creatureId: typeof G1, round: number, extra: Partial<Intention> = {}): Intention => ({
  creatureId,
  round,
  finalPosition: { column: 7, row: 6 },
  expectedDamageByTarget: { cata: 4 },
  tentative: false,
  ...extra,
});

const withOrder = (e: Encounter, order: readonly string[], round = 1, turnIndex = 0): Encounter => ({
  ...e,
  initiativeOrder: order.map(asCreatureId),
  round,
  turnIndex,
});

describe("pizarra de intenciones", () => {
  it("solo cuentan los aliados que actúan después en este asalto y las intenciones de este asalto", () => {
    const base = scenario("E4").encounter;
    // goblin-2 actúa después de goblin-1.
    let e = withOrder(base, ["goblin-1", "cata", "goblin-2", "cain"]);
    expect(alliesActingAfter(e, G1)).toEqual([G2]);
    expect(alliesActingAfter(e, G2)).toEqual([]);
    e = publishIntention(e, intention(G2, 1));
    expect(cooperationFromBoard(e, G1)).toEqual({ allyDamageByTarget: { cata: 4 }, allyPositions: { "goblin-2": { column: 7, row: 6 } } });
    // goblin-2 ya actuó: su intención no cuenta para goblin-2 al revés.
    expect(cooperationFromBoard(e, G2)).toEqual({ allyDamageByTarget: {}, allyPositions: {} });
    // Una intención de otro asalto no cuenta.
    const stale = publishIntention(withOrder(base, ["goblin-1", "goblin-2"], 2), intention(G2, 1));
    expect(cooperationFromBoard(stale, G1)).toEqual({ allyDamageByTarget: {}, allyPositions: {} });
  });
});

describe("rasgos con cooperación", () => {
  it("rematar cuenta solo la parte que no consiguen ya los aliados", () => {
    const s = scenario("E1");
    const { port, view } = scenarioContext(s);
    const plan = s.options["a"]!; // cimitarra a Cata
    const simulation = simulatePlan(port, s.actorId, plan);
    if (!simulation.ok) throw new Error("plan");
    const alone = computeFeatures(port, view, s.actorId, simulation);
    const helped = computeFeatures(port, view, s.actorId, simulation, { allyDamageByTarget: { cata: 1000 }, allyPositions: {} });
    expect(alone.finishingChance).toBeGreaterThan(0);
    expect(helped.finishingChance).toBe(0);
    // El resto de rasgos no cambia.
    expect({ ...helped, finishingChance: 0 }).toEqual({ ...alone, finishingChance: 0 });
  });

  it("con remate de los aliados, otro objetivo pasa a valer más", () => {
    const s = scenario("E1");
    const { port, view } = scenarioContext(s);
    const onlyFinishing = { ...zero, finishingChance: 1 };
    const targetOf = (d: ReturnType<typeof planTurn>) =>
      d!.best.plan.steps.flatMap((step) => (step.kind === "attack" ? [step.targetId] : []));
    expect(targetOf(planTurn(port, view, s.actorId, onlyFinishing, DIFFICULTY_PROFILES.hard.search))).toEqual([CATA]);
    const helped = planTurn(port, view, s.actorId, onlyFinishing, DIFFICULTY_PROFILES.hard.search, undefined, {
      allyDamageByTarget: { cata: 1000 },
      allyPositions: {},
    });
    expect(targetOf(helped)).toEqual([CAIN]);
  });

  it("los flanqueos cuentan la posición en que terminarán los aliados", () => {
    // E4: goblin-1 rodea a Cata; goblin-2 está en (5,5), al oeste de Cata (6,5).
    const s = scenario("E4");
    const { port, view } = scenarioContext(s);
    const simulation = simulatePlan(port, s.actorId, s.options["a"]!);
    if (!simulation.ok) throw new Error("plan");
    const now = computeFeatures(port, view, s.actorId, simulation).flankingPairs;
    // Si goblin-2 fuera a terminar lejos, el flanqueo desaparece.
    const away = computeFeatures(port, view, s.actorId, simulation, { allyDamageByTarget: {}, allyPositions: { "goblin-2": { column: 0, row: 0 } } });
    expect(now).toBeGreaterThan(0);
    expect(away.flankingPairs).toBeLessThan(now);
  });
});

describe("coordinación por nivel", () => {
  const weightsOf = personalityWeights;

  it("'limitada' ignora la pizarra; 'planifica cooperación' planea tentativamente a los aliados siguientes", () => {
    const s = scenario("E4");
    const { port, view } = scenarioContext(s);
    const weights = personalityWeights("pragmatic");
    const limited = planCoordinatedTurn(port, view, s.actorId, weights, { ...DIFFICULTY_PROFILES.hard, coordination: "limited" }, weightsOf)!;
    expect(limited.decision).toEqual(planTurn(port, view, s.actorId, weights, DIFFICULTY_PROFILES.hard.search));
    expect(limited.intentions.map((i) => [i.creatureId, i.tentative])).toEqual([[G1, false]]);

    const team = planCoordinatedTurn(port, view, s.actorId, weights, DIFFICULTY_PROFILES.hard, weightsOf)!;
    expect(team.intentions.map((i) => [i.creatureId, i.tentative])).toEqual([
      [G1, false],
      [G2, true],
    ]);
    expect(simulatePlan(port, s.actorId, team.decision.best.plan).ok).toBe(true);
    // Determinista.
    expect(planCoordinatedTurn(port, view, s.actorId, weights, DIFFICULTY_PROFILES.hard, weightsOf)).toEqual(team);
  });
});
