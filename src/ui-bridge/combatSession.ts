import type { CreatureId, Encounter, GridPosition } from "../models";
import {
  advanceTurn,
  applyTurnCommand,
  getTurnOptions,
  reachableSquares,
  recordDeathSave,
  rollMonsterInitiative,
  startCombat,
  validatePlacement,
} from "../rules";
import type {
  DeathSaveResult,
  MonsterInitiativeRoll,
  PlacementReason,
  RandomSource,
  ReachableSquare,
  TurnCommand,
  TurnCommandError,
  TurnLogEntry,
  TurnOptions,
  TurnState,
} from "../rules";
import { resolveMonsterReactions, runMonsterTurn, startMonsterTurn } from "../combat-controller";
import type { ControllerEvent, MonsterTurnSession, MonsterTurnStatus, PlayerInput, PlayerInputRequest } from "../combat-controller";

/**
 * SESIÓN DE COMBATE para la pantalla de Combate: despliegue, iniciativa,
 * turnos de personajes (órdenes del jugador, validadas por el motor) y de
 * monstruos (cerebro), peticiones al jugador, salvaciones contra la muerte y
 * fin del combate. Todo es un DATO serializable (`CombatSnapshot`): cada
 * función devuelve una sesión nueva. Sin reglas propias: delega en `rules` y
 * `combat-controller`.
 */

export type CombatPhase = "deployment" | "initiative" | "turn" | "finished";
export type CombatOutcome = "victory" | "defeat";

export type SessionLogItem =
  | { readonly kind: "deploymentDone" }
  | { readonly kind: "monsterInitiative"; readonly rolls: readonly MonsterInitiativeRoll[] }
  | { readonly kind: "combatStarted"; readonly order: readonly CreatureId[] }
  | { readonly kind: "turnStarted"; readonly actorId: CreatureId; readonly skipped: readonly CreatureId[] }
  | { readonly kind: "turnLog"; readonly actorId: CreatureId; readonly entry: TurnLogEntry }
  | { readonly kind: "brain"; readonly actorId: CreatureId; readonly event: ControllerEvent }
  | { readonly kind: "monsterReaction"; readonly reactorId: CreatureId; readonly take: boolean }
  | { readonly kind: "deathSave"; readonly creatureId: CreatureId; readonly d20: number; readonly result: DeathSaveResult }
  | { readonly kind: "combatEnded"; readonly outcome: CombatOutcome };

export interface SessionLogEntry {
  readonly round: number;
  readonly item: SessionLogItem;
}

export const COMBAT_SNAPSHOT_VERSION = 1 as const;

export interface CombatSnapshot {
  readonly version: typeof COMBAT_SNAPSHOT_VERSION;
  readonly encounter: Encounter;
  readonly phase: CombatPhase;
  /** Turno en curso (null antes del primero). */
  readonly turn: TurnState | null;
  /** Turno de monstruo esperando un dato del jugador. */
  readonly monsterSession: MonsterTurnSession | null;
  readonly pending: PlayerInputRequest | null;
  /** Iniciativa tirada de los monstruos (fase de iniciativa). */
  readonly monsterInitiative: Readonly<Record<string, number>> | null;
  readonly outcome: CombatOutcome | null;
  readonly log: readonly SessionLogEntry[];
}

export type SessionResult<E extends string> =
  | { readonly ok: true; readonly session: CombatSnapshot }
  | { readonly ok: false; readonly reason: E; readonly detail?: unknown };

export function startSession(encounter: Encounter): CombatSnapshot {
  return {
    version: COMBAT_SNAPSHOT_VERSION,
    encounter,
    phase: "deployment",
    turn: null,
    monsterSession: null,
    pending: null,
    monsterInitiative: null,
    outcome: null,
    log: [],
  };
}

const append = (s: CombatSnapshot, ...items: SessionLogItem[]): SessionLogEntry[] => [
  ...s.log,
  ...items.map((item) => ({ round: s.encounter.round, item })),
];

