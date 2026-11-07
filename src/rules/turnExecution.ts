import type {
  AttackId,
  Capability,
  CombatantDefinition,
  CombatantRecord,
  CreatureId,
  Encounter,
  GridPosition,
  Operation,
  SheetPredicate,
  StandardActionType,
} from "../models";
import type { RandomSource } from "./dice";
import { validatePlacement } from "./placement";
import type { PlacementReason } from "./placement";
import { applyDamage, combineRollModes, resolveAttack } from "./resolution";
import type { AttackResolution, RollMode } from "./resolution";
import { advanceMovement, checkAttackTarget } from "./turnSteps";
import type { MovementProgress } from "./turnSteps";

/**
 * EJECUTOR DE TURNO PASO A PASO (DECISIÓN CONFIRMADA 2026-11-07, ver
 * docs/SHEET_ARCHITECTURE.md §8): una capacidad se inicia pagando su
 * activación una vez; después se ofrecen las operaciones atómicas legales
 * EN EL ESTADO ACTUAL, se elige una, se revalida, se resuelve y se vuelve a
 * calcular. Quien elige (persona o cerebro) solo ve opciones legales.
 *
 * Alcance de esta etapa: ataques y las acciones estándar Atacar, Correr,
 * Destrabarse y Esquivar; capacidades de ficha compuestas solo de eso
 * (Multiataque…). Todo lo demás se rechaza con un código, nunca se aproxima.
 *
 * Todo el estado (`TurnState`) es serializable a JSON y nunca se muta.
 */

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

/** Acciones estándar que este ejecutor sabe resolver. */
export const EXECUTABLE_STANDARD_ACTIONS = ["attack", "dash", "disengage", "dodge"] as const;
export type ExecutableStandardAction = (typeof EXECUTABLE_STANDARD_ACTIONS)[number];

/** De dónde sale una capacidad: acción estándar del motor, ficha o acción adicional clásica. */
export type CapabilitySource =
  | { readonly kind: "standard"; readonly action: ExecutableStandardAction }
  | { readonly kind: "sheet"; readonly capabilityId: string }
  | { readonly kind: "bonusAction"; readonly bonusActionId: string };

export interface CapabilityExecution {
  readonly source: CapabilitySource;
  /** "attack": se realiza como la acción de Atacar (se puede mover entre ataques). */
  readonly takenAs: "attack" | null;
  /** Operaciones que faltan, en orden (continuación del árbol de la capacidad). */
  readonly agenda: readonly Operation[];
  /** Resultado del último ataque de esta capacidad (para `previousAttackHit`). */
  readonly lastAttackHit: boolean | null;
}

export type TurnLogEntry =
  | { readonly kind: "moved"; readonly path: readonly GridPosition[]; readonly spentFeet: number }
  | { readonly kind: "capabilityBegun"; readonly source: CapabilitySource }
  | {
      readonly kind: "attackResolved";
      readonly attackId: AttackId;
      readonly targetId: CreatureId;
      readonly resolution: Extract<AttackResolution, { resolved: true }>;
      /** Daño restado a los PG (0 si el objetivo no tiene PG registrados). */
      readonly damageApplied: number;
    }
  | { readonly kind: "standardActionTaken"; readonly action: ExecutableStandardAction }
  | {
      readonly kind: "capabilityFinished";
      readonly source: CapabilitySource;
      /** completed: terminó; forfeited: se renunció al resto. */
      readonly outcome: "completed" | "forfeited";
      /** Al renunciar: si quedaban opciones legales (renuncia voluntaria) o no (paso perdido). */
      readonly hadLegalOptions?: boolean;
    }
  | { readonly kind: "turnEnded" };

export interface TurnState {
  readonly actorId: CreatureId;
  /** Aumenta con cada orden aplicada; invalida opciones calculadas antes. */
  readonly serial: number;
  readonly movement: MovementProgress;
  /** Pies de movimiento disponibles en el turno (null: sin Velocidad registrada). */
  readonly budgetFeet: number | null;
  readonly actionUsed: boolean;
  readonly bonusActionUsed: boolean;
  /** Destrabarse: el movimiento no provoca ataques de oportunidad (aún no modelados). */
  readonly disengaged: boolean;
  /** Esquivar: beneficios hasta el inicio de su siguiente turno (efectos aún no aplicados). */
  readonly dodging: boolean;
  readonly execution: CapabilityExecution | null;
  readonly log: readonly TurnLogEntry[];
  readonly ended: boolean;
}

