import { asAttackId, asCreatureId } from "../../src/models";
import type { CombatantDefinition, CreatureId, Encounter, GridPosition, PersonalityId } from "../../src/models";
import { createSimulationPort } from "../../src/combat-controller";
import { buildKnowledgeView, observeState, priorsForPartyLevel } from "../../src/perception";
import { computeFeatures, simulatePlan } from "../../src/tactical-brain";
import type { CalibrationCase, FeatureVector, Plan, PlanStep, SimulationPort } from "../../src/tactical-brain";
import type { KnowledgeView } from "../../src/perception";
import { PROVISIONAL_SCENARIO, TABLE_RULES_OF_THE_PLAYERS_TABLE, goblin } from "../../src/scenarios/provisionalScenario";
import { engine } from "../helpers";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { combatantFromSheet, loadCreatureSheet } from "../../src/sheets";

const DRAKE = id_("drake");
function id_(name: string): CreatureId {
  return asCreatureId(name);
}
function drakeDef(): CombatantDefinition {
  const loaded = loadCreatureSheet(readFileSync(join(__dirname, "../fixtures/sheets/test-drake.json"), "utf8"));
  if (!loaded.valid) throw new Error(JSON.stringify(loaded.errors));
  return combatantFromSheet(loaded.sheet, { creatureId: "drake", personality: "pragmatic" }).definition;
}

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

/** Cono de 15 pies del Draco (Grande en (2,2)) hacia el este: cubre (5,2), (5,3), (6,2) y (6,3). */
const drakeCone = { origin: { column: 4, row: 3 }, direction: "e" as const };
const claw = asAttackId("claw");

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
    answers: { pragmatic: "b", aggressive: "a", pacifist: "b" },
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
    answers: { pragmatic: "a", aggressive: "a", pacifist: "c" },
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
    answers: { pragmatic: "a", aggressive: "a", pacifist: "b" },
  },
  {
    // Agresivo en peligro serio: 3 PG y Cata y Caín pegados a él.
    id: "E5",
    actorId: G,
    encounter: withHp(
      encounter([
        [goblinDef(G), 5, 10],
        [pc("cata", "melee-fighter", 16, 20), 6, 10],
        [pc("cain", "ranged-spellcaster", 12, 14), 4, 10],
      ]),
      G,
      3,
    ),
    options: {
      a: { steps: [begin("attack"), { kind: "attack", attackId: scimitar, targetId: CAIN }, end] },
      b: { steps: [nimble, { kind: "standardAction", action: "disengage" }, { kind: "move", path: line({ column: 5, row: 10 }, 0, 1, 6) }, end] },
      c: { steps: [begin("dodge"), { kind: "standardAction", action: "dodge" }, end] },
    },
    answers: { aggressive: "a" },
  },
  {
    // Pacifista que debe defenderse: sano, arrinconado, Cata pegada a él.
    id: "E6",
    actorId: G,
    encounter: encounter([
      [goblinDef(G), 0, 0],
      [pc("cata", "melee-fighter", 16, 20), 1, 0],
      [pc("cain", "ranged-spellcaster", 12, 14), 14, 20],
    ]),
    options: {
      a: { steps: [begin("attack"), { kind: "attack", attackId: scimitar, targetId: CATA }, end] },
      b: { steps: [begin("dodge"), { kind: "standardAction", action: "dodge" }, end] },
      c: { steps: [nimble, { kind: "standardAction", action: "disengage" }, { kind: "move", path: line({ column: 0, row: 0 }, 0, 1, 6) }, end] },
    },
    answers: { pacifist: "b" },
  },
  {
    // Riesgo inútil: ir por Caín pasando junto a Cata sin Destrabarse.
    id: "E7",
    actorId: G,
    encounter: encounter([
      [goblinDef(G), 5, 10],
      [pc("cata", "melee-fighter", 16, 20), 6, 10],
      [pc("cain", "ranged-spellcaster", 12, 14), 10, 10],
    ]),
    options: {
      a: { steps: [begin("attack"), { kind: "attack", attackId: scimitar, targetId: CATA }, end] },
      b: {
        steps: [
          { kind: "move", path: [{ column: 6, row: 11 }, { column: 7, row: 11 }, { column: 8, row: 11 }, { column: 9, row: 10 }] },
          begin("attack"),
          { kind: "attack", attackId: scimitar, targetId: CAIN },
          end,
        ],
      },
    },
    answers: { aggressive: "a" },
  },
  {
    // Recurso: aliento con Cata y Caín dentro del cono, o zarpazo a Cata.
    id: "E8",
    actorId: DRAKE,
    encounter: encounter([
      [drakeDef(), 2, 2],
      [pc("cata", "melee-fighter", 16, 20), 5, 3],
      [pc("cain", "ranged-spellcaster", 12, 14), 6, 2],
    ]),
    options: {
      a: { steps: [{ kind: "begin", source: { kind: "sheet", capabilityId: "breath" } }, { kind: "effect", placement: drakeCone }, end] },
      b: { steps: [begin("attack"), { kind: "attack", attackId: claw, targetId: CATA }, end] },
    },
    answers: { pragmatic: "a" },
  },
  {
    // Recurso: solo Cata en el cono.
    id: "E9",
    actorId: DRAKE,
    encounter: encounter([
      [drakeDef(), 2, 2],
      [pc("cata", "melee-fighter", 16, 20), 5, 3],
      [pc("cain", "ranged-spellcaster", 12, 14), 12, 15],
    ]),
    options: {
      a: { steps: [{ kind: "begin", source: { kind: "sheet", capabilityId: "breath" } }, { kind: "effect", placement: drakeCone }, end] },
      b: { steps: [begin("attack"), { kind: "attack", attackId: claw, targetId: CATA }, end] },
    },
    answers: { pragmatic: "b" },
  },
  {
    // Control: derribar a Cata o zarpazo.
    id: "E10",
    actorId: DRAKE,
    encounter: encounter([
      [drakeDef(), 2, 2],
      [pc("cata", "melee-fighter", 16, 20), 5, 3],
      [pc("cain", "ranged-spellcaster", 12, 14), 12, 15],
    ]),
    options: {
      a: { steps: [{ kind: "begin", source: { kind: "sheet", capabilityId: "trip" } }, { kind: "effect", targetIds: [CATA] }, end] },
      b: { steps: [begin("attack"), { kind: "attack", attackId: claw, targetId: CATA }, end] },
    },
    answers: { pacifist: "b" },
  },
  {
    // Fuego amigo (2026-11-09, juicio evidente por delegación de la jugadora):
    // el único objetivo al alcance es un aliado; Cata está lejos.
    id: "E11",
    actorId: G,
    encounter: encounter([
      [goblinDef(G), 5, 5],
      [goblinDef(G2), 6, 5],
      [pc("cata", "melee-fighter", 16, 20), 5, 18],
    ]),
    options: {
      a: { steps: [begin("attack"), { kind: "attack", attackId: scimitar, targetId: G2 }, end] },
      b: { steps: [end] },
    },
    answers: { pragmatic: "b", aggressive: "b", pacifist: "b" },
  },
];

