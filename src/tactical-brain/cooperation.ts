import type { CreatureId, Encounter, Intention, PersonalityId } from "../models";
import type { KnowledgeView } from "../perception";
import type { DifficultyProfile } from "./difficulty";
import type { CooperationContext, FeatureWeights } from "./features";
import { asPlanSimulation, continueSimulation, startSimulation } from "./plan";
import type { PlanSimulation } from "./plan";
import { planTurn } from "./planner";
import type { PlanDecision, PlanningStart } from "./planner";
import type { SimulationPort } from "./simulation";

/**
 * COOPERACIÓN (etapa 5, TACTICAL_BRAIN_DESIGN.md §7). Cada monstruo publica
 * su intención en la pizarra del bando; los demás la usan según la
 * coordinación de su dificultad:
 * - "limited": no mira la pizarra;
 * - "considersAllies": usa las intenciones de los aliados que actúan después
 *   que él en este asalto;
 * - "plansCooperation": además planea tentativamente a esos aliados (en
 *   orden de iniciativa, cada uno con su personalidad) y replanifica con sus
 *   intenciones (una ronda de respuesta mutua; PROPUESTA, decisión 110).
 * Todo es determinista.
 */

/** Intención medida de un plan simulado. */
export function intentionOf(actorId: CreatureId, simulation: Extract<PlanSimulation, { ok: true }>, tentative: boolean): Intention {
  const damage: Record<string, number> = {};
  for (const attack of simulation.attacks) damage[attack.targetId] = (damage[attack.targetId] ?? 0) + attack.odds.expectedDamage;
  for (const effect of simulation.effects) {
    for (const t of effect.targets) damage[t.targetId] = (damage[t.targetId] ?? 0) + t.expectedDamage;
  }
  const me = simulation.final.combatants[actorId];
  if (!me) throw new Error(`Actor desconocido: ${actorId}`);
  return { creatureId: actorId, round: simulation.final.round, finalPosition: me.state.position, expectedDamageByTarget: damage, tentative };
}

/** Publica (o sustituye) la intención de una criatura en la pizarra de su bando. */
export function publishIntention(encounter: Encounter, intention: Intention): Encounter {
  const record = encounter.combatants[intention.creatureId];
  if (!record) return encounter;
  const board = encounter.sideIntentions[record.side]?.intentions ?? {};
  return {
    ...encounter,
    sideIntentions: { ...encounter.sideIntentions, [record.side]: { intentions: { ...board, [intention.creatureId]: intention } } },
  };
}

/**
 * Aliados que actúan después de `actorId` y antes de su próximo turno: los
 * que le siguen en la iniciativa de este asalto. Sin iniciativa (fuera de
 * combate o en pruebas), todos los aliados.
 */
export function alliesActingAfter(state: Encounter, actorId: CreatureId): CreatureId[] {
  const me = state.combatants[actorId];
  if (!me) return [];
  const isAlly = (id: CreatureId): boolean =>
    id !== actorId && state.combatants[id]?.side === me.side && state.combatants[id]?.state.lifeState === "alive";
  const order = state.initiativeOrder;
  const index = order.indexOf(actorId);
  if (index < 0) return (Object.keys(state.combatants).sort() as CreatureId[]).filter(isAlly);
  return order.slice(index + 1).filter(isAlly);
}

/** Contexto de cooperación a partir de la pizarra (solo intenciones de este asalto). */
export function cooperationFromBoard(state: Encounter, actorId: CreatureId): CooperationContext {
  const me = state.combatants[actorId];
  const board = me ? (state.sideIntentions[me.side]?.intentions ?? {}) : {};
  const allyDamageByTarget: Record<string, number> = {};
  const allyPositions: Record<string, Intention["finalPosition"]> = {};
  for (const allyId of alliesActingAfter(state, actorId)) {
    const intention = board[allyId];
    if (!intention || intention.round !== state.round) continue;
    allyPositions[allyId] = intention.finalPosition;
    for (const [targetId, damage] of Object.entries(intention.expectedDamageByTarget)) {
      allyDamageByTarget[targetId] = (allyDamageByTarget[targetId] ?? 0) + damage;
    }
  }
  return { allyDamageByTarget, allyPositions };
}