/** Operación atómica concreta que se puede elegir ahora mismo. */
export type ExecutionChoice =
  | {
      readonly kind: "attack";
      readonly attackId: AttackId;
      readonly targetId: CreatureId;
      readonly rollMode: RollMode;
    }
  | { readonly kind: "standardAction"; readonly action: ExecutableStandardAction }
  /** Terminar la capacidad: no quedan operaciones obligatorias. */
  | { readonly kind: "finish" };

export interface ExecutionOption {
  /** Clave de un solo uso: `${serial}:${índice}`. */
  readonly key: string;
  readonly choice: ExecutionChoice;
}

export interface TurnOptions {
  /** Puede mover ahora (fuera de capacidades, o entre ataques de la acción de Atacar). */
  readonly canMove: boolean;
  /** Capacidades que se pueden iniciar ahora (solo sin capacidad en curso). */
  readonly capabilities: readonly CapabilitySource[];
  /** Operaciones legales de la capacidad en curso. */
  readonly executionOptions: readonly ExecutionOption[];
  readonly canForfeit: boolean;
  readonly canEndTurn: boolean;
}

export type TurnCommand =
  | { readonly kind: "move"; readonly path: readonly GridPosition[] }
  | { readonly kind: "beginCapability"; readonly source: CapabilitySource }
  | { readonly kind: "chooseOption"; readonly key: string }
  | { readonly kind: "forfeitRemaining" }
  | { readonly kind: "endTurn" };

export type TurnCommandError =
  | "unknownActor"
  | "turnEnded"
  | "executionInProgress"
  | "noExecution"
  | "movementNotAllowedNow"
  | "emptyPath"
  | "invalidSquare"
  | "notAdjacent"
  | "movementExceedsSpeed"
  | "capabilityUnavailable"
  | "activationUnavailable"
  | "capabilityNotSupported"
  | "requirementsNotMet"
  | "noLegalOptions"
  | "staleOption"
  | "unknownOption"
  | "targetArmorClassUnknown";

export type TurnCommandResult =
  | { readonly ok: true; readonly encounter: Encounter; readonly turn: TurnState }
  | {
      readonly ok: false;
      readonly reasonCode: TurnCommandError;
      readonly placementReason?: PlacementReason;
    };

/** Por qué una capacidad no se puede ejecutar con este motor (aunque la ficha sea válida). */
export type CapabilitySupportIssue =
  | "costsNotModeled"
  | "reactionsNotModeled"
  | "operationNotModeled"
  | "predicateNotModeled"
  | "unknownReference"
  | "tooDeep";

// ---------------------------------------------------------------------------
// Capacidades disponibles
// ---------------------------------------------------------------------------

interface ResolvedCapability {
  readonly source: CapabilitySource;
  readonly activation: Capability["activation"];
  readonly takenAs: "attack" | null;
  readonly costs: NonNullable<Capability["costs"]>;
  readonly requirements: NonNullable<Capability["requirements"]>;
  readonly body: Operation;
}

const MAX_TREE_DEPTH = 16;

function attackBody(definition: CombatantDefinition): Operation | null {
  const options: Operation[] = definition.attacks.map((attack) => ({ op: "attack", attackRef: attack.id }));
  const single = options.length === 1 ? options[0] : undefined;
  const pick: Operation | null =
    options.length === 0 ? null : single ?? { op: "choice", options };
  if (pick === null) return null;
  // REGLA OFICIAL VERIFICADA (Glosario 2024, "Attack [Action]"): una tirada
  // de ataque. Más ataques solo con un rasgo (`attacksPerAttackAction`).
  const times = definition.stats.attacksPerAttackAction ?? 1;
  return times === 1 ? pick : { op: "repeat", times, body: pick };
}