// ---------------------------------------------------------------------------
// Despliegue
// ---------------------------------------------------------------------------

/** Recoloca una criatura antes de la iniciativa (la colocación la valida el motor). */
export function redeploy(s: CombatSnapshot, creatureId: CreatureId, position: GridPosition): SessionResult<"wrongPhase" | "unknownCreature" | PlacementReason> {
  if (s.phase !== "deployment") return { ok: false, reason: "wrongPhase" };
  const record = s.encounter.combatants[creatureId];
  if (!record) return { ok: false, reason: "unknownCreature" };
  const check = validatePlacement(s.encounter, position, record.definition.size, { ignoreCreatureId: creatureId });
  if (!check.valid) return { ok: false, reason: check.reason };
  const encounter = { ...s.encounter, combatants: { ...s.encounter.combatants, [creatureId]: { ...record, state: { ...record.state, position } } } };
  return { ok: true, session: { ...s, encounter } };
}

/**
 * Termina el despliegue y tira la iniciativa de los monstruos. Las criaturas
 * de la misma ficha comparten tirada (PROPUESTA, decisión 118: el DM decide
 * los grupos; se agrupan por ficha).
 */
export function rollInitiative(s: CombatSnapshot, dice: RandomSource): SessionResult<"wrongPhase" | "initiativeBonusUnknown"> {
  if (s.phase !== "deployment") return { ok: false, reason: "wrongPhase" };
  const groups = new Map<string, CreatureId[]>();
  for (const record of Object.values(s.encounter.combatants).sort((a, b) => (a.definition.id < b.definition.id ? -1 : 1))) {
    if (record.definition.kind !== "monster") continue;
    const key = record.definition.id.replace(/-\d+$/, "");
    groups.set(key, [...(groups.get(key) ?? []), record.definition.id]);
  }
  const rolled = rollMonsterInitiative(s.encounter, [...groups.values()], dice);
  if (!rolled.ok) return { ok: false, reason: "initiativeBonusUnknown", detail: rolled.creatureIds };
  return {
    ok: true,
    session: { ...s, phase: "initiative", monsterInitiative: rolled.totals, log: append(s, { kind: "deploymentDone" }, { kind: "monsterInitiative", rolls: rolled.rolls }) },
  };
}

/**
 * Empieza el combate con las iniciativas de los personajes (dados físicos) y
 * juega hasta el primer turno de un personaje o una petición.
 */
export function beginCombat(
  s: CombatSnapshot,
  playerTotals: Readonly<Record<string, number>>,
  tieOrder: readonly CreatureId[],
  dice: RandomSource,
): SessionResult<"wrongPhase" | "missingInitiative" | "tiesUndecided"> {
  if (s.phase !== "initiative" || s.monsterInitiative === null) return { ok: false, reason: "wrongPhase" };
  const totals = { ...s.monsterInitiative, ...playerTotals };
  // Los monstruos de un mismo grupo comparten tirada: entre ellos no hay
  // empate que decidir (se ordenan por id). Solo se piden los empates reales.
  const auto = sameGroupTies(s.encounter, totals);
  const started = startCombat(s.encounter, totals, [...tieOrder, ...auto.filter((id) => !tieOrder.includes(id))]);
  if (!started.ok) {
    return started.reason === "missingInitiative"
      ? { ok: false, reason: "missingInitiative", detail: started.creatureIds }
      : { ok: false, reason: "tiesUndecided", detail: started.ties };
  }
  const session: CombatSnapshot = {
    ...s,
    encounter: started.encounter,
    phase: "turn",
    log: append({ ...s, encounter: started.encounter }, { kind: "combatStarted", order: started.encounter.initiativeOrder }),
  };
  return { ok: true, session: nextTurn(session, dice) };
}

