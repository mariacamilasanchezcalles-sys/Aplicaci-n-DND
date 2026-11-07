import { asAttackId, asCreatureId } from "../../src/models";
import type { CombatantDefinition, CreatureId, Encounter, GridPosition, PersonalityId } from "../../src/models";
import { createSimulationPort } from "../../src/combat-controller";
import { buildKnowledgeView, observeState, priorsForPartyLevel } from "../../src/perception";
import { computeFeatures, simulatePlan } from "../../src/tactical-brain";
import type { CalibrationCase, FeatureVector, Plan, PlanStep } from "../../src/tactical-brain";
import { PROVISIONAL_SCENARIO, TABLE_RULES_OF_THE_PLAYERS_TABLE, goblin } from "../../src/scenarios/provisionalScenario";
import { engine } from "../helpers";

/**
 * ESCENARIOS DE CALIBRACIÓN de la jugadora (docs/BRAIN_CALIBRATION.md §2).
 * Mesa de la jugadora (con sus reglas caseras), mapa 15 x 21, grupo de nivel 1,
 * Goblin Warrior oficial (10 PG). Cada opción es un plan completo.
 */
const id = asCreatureId;
const G = id("goblin-1");
const G2 = id("goblin-2");
const CATA = id("cata");
const CAIN = id("cain");
const scimitar = asAttackId("scimitar");
const shortbow = asAttackId("shortbow");

const pc = (name: "cata" | "cain", testRole: "melee-fighter" | "ranged-spellcaster", ac: number, hp: number): CombatantDefinition => ({
  kind: "playerCharacter",
  registration: "simplified",
  testRole,
  id: id(name),
  label: name,
  size: "medium",
  stats: { maxHitPoints: hp, armorClass: ac, speedFeet: 30 },
  attacks: [],
  bonusActions: [],
  traits: [],
});
const goblinDef = (who: CreatureId): CombatantDefinition => ({ ...goblin, id: who, stats: { ...goblin.stats, maxHitPoints: 10 } });

function encounter(placed: readonly (readonly [CombatantDefinition, number, number])[]): Encounter {
  let e = engine.createEncounter({
    id: "calibration" as never,
    label: "Calibración",
    grid: PROVISIONAL_SCENARIO.grid,
    occupancyPolicy: "one-creature-per-space",
    tableRules: TABLE_RULES_OF_THE_PLAYERS_TABLE,
  });
  for (const [d, column, row] of placed) e = engine.addCombatant(e, d, { column, row });
  return e;
}
/**
 * PG actuales. Si queda por debajo de la mitad, se da por hecho que ya superó
 * la tirada de Moral de "bajar de la mitad" (regla casera): si la hubiera
 * fallado, estaría huyendo y no habría nada que decidir.
 */
const withHp = (e: Encounter, who: CreatureId, hp: number): Encounter => {
  const r = e.combatants[who]!;
  const below = r.definition.stats.maxHitPoints !== undefined && hp * 2 < r.definition.stats.maxHitPoints;
  const morale = below ? { ...r.state.morale, belowHalfTriggered: true } : r.state.morale;
  return { ...e, combatants: { ...e.combatants, [who]: { ...r, state: { ...r.state, currentHitPoints: hp, morale } } } };
};
const line = (from: GridPosition, dColumn: number, dRow: number, n: number): GridPosition[] =>
  Array.from({ length: n }, (_, i) => ({ column: from.column + dColumn * (i + 1), row: from.row + dRow * (i + 1) }));

const begin = (action: "attack" | "dash" | "disengage" | "dodge"): PlanStep => ({ kind: "begin", source: { kind: "standard", action } });
const nimble: PlanStep = { kind: "begin", source: { kind: "bonusAction", bonusActionId: "nimble-escape" } };
const end: PlanStep = { kind: "end" };

export interface Scenario {
  readonly id: string;
  readonly actorId: CreatureId;
  readonly encounter: Encounter;
  readonly options: Readonly<Record<string, Plan>>;
  /** Decisión de la jugadora por personalidad (solo las ya decididas). */
  readonly answers: Partial<Record<PersonalityId, string>>;
}