function resolveCapability(definition: CombatantDefinition, source: CapabilitySource): ResolvedCapability | null {
  switch (source.kind) {
    case "standard": {
      const body: Operation | null =
        source.action === "attack" ? attackBody(definition) : { op: "standardAction", action: source.action };
      if (body === null) return null;
      return {
        source,
        activation: "action",
        takenAs: source.action === "attack" ? "attack" : null,
        costs: [],
        requirements: [],
        body,
      };
    }
    case "sheet": {
      const capability = (definition.capabilities ?? []).find((c) => c.id === source.capabilityId);
      if (!capability) return null;
      return {
        source,
        activation: capability.activation,
        takenAs: capability.takenAs ?? null,
        costs: capability.costs ?? [],
        requirements: capability.requirements ?? [],
        body: capability.body,
      };
    }
    case "bonusAction": {
      const bonus = definition.bonusActions.find((b) => b.id === source.bonusActionId);
      if (!bonus || bonus.allowedActions.length === 0) return null;
      const options: Operation[] = bonus.allowedActions.map((action) => ({ op: "standardAction", action }));
      const single = options.length === 1 ? options[0] : undefined;
      return {
        source,
        activation: "bonusAction",
        takenAs: null,
        costs: [],
        requirements: [],
        body: single ?? { op: "choice", options },
      };
    }
  }
}

/** Todas las capacidades que la criatura tiene (sin mirar si hoy son legales). */
export function capabilitySourcesOf(definition: CombatantDefinition): CapabilitySource[] {
  return [
    ...EXECUTABLE_STANDARD_ACTIONS.map((action) => ({ kind: "standard" as const, action })),
    ...(definition.capabilities ?? []).map((c) => ({ kind: "sheet" as const, capabilityId: c.id })),
    ...definition.bonusActions.map((b) => ({ kind: "bonusAction" as const, bonusActionId: b.id })),
  ].filter((source) => resolveCapability(definition, source) !== null);
}

function predicateSupported(predicate: SheetPredicate): boolean {
  switch (predicate.kind) {
    case "selfBloodied":
    case "previousAttackHit":
      return true;
    case "not":
      return predicateSupported(predicate.predicate);
    case "all":
    case "any":
      return predicate.predicates.every(predicateSupported);
    default:
      // Recursos y condiciones aún no existen en el estado del encuentro.
      return false;
  }
}

/**
 * Qué impide ejecutar una capacidad con este motor. Las acciones estándar no
 * modeladas (Esconderse…) NO la invalidan: esas ramas simplemente no se
 * ofrecen como opción.
 */
export function capabilitySupport(
  definition: CombatantDefinition,
  source: CapabilitySource,
): readonly CapabilitySupportIssue[] {
  const resolved = resolveCapability(definition, source);
  if (!resolved) return ["unknownReference"];
  const issues = new Set<CapabilitySupportIssue>();
  if (resolved.activation === "reaction") issues.add("reactionsNotModeled");
  if (resolved.costs.length > 0) issues.add("costsNotModeled");
  if (!resolved.requirements.every(predicateSupported)) issues.add("predicateNotModeled");

  const visit = (operation: Operation, depth: number): void => {
    if (depth > MAX_TREE_DEPTH) {
      issues.add("tooDeep");
      return;
    }
    switch (operation.op) {
      case "attack":
        if (!definition.attacks.some((a) => a.id === operation.attackRef)) issues.add("unknownReference");
        break;
      case "standardAction":
        break;
      case "capability": {
        const referenced = (definition.capabilities ?? []).find((c) => c.id === operation.capabilityRef);
        if (!referenced) {
          issues.add("unknownReference");
          break;
        }
        // DECISIÓN CONFIRMADA: se gastan los recursos de la capacidad usada; aún no hay recursos.
        if ((referenced.costs ?? []).length > 0) issues.add("costsNotModeled");
        visit(referenced.body, depth + 1);
        break;
      }
      case "sequence":
        operation.steps.forEach((step) => visit(step, depth + 1));
        break;
      case "choice":
        operation.options.forEach((option) => visit(option, depth + 1));
        break;
      case "repeat":
      case "optional":
        visit(operation.body, depth + 1);
        break;
      case "conditional":
        if (!predicateSupported(operation.when)) issues.add("predicateNotModeled");
        visit(operation.then, depth + 1);
        if (operation.otherwise) visit(operation.otherwise, depth + 1);
        break;
      case "effect":
      case "castSpell":
      case "unmodeled":
        issues.add("operationNotModeled");
        break;
    }
  };
  visit(resolved.body, 1);
  return [...issues];
}

