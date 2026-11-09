import type { AbilityId, AttackId, CreatureId, Encounter, Intention } from "../models";
import { buildKnowledgeView, observeLogEntries, observeState, priorsForPartyLevel } from "../perception";
import type { KnowledgeView } from "../perception";
import { applyTurnCommand, effectOperationOf, getTurnOptions } from "../rules";
import type {
  AttackInput,
  PlayerSaveInput,
  RandomSource,
  ReactionOpportunity,
  TurnCommand,
  TurnCommandResult,
  TurnLogEntry,
  TurnState,
} from "../rules";
import { decideReaction, difficultyProfileFor, personalityWeights, planCoordinatedTurn, publishIntention } from "../tactical-brain";
import type { DifficultyProfile, FeatureWeights, PlanStep, SimulationPort } from "../tactical-brain";
import { createSimulationPort } from "./simulation";

/**
 * CONTROLADOR DE COMBATE (etapa 6, TACTICAL_BRAIN_DESIGN.md §2): juega el
 * turno de un monstruo sobre el estado REAL, operación por operación.
 * - Al empezar (y cuando hace falta) planea el turno completo con el cerebro
 *   (solo con lo que su bando percibe) y publica las intenciones.
 * - Antes de cada operación la traduce a una opción legal AHORA
 *   (revalidación); si ya no lo es, replanifica.
 * - Después de cada operación actualiza la memoria del bando con lo
 *   percibido y replanifica si su dificultad lo pide o si pasó algo
 *   relevante.
 * - Decide las reacciones de los monstruos con el cerebro; cuando hace falta
 *   un dato del jugador (salvaciones, sus reacciones) se detiene y lo pide.
 * Los dados reales solo se usan al ejecutar órdenes (`RandomSource`).
 */

/** Lo que el controlador necesita del jugador para seguir. */
export type PlayerInputRequest =
  /** Salvaciones de personajes contra un efecto del monstruo (dados físicos). */
  | { readonly kind: "playerSaves"; readonly creatureIds: readonly CreatureId[]; readonly ability: AbilityId | null; readonly dc: number | null }
  /** Un personaje puede reaccionar (ataque de oportunidad o reacción de ficha). */
  | { readonly kind: "playerReaction"; readonly opportunity: ReactionOpportunity }
  /** Salvación pendiente de un personaje (regla casera Daño masivo). */
  | { readonly kind: "playerPendingSave"; readonly creatureId: CreatureId };

/** Respuesta del jugador a una petición. */
export type PlayerInput =
  | { readonly kind: "playerSaves"; readonly saves: Readonly<Record<string, PlayerSaveInput>> }
  | {
      readonly kind: "playerReaction";
      readonly reactorId: CreatureId;
      readonly take: boolean;
      readonly attackId?: AttackId;
      readonly targetId?: CreatureId;
      readonly attackInput?: AttackInput;
    }
  | { readonly kind: "playerPendingSave"; readonly creatureId: CreatureId; readonly playerSave: PlayerSaveInput };

/** Registro de lo que hizo el controlador (para mostrarlo o depurarlo). */
export type ControllerEvent =
  | { readonly kind: "planned"; readonly steps: readonly PlanStep[]; readonly reason: ReplanReason }
  | { readonly kind: "executed"; readonly command: TurnCommand }
  | { readonly kind: "stepRejected"; readonly step: PlanStep; readonly reasonCode: string }
  | { readonly kind: "reactionDecided"; readonly reactorId: CreatureId; readonly take: boolean }
  | { readonly kind: "gaveUp" };

export type ReplanReason = "turnStart" | "afterOperation" | "relevantEvent" | "stepNotLegal";

export interface MonsterTurnSession {
  readonly actorId: CreatureId;
  readonly encounter: Encounter;
  readonly turn: TurnState;
  /** Pasos que faltan del plan vigente (null: hay que planear). */
  readonly remaining: readonly PlanStep[] | null;
  readonly replanReason: ReplanReason;
  /** Replanificaciones en este turno (tope de seguridad). */
  readonly replans: number;
  readonly events: readonly ControllerEvent[];
}

export type MonsterTurnStatus =
  | { readonly status: "running"; readonly session: MonsterTurnSession }
  | { readonly status: "awaitingPlayer"; readonly session: MonsterTurnSession; readonly request: PlayerInputRequest }
  | { readonly status: "ended"; readonly session: MonsterTurnSession }
  | {
      readonly status: "error";
      readonly session: MonsterTurnSession;
      /** stuck: no hay plan posible y el motor no deja terminar el turno (p. ej. en un espacio ocupado). */
      readonly reason: "partyLevelRequired" | "notAMonster" | "stuck";
    };