/** Empates formados solo por monstruos del mismo grupo de iniciativa (misma ficha). */
function sameGroupTies(encounter: Encounter, totals: Readonly<Record<string, number>>): CreatureId[] {
  const byTotal = new Map<number, CreatureId[]>();
  for (const id of Object.keys(totals).sort() as CreatureId[]) byTotal.set(totals[id]!, [...(byTotal.get(totals[id]!) ?? []), id]);
  return [...byTotal.values()].flatMap((group) => {
    if (group.length < 2) return [];
    const keys = new Set(group.map((id) => (encounter.combatants[id]?.definition.kind === "monster" ? id.replace(/-\d+$/, "") : `pc:${id}`)));
    return keys.size === 1 ? group : [];
  });
}

// ---------------------------------------------------------------------------
// Turnos
// ---------------------------------------------------------------------------

/** ¿Puede pasarse al turno siguiente? */
export function canAdvance(s: CombatSnapshot): boolean {
  return s.phase === "turn" && s.pending === null && (s.turn === null || s.turn.ended);
}

/**
 * Pasa al turno siguiente. Si es de un monstruo, lo juega el cerebro hasta
 * terminar o hasta que haga falta un dato del jugador.
 */
export function nextTurn(s: CombatSnapshot, dice: RandomSource): CombatSnapshot {
  if (!canAdvance(s)) return s;
  const advanced = advanceTurn(s.encounter, s.turn, dice);
  if (!advanced.ok) return s;
  let session: CombatSnapshot = {
    ...s,
    encounter: advanced.encounter,
    turn: advanced.turn,
    log: append({ ...s, encounter: advanced.encounter }, { kind: "turnStarted", actorId: advanced.turn.actorId, skipped: advanced.skipped }, ...advanced.moraleChecks.map((check) => ({ kind: "turnLog" as const, actorId: advanced.turn.actorId, entry: { kind: "moraleCheck" as const, check } }))),
  };
  const actor = session.encounter.combatants[advanced.turn.actorId];
  if (actor?.definition.kind === "monster") {
    session = absorbMonster(session, runMonsterTurn(startMonsterTurn(session.encounter, advanced.turn), dice));
  }
  return withOutcome(session);
}

/** Responde a la petición pendiente del turno de un monstruo y sigue. */
export function respond(s: CombatSnapshot, input: PlayerInput, dice: RandomSource): CombatSnapshot {
  if (s.monsterSession === null) return s;
  return withOutcome(absorbMonster(s, runMonsterTurn(s.monsterSession, dice, input)));
}

function absorbMonster(s: CombatSnapshot, status: MonsterTurnStatus): CombatSnapshot {
  const previous = s.monsterSession ?? startMonsterTurn(s.encounter, s.turn!);
  const actorId = status.session.actorId;
  const newEntries = status.session.turn.log.slice(previous.turn.log.length);
  const newEvents = status.session.events.slice(previous.events.length);
  const items: SessionLogItem[] = [
    ...newEvents.filter((e) => e.kind !== "executed").map((event) => ({ kind: "brain" as const, actorId, event })),
    ...newEntries.map((entry) => ({ kind: "turnLog" as const, actorId, entry })),
  ];
  const waiting = status.status === "awaitingPlayer";
  return {
    ...s,
    encounter: status.session.encounter,
    turn: status.session.turn,
    monsterSession: waiting ? status.session : null,
    pending: waiting ? status.request : null,
    log: append({ ...s, encounter: status.session.encounter }, ...items),
  };
}

/** Lo que la pantalla necesita para el turno de un personaje. */
export interface PlayerTurnView {
  readonly actorId: CreatureId;
  readonly options: TurnOptions;
  /** Casillas a las que puede moverse ahora, con su ruta y coste. */
  readonly reachable: readonly ReachableSquare[];
  /** A 0 PG haciendo salvaciones contra la muerte: anota el d20 y termina el turno. */
  readonly dying: boolean;
}

export function playerTurnView(s: CombatSnapshot): PlayerTurnView | null {
  const turn = s.turn;
  if (s.phase !== "turn" || turn === null || turn.ended || s.pending !== null) return null;
  const actor = s.encounter.combatants[turn.actorId];
  if (!actor || actor.definition.kind !== "playerCharacter") return null;
  return {
    actorId: turn.actorId,
    options: getTurnOptions(s.encounter, turn),
    reachable: turn.pendingReactions.length > 0 ? [] : reachableSquares(s.encounter, turn),
    dying: actor.state.lifeState === "dying",
  };
}