// ---------------------------------------------------------------------------
// Expansión de la agenda: primeras operaciones atómicas posibles
// ---------------------------------------------------------------------------

type AtomicOperation = Extract<Operation, { op: "attack" | "standardAction" }>;

interface Expansion {
  /** null: la capacidad puede terminar aquí. */
  readonly atom: AtomicOperation | null;
  readonly rest: readonly Operation[];
}

interface EvaluationContext {
  readonly actor: CombatantRecord;
  readonly lastAttackHit: boolean | null;
}

/** Evalúa un predicado en el estado ACTUAL (reevaluación). */
function evaluatePredicate(predicate: SheetPredicate, context: EvaluationContext): boolean {
  switch (predicate.kind) {
    case "selfBloodied": {
      // REGLA OFICIAL VERIFICADA (Glosario 2024, "Bloodied"): la mitad de sus PG o menos.
      const current = context.actor.state.currentHitPoints;
      const max = context.actor.definition.stats.maxHitPoints;
      return current !== null && max !== undefined && current <= max / 2;
    }
    case "previousAttackHit":
      return context.lastAttackHit === true;
    case "not":
      return !evaluatePredicate(predicate.predicate, context);
    case "all":
      return predicate.predicates.every((p) => evaluatePredicate(p, context));
    case "any":
      return predicate.predicates.some((p) => evaluatePredicate(p, context));
    default:
      // `capabilitySupport` impide iniciar capacidades con predicados no modelados.
      return false;
  }
}

/**
 * Despliega la agenda hasta la primera operación atómica de cada camino.
 * `choice` da un camino por opción, `optional` añade el camino de omitirla,
 * `conditional` se decide con el estado actual y `repeat` deja en la agenda
 * las repeticiones que faltan (se vuelven a elegir y validar una a una).
 */
function expand(agenda: readonly Operation[], context: EvaluationContext, depth = 0): Expansion[] {
  if (depth > MAX_TREE_DEPTH * 4) return [];
  const [head, ...tail] = agenda;
  if (head === undefined) return [{ atom: null, rest: [] }];
  switch (head.op) {
    case "attack":
    case "standardAction":
      return [{ atom: head, rest: tail }];
    case "sequence":
      return expand([...head.steps, ...tail], context, depth + 1);
    case "repeat": {
      const remaining: Operation[] = head.times > 1 ? [{ ...head, times: head.times - 1 }] : [];
      return expand([head.body, ...remaining, ...tail], context, depth + 1);
    }
    case "choice":
      return head.options.flatMap((option) => expand([option, ...tail], context, depth + 1));
    case "optional":
      return [...expand([head.body, ...tail], context, depth + 1), ...expand(tail, context, depth + 1)];
    case "conditional": {
      const branch = evaluatePredicate(head.when, context) ? head.then : head.otherwise;
      return expand(branch ? [branch, ...tail] : tail, context, depth + 1);
    }
    case "capability": {
      const referenced = (context.actor.definition.capabilities ?? []).find(
        (c) => c.id === head.capabilityRef,
      );
      return referenced ? expand([referenced.body, ...tail], context, depth + 1) : [];
    }
    default:
      // effect, castSpell, unmodeled: no ejecutables (ver `capabilitySupport`).
      return [];
  }
}

interface ConcreteOption {
  readonly choice: ExecutionChoice;
  readonly rest: readonly Operation[];
}

function isExecutableStandard(action: StandardActionType): action is ExecutableStandardAction {
  return (EXECUTABLE_STANDARD_ACTIONS as readonly string[]).includes(action);
}