export const SCENARIOS: readonly Scenario[] = [
  {
    id: "E1",
    actorId: G,
    encounter: encounter([
      [goblinDef(G), 5, 10],
      [pc("cata", "melee-fighter", 16, 20), 6, 10],
      [pc("cain", "ranged-spellcaster", 12, 14), 5, 2],
    ]),
    options: {
      a: { steps: [begin("attack"), { kind: "attack", attackId: scimitar, targetId: CATA }, end] },
      b: {
        steps: [
          begin("attack"),
          { kind: "attack", attackId: scimitar, targetId: CATA },
          nimble,
          { kind: "standardAction", action: "disengage" },
          { kind: "move", path: line({ column: 5, row: 10 }, 0, 1, 6) },
          end,
        ],
      },
      c: {
        steps: [
          nimble,
          { kind: "standardAction", action: "disengage" },
          { kind: "move", path: line({ column: 5, row: 10 }, 0, 1, 6) },
          begin("attack"),
          { kind: "attack", attackId: shortbow, targetId: CAIN },
          end,
        ],
      },
      d: { steps: [begin("attack"), { kind: "attack", attackId: shortbow, targetId: CAIN }, end] },
    },
    answers: { pragmatic: "b", aggressive: "a" },
  },
  {
    id: "E2",
    actorId: G,
    encounter: withHp(
      encounter([
        [goblinDef(G), 5, 10],
        [goblinDef(G2), 6, 1],
        [pc("cata", "melee-fighter", 16, 20), 9, 10],
        [pc("cain", "ranged-spellcaster", 12, 14), 5, 0],
      ]),
      G2,
      4,
    ),
    options: {
      a: { steps: [begin("attack"), { kind: "attack", attackId: shortbow, targetId: CAIN }, end] },
      b: { steps: [{ kind: "move", path: line({ column: 5, row: 10 }, 1, 0, 3) }, begin("attack"), { kind: "attack", attackId: scimitar, targetId: CATA }, end] },
      c: { steps: [{ kind: "move", path: line({ column: 5, row: 10 }, 0, 1, 6) }, begin("dodge"), { kind: "standardAction", action: "dodge" }, end] },
    },
    answers: { pragmatic: "a" },
  },
  {
    id: "E3",
    actorId: G,
    encounter: withHp(
      encounter([
        [goblinDef(G), 5, 10],
        [pc("cata", "melee-fighter", 16, 20), 6, 10],
        [pc("cain", "ranged-spellcaster", 12, 14), 14, 20],
      ]),
      G,
      2,
    ),
    options: {
      a: { steps: [begin("attack"), { kind: "attack", attackId: scimitar, targetId: CATA }, end] },
      b: { steps: [nimble, { kind: "standardAction", action: "disengage" }, { kind: "move", path: line({ column: 5, row: 10 }, 0, 1, 6) }, end] },
      c: { steps: [begin("dodge"), { kind: "standardAction", action: "dodge" }, end] },
    },
    answers: { pragmatic: "c", aggressive: "a", pacifist: "b" },
  },
  {
    id: "E4",
    actorId: G,
    encounter: encounter([
      [goblinDef(G), 10, 8],
      [goblinDef(G2), 5, 5],
      [pc("cata", "melee-fighter", 16, 20), 6, 5],
      [pc("cain", "ranged-spellcaster", 12, 14), 14, 20],
    ]),
    options: {
      a: {
        steps: [
          { kind: "move", path: [{ column: 9, row: 7 }, { column: 8, row: 6 }, { column: 7, row: 5 }] },
          begin("attack"),
          { kind: "attack", attackId: scimitar, targetId: CATA },
          end,
        ],
      },
      b: { steps: [{ kind: "move", path: line({ column: 10, row: 8 }, 0, 1, 3) }, begin("attack"), { kind: "attack", attackId: shortbow, targetId: CAIN }, end] },
    },
    answers: { pragmatic: "a" },
  },
];

/** Rasgos de cada opción de un escenario, vistos por el actor (solo con su conocimiento). */
export function scenarioFeatures(scenario: Scenario): Record<string, FeatureVector> {
  let e = observeState(scenario.encounter);
  if (scenario.id === "E2") {
    // Lo que el bando vio el turno anterior: Caín hirió a goblin-2 (6 de daño, a distancia).
    const side = e.combatants[scenario.actorId]!.side;
    const memory = e.sideKnowledge[side]!.creatures;
    e = {
      ...e,
      sideKnowledge: {
        ...e.sideKnowledge,
        [side]: { creatures: { ...memory, cain: { ...memory["cain"]!, damageDealtSeen: 6, attacksSeen: [asAttackId("fire-bolt")] } } },
      },
    };
  }
  const view = buildKnowledgeView(e, scenario.actorId, priorsForPartyLevel(1));
  const port = createSimulationPort(e, view);
  const out: Record<string, FeatureVector> = {};
  for (const [option, plan] of Object.entries(scenario.options)) {
    const simulation = simulatePlan(port, scenario.actorId, plan);
    if (!simulation.ok) throw new Error(`${scenario.id}${option}: paso ${simulation.failedStep} (${simulation.reason})`);
    out[option] = computeFeatures(port, view, scenario.actorId, simulation);
  }
  return out;
}

/** Casos de calibración de una personalidad. */
export function calibrationCases(personality: PersonalityId): CalibrationCase[] {
  return SCENARIOS.flatMap((scenario) => {
    const answer = scenario.answers[personality];
    if (answer === undefined) return [];
    const features = scenarioFeatures(scenario);
    return [
      {
        id: scenario.id,
        chosen: features[answer]!,
        others: Object.entries(features)
          .filter(([option]) => option !== answer)
          .map(([option, f]) => ({ id: option, features: f })),
      },
    ];
  });
}