/** Tope de replanificaciones en un turno: evita bucles si el estado no avanza. */
const MAX_REPLANS = 20;

/** Lo que el cerebro necesita para pensar por una criatura en el estado real actual. */
export interface CreatureBrain {
  readonly view: KnowledgeView;
  readonly port: SimulationPort;
  readonly weights: FeatureWeights;
  readonly profile: DifficultyProfile;
}

/** Monta el cerebro de un monstruo (solo con lo que percibe su bando). null si falta el nivel del grupo. */
export function brainFor(encounter: Encounter, creatureId: CreatureId): CreatureBrain | null {
  const record = encounter.combatants[creatureId];
  const level = encounter.brainSettings.partyLevel;
  if (!record || record.definition.kind !== "monster" || level === null) return null;
  const view = buildKnowledgeView(encounter, creatureId, priorsForPartyLevel(level));
  return {
    view,
    port: createSimulationPort(encounter, view),
    weights: personalityWeights(record.definition.personality),
    profile: difficultyProfileFor(encounter.brainSettings, creatureId),
  };
}

/** Empieza a controlar el turno (ya empezado con `advanceTurn` o `beginCreatureTurn`). */
export function startMonsterTurn(encounter: Encounter, turn: TurnState): MonsterTurnSession {
  return {
    actorId: turn.actorId,
    encounter: observeState(encounter),
    turn,
    remaining: null,
    replanReason: "turnStart",
    replans: 0,
    events: [],
  };
}

/** Juega hasta que el turno termina o hace falta un dato del jugador. */
export function runMonsterTurn(session: MonsterTurnSession, dice: RandomSource, input?: PlayerInput): MonsterTurnStatus {
  let status = stepMonsterTurn(session, dice, input);
  // Cada paso aplica una orden o replanifica; el tope de replanificaciones y
  // el fin del turno garantizan que termina.
  while (status.status === "running") status = stepMonsterTurn(status.session, dice);
  return status;
}

/** Un paso del controlador: resolver una reacción, planear o ejecutar una operación. */
export function stepMonsterTurn(session: MonsterTurnSession, dice: RandomSource, input?: PlayerInput): MonsterTurnStatus {
  const { encounter, turn } = session;
  const actor = encounter.combatants[session.actorId];
  if (!actor || actor.definition.kind !== "monster") return { status: "error", session, reason: "notAMonster" };
  if (encounter.brainSettings.partyLevel === null) return { status: "error", session, reason: "partyLevelRequired" };

  // 1. Reacciones pendientes (de monstruos: las decide el cerebro; de jugadores: se piden).
  const reaction = turn.pendingReactions[0];
  if (reaction) {
    const reactor = encounter.combatants[reaction.reactorId];
    if (reactor?.definition.kind === "monster") {
      const decided = monsterReactionCommand(encounter, reaction);
      return afterCommand(session, decided.command, dice, [{ kind: "reactionDecided", reactorId: reaction.reactorId, take: decided.command.take }]);
    }
    if (input?.kind === "playerReaction" && input.reactorId === reaction.reactorId) {
      const command: TurnCommand = {
        kind: "resolveReaction",
        reactorId: input.reactorId,
        take: input.take,
        ...(input.attackId === undefined ? {} : { attackId: input.attackId }),
        ...(input.targetId === undefined ? {} : { targetId: input.targetId }),
        ...(input.attackInput === undefined ? {} : { attackInput: input.attackInput }),
      };
      return afterCommand(session, command, dice);
    }
    return { status: "awaitingPlayer", session, request: { kind: "playerReaction", opportunity: reaction } };
  }

  // 2. Salvaciones pendientes de jugadores (Daño masivo).
  const pendingSave = turn.pendingSaves[0];
  if (pendingSave) {
    if (input?.kind === "playerPendingSave" && input.creatureId === pendingSave.creatureId) {
      return afterCommand(session, { kind: "resolvePendingSave", creatureId: pendingSave.creatureId, playerSave: input.playerSave }, dice);
    }
    return { status: "awaitingPlayer", session, request: { kind: "playerPendingSave", creatureId: pendingSave.creatureId } };
  }

  if (turn.ended) return { status: "ended", session };

  // 3. Planear si no hay plan (o se pidió replanificar).
  if (session.remaining === null || session.remaining.length === 0) {
    if (session.replans >= MAX_REPLANS) return giveUp(session, dice);
    const brain = brainFor(encounter, session.actorId)!;
    const coordinated = planCoordinatedTurn(
      brain.port,
      brain.view,
      session.actorId,
      brain.weights,
      brain.profile,
      personalityWeights,
      { state: brain.port.belief, turn },
    );
    if (!coordinated) return giveUp(session, dice);
    const published = coordinated.intentions.reduce((e: Encounter, i: Intention) => publishIntention(e, i), encounter);
    return {
      status: "running",
      session: {
        ...session,
        encounter: published,
        remaining: coordinated.decision.best.plan.steps,
        replans: session.replans + 1,
        events: [...session.events, { kind: "planned", steps: coordinated.decision.best.plan.steps, reason: session.replanReason }],
      },
    };
  }

  // 4. Ejecutar el siguiente paso, revalidado contra el estado real.
  const step = session.remaining[0]!;
  const command = commandForStep(encounter, turn, step, input?.kind === "playerSaves" ? input.saves : undefined);
  if (command === null) return replan(session, step, "noMatchingOption");
  const result = applyTurnCommand(encounter, turn, command, dice);
  if (!result.ok && result.reasonCode === "playerSavesRequired") {
    const key = command.kind === "chooseOption" ? command.key : "";
    const operation = effectOperationOf(encounter, turn, key);
    const save = operation?.save;
    return {
      status: "awaitingPlayer",
      session,
      request: {
        kind: "playerSaves",
        creatureIds: result.creatureIds ?? [],
        ability: save?.ability ?? null,
        dc: save && typeof save.dc === "number" ? save.dc : null,
      },
    };
  }
  if (!result.ok) return replan(session, step, result.reasonCode);
  return afterResult(session, command, result, session.remaining.slice(1));
}