/** Operaciones concretas y legales ahora mismo, en orden determinista y sin duplicados. */
function concreteOptions(
  encounter: Encounter,
  actor: CombatantRecord,
  execution: CapabilityExecution,
): ConcreteOption[] {
  const context: EvaluationContext = { actor, lastAttackHit: execution.lastAttackHit };
  const targets = Object.keys(encounter.combatants).sort() as CreatureId[];
  const seen = new Set<string>();
  const result: ConcreteOption[] = [];
  const push = (option: ConcreteOption): void => {
    const key = JSON.stringify(option);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(option);
  };

  for (const { atom, rest } of expand(execution.agenda, context)) {
    if (atom === null) {
      push({ choice: { kind: "finish" }, rest: [] });
    } else if (atom.op === "attack") {
      for (const targetId of targets) {
        const check = checkAttackTarget(encounter, actor, actor.state.position, atom.attackRef, targetId);
        if (!check.ok) continue;
        push({
          choice: {
            kind: "attack",
            attackId: check.attack.id,
            targetId,
            rollMode: combineRollModes(false, check.beyondNormalRange),
          },
          rest,
        });
      }
    } else if (isExecutableStandard(atom.action) && atom.action !== "attack") {
      // Las ramas con acciones no modeladas (Esconderse…) no se ofrecen.
      push({ choice: { kind: "standardAction", action: atom.action }, rest });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// API del turno
// ---------------------------------------------------------------------------

/** Empieza el turno de una criatura: movimiento y economía de acciones a cero. */
export function startTurn(encounter: Encounter, actorId: CreatureId): TurnState {
  const actor = encounter.combatants[actorId];
  if (!actor) throw new Error(`Criatura no encontrada: ${actorId}`);
  return {
    actorId,
    serial: 0,
    movement: { position: actor.state.position, diagonalCount: 0, spentFeet: 0 },
    budgetFeet: actor.definition.stats.speedFeet ?? null,
    actionUsed: false,
    bonusActionUsed: false,
    disengaged: false,
    dodging: false,
    execution: null,
    log: [],
    ended: false,
  };
}

function activationFree(turn: TurnState, activation: Capability["activation"]): boolean {
  if (activation === "action") return !turn.actionUsed;
  if (activation === "bonusAction") return !turn.bonusActionUsed;
  return false;
}

function canMoveNow(turn: TurnState): boolean {
  if (turn.ended) return false;
  // REGLA OFICIAL VERIFICADA ("Moving between Attacks"): solo entre los
  // ataques de la acción de Atacar. Con otras capacidades en curso no se mueve
  // (PENDIENTE DE VALIDAR si alguna otra regla lo permite).
  if (turn.execution !== null && turn.execution.takenAs !== "attack") return false;
  return turn.budgetFeet === null || turn.movement.spentFeet < turn.budgetFeet;
}

/** Comprueba si una capacidad se puede iniciar ahora y con qué opciones. */
function tryBegin(
  encounter: Encounter,
  actor: CombatantRecord,
  turn: TurnState,
  source: CapabilitySource,
): { ok: true; execution: CapabilityExecution; activation: Capability["activation"] } | { ok: false; reasonCode: TurnCommandError } {
  const resolved = resolveCapability(actor.definition, source);
  if (!resolved) return { ok: false, reasonCode: "capabilityUnavailable" };
  if (capabilitySupport(actor.definition, source).length > 0) {
    return { ok: false, reasonCode: "capabilityNotSupported" };
  }
  if (!activationFree(turn, resolved.activation)) return { ok: false, reasonCode: "activationUnavailable" };
  const context: EvaluationContext = { actor, lastAttackHit: null };
  if (!resolved.requirements.every((p) => evaluatePredicate(p, context))) {
    return { ok: false, reasonCode: "requirementsNotMet" };
  }
  const execution: CapabilityExecution = {
    source,
    takenAs: resolved.takenAs,
    agenda: [resolved.body],
    lastAttackHit: null,
  };
  // PROPUESTA: no se paga una capacidad que no tiene ahora ninguna operación
  // legal (p. ej. Atacar sin nadie al alcance): primero hay que moverse.
  const options = concreteOptions(encounter, actor, execution);
  if (!options.some((o) => o.choice.kind !== "finish")) return { ok: false, reasonCode: "noLegalOptions" };
  return { ok: true, execution, activation: resolved.activation };
}

export function getTurnOptions(encounter: Encounter, turn: TurnState): TurnOptions {
  const actor = encounter.combatants[turn.actorId];
  if (!actor || turn.ended) {
    return { canMove: false, capabilities: [], executionOptions: [], canForfeit: false, canEndTurn: false };
  }
  if (turn.execution !== null) {
    return {
      canMove: canMoveNow(turn),
      capabilities: [],
      executionOptions: concreteOptions(encounter, actor, turn.execution).map((option, index) => ({
        key: `${turn.serial}:${index}`,
        choice: option.choice,
      })),
      canForfeit: true,
      canEndTurn: false,
    };
  }
  return {
    canMove: canMoveNow(turn),
    capabilities: capabilitySourcesOf(actor.definition).filter((source) => tryBegin(encounter, actor, turn, source).ok),
    executionOptions: [],
    canForfeit: false,
    canEndTurn: true,
  };
}

function withPosition(encounter: Encounter, actorId: CreatureId, position: GridPosition): Encounter {
  const record = encounter.combatants[actorId];
  if (!record) return encounter;
  return {
    ...encounter,
    combatants: { ...encounter.combatants, [actorId]: { ...record, state: { ...record.state, position } } },
  };
}

function fail(reasonCode: TurnCommandError, placementReason?: PlacementReason): TurnCommandResult {
  return placementReason === undefined ? { ok: false, reasonCode } : { ok: false, reasonCode, placementReason };
}

/**
 * Aplica una orden al turno. Siempre revalida contra el estado actual; si no
 * es legal, no cambia nada y devuelve el código del motivo. Los dados solo se
 * usan al resolver ataques.
 */
export function applyTurnCommand(
  encounter: Encounter,
  turn: TurnState,
  command: TurnCommand,
  dice: RandomSource,
): TurnCommandResult {
  const actor = encounter.combatants[turn.actorId];
  if (!actor) return fail("unknownActor");
  if (turn.ended) return fail("turnEnded");
  const next = (changes: Partial<TurnState>, entries: readonly TurnLogEntry[]): TurnState => ({
    ...turn,
    ...changes,
    serial: turn.serial + 1,
    log: [...turn.log, ...entries],
  });

  switch (command.kind) {
    case "move": {
      if (!canMoveNow(turn)) return fail("movementNotAllowedNow");
      const moved = advanceMovement(encounter, actor, turn.movement, command.path, turn.budgetFeet);
      if (!moved.ok) return fail(moved.reasonCode, moved.placementReason);
      // PENDIENTE: ataques de oportunidad al salir del alcance (decisión 7).
      return {
        ok: true,
        encounter: withPosition(encounter, turn.actorId, moved.progress.position),
        turn: next({ movement: moved.progress }, [
          { kind: "moved", path: command.path, spentFeet: moved.progress.spentFeet - turn.movement.spentFeet },
        ]),
      };
    }

    case "beginCapability": {
      if (turn.execution !== null) return fail("executionInProgress");
      const begun = tryBegin(encounter, actor, turn, command.source);
      if (!begun.ok) return fail(begun.reasonCode);
      // DECISIÓN CONFIRMADA: la activación se paga una sola vez, al iniciar, y no se devuelve.
      return {
        ok: true,
        encounter,
        turn: next(
          {
            actionUsed: turn.actionUsed || begun.activation === "action",
            bonusActionUsed: turn.bonusActionUsed || begun.activation === "bonusAction",
            execution: begun.execution,
          },
          [{ kind: "capabilityBegun", source: command.source }],
        ),
      };
    }

    case "forfeitRemaining": {
      const execution = turn.execution;
      if (execution === null) return fail("noExecution");
      const hadLegalOptions = concreteOptions(encounter, actor, execution).length > 0;
      return {
        ok: true,
        encounter,
        turn: next({ execution: null }, [
          { kind: "capabilityFinished", source: execution.source, outcome: "forfeited", hadLegalOptions },
        ]),
      };
    }

    case "chooseOption": {
      const execution = turn.execution;
      if (execution === null) return fail("noExecution");
      const [serialText, indexText] = command.key.split(":");
      if (Number(serialText) !== turn.serial) return fail("staleOption");
      // Revalidación: las opciones se recalculan con el estado actual.
      const option = concreteOptions(encounter, actor, execution)[Number(indexText)];
      if (!option) return fail("unknownOption");
      return applyChoice(encounter, actor, turn, execution, option, dice, next);
    }

    case "endTurn": {
      if (turn.execution !== null) return fail("executionInProgress");
      // El turno no puede terminar en un espacio ocupado por otra criatura.
      const placement = validatePlacement(encounter, actor.state.position, actor.definition.size, {
        ignoreCreatureId: turn.actorId,
      });
      if (!placement.valid) return fail("invalidSquare", placement.reason);
      return { ok: true, encounter, turn: next({ ended: true }, [{ kind: "turnEnded" }]) };
    }
  }
}

function applyChoice(
  encounter: Encounter,
  actor: CombatantRecord,
  turn: TurnState,
  execution: CapabilityExecution,
  option: ConcreteOption,
  dice: RandomSource,
  next: (changes: Partial<TurnState>, entries: readonly TurnLogEntry[]) => TurnState,
): TurnCommandResult {
  const finished = (entries: TurnLogEntry[], updated: CapabilityExecution): TurnLogEntry[] =>
    updated.agenda.length === 0
      ? [...entries, { kind: "capabilityFinished", source: execution.source, outcome: "completed" }]
      : entries;

  const { choice } = option;
  switch (choice.kind) {
    case "finish":
      return {
        ok: true,
        encounter,
        turn: next({ execution: null }, [
          { kind: "capabilityFinished", source: execution.source, outcome: "completed" },
        ]),
      };

    case "standardAction": {
      const updated: CapabilityExecution = { ...execution, agenda: option.rest };
      const effects: Partial<TurnState> = {};
      switch (choice.action) {
        case "dash": {
          // REGLA OFICIAL VERIFICADA (Glosario 2024, "Dash"): movimiento extra igual a la Velocidad.
          const speed = actor.definition.stats.speedFeet;
          if (turn.budgetFeet !== null && speed !== undefined) {
            Object.assign(effects, { budgetFeet: turn.budgetFeet + speed });
          }
          break;
        }
        case "disengage":
          Object.assign(effects, { disengaged: true });
          break;
        case "dodge":
          Object.assign(effects, { dodging: true });
          break;
        case "attack":
          break;
      }
      const entries = finished([{ kind: "standardActionTaken", action: choice.action }], updated);
      return {
        ok: true,
        encounter,
        turn: next({ ...effects, execution: updated.agenda.length === 0 ? null : updated }, entries),
      };
    }

    case "attack": {
      const check = checkAttackTarget(encounter, actor, actor.state.position, choice.attackId, choice.targetId);
      if (!check.ok) return fail("unknownOption");
      const resolution = resolveAttack(
        { attack: check.attack, target: check.target.definition, mode: choice.rollMode },
        dice,
      );
      // Sin CA registrada no se puede resolver: no se consume nada.
      if (!resolution.resolved) return fail("targetArmorClassUnknown");

      let updatedEncounter = encounter;
      let damageApplied = 0;
      if (resolution.totalDamage > 0 && check.target.state.currentHitPoints !== null) {
        damageApplied = Math.min(resolution.totalDamage, check.target.state.currentHitPoints);
        // PENDIENTE: resistencias/vulnerabilidades e inmunidades; consecuencias de 0 PG.
        updatedEncounter = applyDamage(encounter, choice.targetId, resolution.totalDamage);
      }
      const updated: CapabilityExecution = {
        ...execution,
        agenda: option.rest,
        lastAttackHit: resolution.outcome !== "miss",
      };
      const entries = finished(
        [{ kind: "attackResolved", attackId: choice.attackId, targetId: choice.targetId, resolution, damageApplied }],
        updated,
      );
      return {
        ok: true,
        encounter: updatedEncounter,
        turn: next({ execution: updated.agenda.length === 0 ? null : updated }, entries),
      };
    }
  }
}