export interface CoordinatedDecision {
  readonly decision: PlanDecision;
  /** Intenciones a publicar: la del actor y, con "plansCooperation", las tentativas de sus aliados. */
  readonly intentions: readonly Intention[];
}

/**
 * Planifica el turno de `actorId` con la coordinación de su dificultad.
 * `weightsOf` da los pesos de la personalidad de cada aliado (para planearlos).
 */
export function planCoordinatedTurn(
  port: SimulationPort,
  view: KnowledgeView,
  actorId: CreatureId,
  weights: FeatureWeights,
  profile: DifficultyProfile,
  weightsOf: (personality: PersonalityId) => FeatureWeights,
  start?: PlanningStart,
): CoordinatedDecision | null {
  const state = start?.state ?? port.belief;
  const plan = (board: Encounter): PlanDecision | null =>
    planTurn(port, view, actorId, weights, profile.search, start ? { ...start, state: board } : { state: board, turn: port.startTurn(board, actorId) }, cooperationFromBoard(board, actorId));
  const intentionFor = (id: CreatureId, decision: PlanDecision, from: Encounter, turn: PlanningStart["turn"], tentative: boolean): Intention | null => {
    const simulated = continueSimulation(port, id, startSimulation(port, id, from, turn), decision.best.plan.steps);
    return simulated.ok ? intentionOf(id, asPlanSimulation(simulated.partial), tentative) : null;
  };

  if (profile.coordination === "limited") {
    const decision = planTurn(port, view, actorId, weights, profile.search, start);
    if (!decision) return null;
    const own = intentionFor(actorId, decision, state, start?.turn ?? port.startTurn(state, actorId), false);
    return { decision, intentions: own ? [own] : [] };
  }

  const first = plan(state);
  if (!first) return null;
  const firstTurn = start?.turn ?? port.startTurn(state, actorId);
  const firstIntention = intentionFor(actorId, first, state, firstTurn, false);
  if (profile.coordination === "considersAllies" || firstIntention === null) {
    return { decision: first, intentions: firstIntention ? [firstIntention] : [] };
  }

  // "plansCooperation": cada aliado siguiente planea sobre el estado que deja el anterior.
  const tentative: Intention[] = [];
  let board = publishIntention(state, firstIntention);
  let after = continueSimulation(port, actorId, startSimulation(port, actorId, state, firstTurn), first.best.plan.steps);
  let world = after.ok ? after.partial.state : state;
  for (const allyId of alliesActingAfter(state, actorId)) {
    const ally = world.combatants[allyId];
    if (!ally || ally.definition.kind !== "monster") continue;
    const allyStart = { state: { ...world, sideIntentions: board.sideIntentions }, turn: port.startTurn(world, allyId) };
    const decision = planTurn(port, view, allyId, weightsOf(ally.definition.personality), profile.search, allyStart, cooperationFromBoard(allyStart.state, allyId));
    if (!decision) continue;
    const intention = intentionFor(allyId, decision, allyStart.state, allyStart.turn, true);
    if (!intention) continue;
    tentative.push(intention);
    board = publishIntention(board, intention);
    after = continueSimulation(port, allyId, startSimulation(port, allyId, allyStart.state, allyStart.turn), decision.best.plan.steps);
    if (after.ok) world = after.partial.state;
  }
  // Replanifica con las intenciones tentativas de quienes actúan después.
  const final = plan({ ...state, sideIntentions: board.sideIntentions }) ?? first;
  const own = intentionFor(actorId, final, state, firstTurn, false);
  return { decision: final, intentions: [...(own ? [own] : []), ...tentative] };
}