/**
 * Reacciones de monstruos mientras actúa otro (p. ej. el turno de un
 * jugador): resuelve con el cerebro las de los monstruos que encabezan la
 * cola y se detiene en la primera de un jugador (o cuando no queda ninguna).
 */
export function resolveMonsterReactions(
  encounter: Encounter,
  turn: TurnState,
  dice: RandomSource,
): { readonly encounter: Encounter; readonly turn: TurnState; readonly decisions: readonly { reactorId: CreatureId; take: boolean }[] } {
  let state = encounter;
  let current = turn;
  const decisions: { reactorId: CreatureId; take: boolean }[] = [];
  for (;;) {
    const reaction = current.pendingReactions[0];
    if (!reaction || state.combatants[reaction.reactorId]?.definition.kind !== "monster") break;
    if (state.brainSettings.partyLevel === null) break;
    const { command } = monsterReactionCommand(state, reaction);
    const result = applyTurnCommand(state, current, command, dice);
    if (!result.ok) break;
    decisions.push({ reactorId: reaction.reactorId, take: command.take });
    state = observeLogEntries(result.encounter, current.actorId, result.turn.log.slice(current.log.length));
    current = result.turn;
  }
  return { encounter: state, turn: current, decisions };
}

// ---------------------------------------------------------------------------

function monsterReactionCommand(
  encounter: Encounter,
  reaction: ReactionOpportunity,
): { readonly command: Extract<TurnCommand, { kind: "resolveReaction" }> } {
  const brain = brainFor(encounter, reaction.reactorId);
  const decision = brain ? decideReaction(brain.port, brain.view, reaction, brain.weights) : null;
  return {
    command: decision
      ? { kind: "resolveReaction", reactorId: reaction.reactorId, take: true, attackId: decision.attackId, targetId: decision.targetId }
      : { kind: "resolveReaction", reactorId: reaction.reactorId, take: false },
  };
}

/** Traduce un paso del plan a una orden legal AHORA en el estado real (null si ya no hay opción). */
function commandForStep(
  encounter: Encounter,
  turn: TurnState,
  step: PlanStep,
  playerSaves?: Readonly<Record<string, PlayerSaveInput>>,
): TurnCommand | null {
  const options = getTurnOptions(encounter, turn);
  switch (step.kind) {
    case "move":
      return { kind: "move", path: step.path };
    case "begin":
      return { kind: "beginCapability", source: step.source };
    case "end":
      return { kind: "endTurn" };
    case "forfeit":
      return { kind: "forfeitRemaining" };
    case "standUp":
      return { kind: "standUp" };
    case "surrender":
      return { kind: "surrender" };
    case "escape":
      return { kind: "escapeGrapple", grapplerId: step.grapplerId };
    case "effect": {
      const option = options.executionOptions.find((o) => o.choice.kind === "effect");
      if (!option) return null;
      return {
        kind: "chooseOption",
        key: option.key,
        effectInput: {
          ...(step.targetIds ? { targetIds: step.targetIds } : {}),
          ...(step.placement ? { placement: step.placement } : {}),
          ...(playerSaves ? { playerSaves } : {}),
        },
      };
    }
    case "attack":
    case "standardAction":
    case "finish": {
      const option = options.executionOptions.find((o) => {
        if (step.kind === "attack") return o.choice.kind === "attack" && o.choice.attackId === step.attackId && o.choice.targetId === step.targetId;
        if (step.kind === "standardAction") return o.choice.kind === "standardAction" && o.choice.action === step.action;
        return o.choice.kind === "finish";
      });
      return option ? { kind: "chooseOption", key: option.key } : null;
    }
  }
}