/** Rasgos de cada opción de un escenario, vistos por el actor (solo con su conocimiento). */
/** Estado creído, vista y puerto de simulación del actor del escenario. */
export function scenarioContext(scenario: Scenario): { readonly port: SimulationPort; readonly view: KnowledgeView } {
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
  return { port: createSimulationPort(e, view), view };
}

export function scenarioFeatures(scenario: Scenario): Record<string, FeatureVector> {
  const { port, view } = scenarioContext(scenario);
  const out: Record<string, FeatureVector> = {};
  for (const [option, plan] of Object.entries(allPlans(scenario))) {
    const simulation = simulatePlan(port, scenario.actorId, plan);
    if (!simulation.ok) throw new Error(`${scenario.id}${option}: paso ${simulation.failedStep} (${simulation.reason})`);
    out[option] = computeFeatures(port, view, scenario.actorId, simulation);
  }
  return out;
}

/**
 * Planes que encontró la búsqueda y que la jugadora juzgó por personalidad
 * (ronda a ronda): "chosen" sustituye a su respuesta, "worse" es peor que su
 * respuesta y "acceptable" vale tanto como ella (no restringe).
 */
type Verdict = "chosen" | "worse" | "acceptable";
interface JudgedPlan {
  readonly scenario: string;
  readonly key: string;
  readonly plan: Plan;
  readonly verdicts: Partial<Record<PersonalityId, Verdict>>;
}
const JUDGED: readonly JudgedPlan[] = (
  JSON.parse(readFileSync(join(__dirname, "judged-plans.json"), "utf8")) as { rounds: { plans: JudgedPlan[] }[] }
).rounds.flatMap((r) => r.plans);

export const judgedPlans = (scenario: Scenario): readonly JudgedPlan[] => JUDGED.filter((j) => j.scenario === scenario.id);

/** Todos los planes del escenario: las opciones escritas y los juzgados. */
export function allPlans(scenario: Scenario): Readonly<Record<string, Plan>> {
  return { ...scenario.options, ...Object.fromEntries(judgedPlans(scenario).map((j) => [j.key, j.plan])) };
}

/** Lo que decidió la jugadora para una personalidad: plan elegido, peores y equivalentes. */
export function comparisonsFor(
  scenario: Scenario,
  personality: PersonalityId,
): { readonly answer: string; readonly worse: readonly string[]; readonly acceptable: readonly string[] } | null {
  const original = scenario.answers[personality];
  if (original === undefined) return null;
  const judged = judgedPlans(scenario);
  const answer = judged.find((j) => j.verdicts[personality] === "chosen")?.key ?? original;
  const acceptable = judged.filter((j) => j.verdicts[personality] === "acceptable").map((j) => j.key);
  const worse = [
    ...Object.keys(scenario.options).filter((o) => o !== answer),
    ...judged.filter((j) => j.verdicts[personality] === "worse").map((j) => j.key),
  ];
  return { answer, worse, acceptable };
}

/** Casos de calibración de una personalidad. */
export function calibrationCases(personality: PersonalityId): CalibrationCase[] {
  return SCENARIOS.flatMap((scenario) => {
    const comparison = comparisonsFor(scenario, personality);
    if (comparison === null) return [];
    const features = scenarioFeatures(scenario);
    return [
      {
        id: scenario.id,
        chosen: features[comparison.answer]!,
        others: comparison.worse.map((option) => ({ id: option, features: features[option]! })),
      },
    ];
  });
}