/**
 * Orden de un personaje (el motor la valida). Después, las reacciones de los
 * monstruos las decide el cerebro.
 */
export function playerCommand(s: CombatSnapshot, command: TurnCommand, dice: RandomSource): SessionResult<TurnCommandError | "notPlayerTurn"> {
  const view = playerTurnView(s);
  if (view === null || s.turn === null) return { ok: false, reason: "notPlayerTurn" };
  const result = applyTurnCommand(s.encounter, s.turn, command, dice);
  if (!result.ok) return { ok: false, reason: result.reasonCode, detail: result };
  const entries = result.turn.log.slice(s.turn.log.length);
  let session: CombatSnapshot = {
    ...s,
    encounter: result.encounter,
    turn: result.turn,
    log: append({ ...s, encounter: result.encounter }, ...entries.map((entry) => ({ kind: "turnLog" as const, actorId: view.actorId, entry }))),
  };
  if (result.turn.pendingReactions.length > 0) {
    const before = result.turn.log.length;
    const reacted = resolveMonsterReactions(result.encounter, result.turn, dice);
    session = {
      ...session,
      encounter: reacted.encounter,
      turn: reacted.turn,
      log: append(
        { ...session, encounter: reacted.encounter },
        ...reacted.decisions.map((d) => ({ kind: "monsterReaction" as const, reactorId: d.reactorId, take: d.take })),
        ...reacted.turn.log.slice(before).map((entry) => ({ kind: "turnLog" as const, actorId: view.actorId, entry })),
      ),
    };
  }
  return { ok: true, session: withOutcome(session) };
}

/** Salvación contra la muerte del personaje del turno (d20 físico); termina su turno. */
export function deathSave(s: CombatSnapshot, d20: number, dice: RandomSource): SessionResult<"notDying" | "invalidRoll" | "notPlayerTurn"> {
  const view = playerTurnView(s);
  if (view === null || s.turn === null) return { ok: false, reason: "notPlayerTurn" };
  const saved = recordDeathSave(s.encounter, view.actorId, d20);
  if ("error" in saved) return { ok: false, reason: saved.error };
  const ended = applyTurnCommand(saved.encounter, s.turn, { kind: "endTurn" }, dice);
  const session: CombatSnapshot = {
    ...s,
    encounter: ended.ok ? ended.encounter : saved.encounter,
    turn: ended.ok ? ended.turn : s.turn,
    log: append(s, { kind: "deathSave", creatureId: view.actorId, d20, result: saved.result }),
  };
  return { ok: true, session: withOutcome(session) };
}

/**
 * Fin del combate (PROPUESTA, decisión 119): victoria si ningún monstruo
 * sigue en pie (muertos o rendidos); derrota si ningún personaje está en pie
 * (a 0 PG o muertos).
 */
export function outcomeOf(encounter: Encounter): CombatOutcome | null {
  const records = Object.values(encounter.combatants);
  const monstersUp = records.filter((r) => r.definition.kind === "monster" && r.state.lifeState === "alive" && !r.state.morale.surrendered);
  const playersUp = records.filter((r) => r.definition.kind === "playerCharacter" && r.state.lifeState === "alive");
  if (records.some((r) => r.definition.kind === "monster") && monstersUp.length === 0) return "victory";
  if (records.some((r) => r.definition.kind === "playerCharacter") && playersUp.length === 0) return "defeat";
  return null;
}

function withOutcome(s: CombatSnapshot): CombatSnapshot {
  if (s.phase !== "turn" || s.pending !== null) return s;
  const outcome = outcomeOf(s.encounter);
  if (outcome === null) return s;
  return { ...s, phase: "finished", outcome, log: append(s, { kind: "combatEnded", outcome }) };
}