function afterCommand(session: MonsterTurnSession, command: TurnCommand, dice: RandomSource, extra: readonly ControllerEvent[] = []): MonsterTurnStatus {
  const result = applyTurnCommand(session.encounter, session.turn, command, dice);
  if (!result.ok) {
    // La respuesta no era válida: se vuelve a pedir (la sesión no cambia).
    const request = session.turn.pendingReactions[0];
    if (request) return { status: "awaitingPlayer", session, request: { kind: "playerReaction", opportunity: request } };
    const pending = session.turn.pendingSaves[0];
    if (pending) return { status: "awaitingPlayer", session, request: { kind: "playerPendingSave", creatureId: pending.creatureId } };
    return replan(session, { kind: "end" }, result.reasonCode);
  }
  return afterResult({ ...session, events: [...session.events, ...extra] }, command, result, session.remaining);
}

/** Tras una orden aceptada: memoria del bando y decisión de replanificar. */
function afterResult(
  session: MonsterTurnSession,
  command: TurnCommand,
  result: Extract<TurnCommandResult, { ok: true }>,
  remaining: readonly PlanStep[] | null,
): MonsterTurnStatus {
  const entries = result.turn.log.slice(session.turn.log.length);
  const encounter = observeLogEntries(result.encounter, session.actorId, entries);
  const profile = difficultyProfileFor(encounter.brainSettings, session.actorId);
  const relevant = isRelevant(session, entries);
  const keepPlan = remaining !== null && remaining.length > 0 && !profile.replanAfterEachOperation && !relevant;
  const next: MonsterTurnSession = {
    ...session,
    encounter,
    turn: result.turn,
    remaining: keepPlan ? remaining : null,
    replanReason: profile.replanAfterEachOperation ? "afterOperation" : "relevantEvent",
    events: [...session.events, { kind: "executed", command }],
  };
  return { status: result.turn.ended && result.turn.pendingReactions.length === 0 && result.turn.pendingSaves.length === 0 ? "ended" : "running", session: next };
}

/**
 * Eventos que obligan a replanificar (TACTICAL_BRAIN_DESIGN.md §2; PROPUESTA,
 * decisión 113): una criatura cae o muere por un ataque o efecto, el actor
 * recibe daño o una condición de una reacción, se interrumpe un movimiento,
 * o hay una comprobación de Moral o un Daño masivo. Un ataque que falla no
 * replanifica por sí solo (el plan ya contaba con esa probabilidad).
 */
function isRelevant(session: MonsterTurnSession, entries: readonly TurnLogEntry[]): boolean {
  for (const entry of entries) {
    if (entry.kind === "movementStopped") return true;
    if (entry.kind === "attackResolved" && entry.targetLifeStateAfter !== "alive") return true;
    if ((entry.kind === "opportunityAttack" || entry.kind === "sheetReactionTaken") && entry.attack.targetId === session.actorId) {
      if (entry.attack.damageApplied > 0 || (entry.attack.conditionsApplied ?? []).length > 0) return true;
    }
    if (entry.kind === "effectResolved" && entry.targets.some((t) => t.lifeStateAfter !== "alive")) return true;
    if (entry.kind === "moraleCheck" || entry.kind === "massiveDamage") return true;
  }
  return false;
}

function replan(session: MonsterTurnSession, step: PlanStep, reasonCode: string): MonsterTurnStatus {
  return {
    status: "running",
    session: {
      ...session,
      remaining: null,
      replanReason: "stepNotLegal",
      events: [...session.events, { kind: "stepRejected", step, reasonCode }],
    },
  };
}

/** Sin plan posible: renuncia a lo que quede y termina el turno. */
function giveUp(session: MonsterTurnSession, dice: RandomSource): MonsterTurnStatus {
  let { encounter, turn } = session;
  const events: ControllerEvent[] = [...session.events, { kind: "gaveUp" }];
  for (const command of [{ kind: "forfeitRemaining" }, { kind: "endTurn" }] as const) {
    if (command.kind === "forfeitRemaining" && turn.execution === null) continue;
    const result = applyTurnCommand(encounter, turn, command, dice);
    if (!result.ok) break;
    encounter = result.encounter;
    turn = result.turn;
    events.push({ kind: "executed", command });
  }
  const next = { ...session, encounter, turn, remaining: [], events };
  return turn.ended ? { status: "ended", session: next } : { status: "error", session: next, reason: "stuck" };
}
