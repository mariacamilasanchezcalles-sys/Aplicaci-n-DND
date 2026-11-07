import type {
  AttackId,
  Capability,
  CombatantDefinition,
  CombatantRecord,
  ConditionId,
  CreatureId,
  CreatureSize,
  Encounter,
  GridPosition,
  LifeState,
  Operation,
  SheetPredicate,
  StandardActionType,
} from "../models";
import type { RandomSource } from "./dice";
import { areaSquares, creaturesInSquares } from "./areas";
import type { AreaPlacement, AreaPlacementError } from "./areas";
import { footprintDistanceSquares } from "./distance";
import { effectSupported, resolveEffect } from "./effects";
import {
  attackConditions,
  canSee,
  cannotAct,
  cannotHarm,
  conditionResistances,
  effectiveSpeed,
  expireConditionsAtTurnBoundary,
  fearSources,
  abilityCheckConditions,
  applyCondition,
  endBrokenGrapples,
  hasCondition,
  isEnemy,
  releaseGrapples,
  removeCondition,
  speedCannotIncrease,
} from "./conditions";
import { rollDie } from "./dice";
import { rollRechargesAtTurnStart } from "./resources";
import type { RechargeRoll } from "./resources";
import { dealDamage } from "./vitality";
import {
  hasMarked,
  isFlanking,
  markTarget,
  massiveDamageApplies,
  resolveMassiveDamage,
  runStateMoraleChecks,
} from "./houseRules";
import type { MoraleCheck, ShockResult } from "./houseRules";
import type { EffectOperation, EffectTargetResult, PlayerSaveInput, RolledAmount } from "./effects";
import { validatePlacement } from "./placement";
import type { PlacementReason } from "./placement";
import { applyDamageModifiers } from "./damage";
import type { ModifiedDamage } from "./damage";
import { resolveAttack, resolvePlayerAttack } from "./resolution";
import type { PlayerAttackInput } from "./resolution";
import { spendResources } from "./resources";
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
  | ({ readonly kind: "attackResolved" } & AttackOutcomeLog)
  | { readonly kind: "standardActionTaken"; readonly action: ExecutableStandardAction }
  | {
      readonly kind: "capabilityFinished";
      readonly source: CapabilitySource;
      /** completed: terminó; forfeited: se renunció al resto. */
      readonly outcome: "completed" | "forfeited";
      /** Al renunciar: si quedaban opciones legales (renuncia voluntaria) o no (paso perdido). */
      readonly hadLegalOptions?: boolean;
    }
  | {
      readonly kind: "effectResolved";
      readonly affected: readonly CreatureId[];
      readonly rolls: readonly RolledAmount[];
      readonly targets: readonly EffectTargetResult[];
    }
  | { readonly kind: "stoodUp"; readonly spentFeet: number }
  | {
      readonly kind: "opportunityAttack";
      readonly reactorId: CreatureId;
      readonly attack: AttackOutcomeLog;
    }
  | { readonly kind: "reactionDeclined"; readonly reactorId: CreatureId }
  | {
      readonly kind: "massiveDamage";
      readonly creatureId: CreatureId;
      readonly saveTotal: number | null;
      readonly saveSucceeded: boolean;
      readonly shockRoll: number | null;
      readonly shock: ShockResult | null;
    }
  | { readonly kind: "massiveDamageUnresolved"; readonly creatureId: CreatureId }
  | { readonly kind: "moraleCheck"; readonly check: MoraleCheck }
  | { readonly kind: "surrendered" }
  /** El movimiento interrumpido no pudo seguir (p. ej. quedó inconsciente o sin Velocidad). */
  | { readonly kind: "movementStopped"; readonly remainingPath: readonly GridPosition[] }
  /** Intento de escapar de un agarre (gasta la acción). */
  | { readonly kind: "escapeAttempt"; readonly grapplerId: CreatureId; readonly check: EscapeCheck }
  | { readonly kind: "turnEnded" };

/** Prueba de escape: tirada virtual (monstruos) o anotada (jugadores). */
export type EscapeCheck =
  | {
      readonly source: "virtual";
      readonly ability: "str" | "dex";
      readonly d20: number;
      readonly bonus: number;
      readonly penalty: number;
      readonly total: number;
      readonly dc: number;
      readonly success: boolean;
    }
  | { readonly source: "player"; readonly total: number | null; readonly dc: number; readonly success: boolean };

/** Resultado registrado de un ataque (del turno o de una reacción). */
export interface AttackOutcomeLog {
  readonly attackId: AttackId;
  readonly targetId: CreatureId;
  readonly resolution: Extract<AttackResolution, { resolved: true }>;
  /** Daño por tipo tras Inmunidad, Resistencia y Vulnerabilidad del objetivo. */
  readonly damageAfterDefenses: readonly ModifiedDamage[];
  /** Daño restado a los PG (0 si el objetivo no tiene PG registrados). */
  readonly damageApplied: number;
  readonly knockedOut: boolean;
  readonly targetLifeStateAfter: LifeState;
  /** Condiciones aplicadas al impactar (p. ej. Agarrado). */
  readonly conditionsApplied?: readonly ConditionId[];
}

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
  /**
   * Reacciones que esperan decisión (ataques de oportunidad). Mientras haya
   * alguna, el movimiento está detenido justo antes de salir del alcance y
   * solo se acepta `resolveReaction`.
   */
  readonly pendingReactions: readonly ReactionOpportunity[];
  /** Casillas del movimiento interrumpido que faltan por recorrer. */
  readonly pendingPath: readonly GridPosition[];
  /** Quienes ya decidieron su reacción para el primer paso de `pendingPath` (no se les vuelve a preguntar). */
  readonly pendingStepReactorIds: readonly CreatureId[];
  /** Salvaciones de jugadores pendientes (regla casera Daño masivo); hay que resolverlas antes de terminar el turno. */
  readonly pendingSaves: readonly PendingSave[];
}

export interface PendingSave {
  readonly kind: "massiveDamage";
  readonly creatureId: CreatureId;
}

/**
 * Oportunidad de reacción. Hoy solo el ataque de oportunidad (REGLA OFICIAL
 * VERIFICADA): una criatura que puede ver al que se mueve, cuando este sale de
 * su alcance con su propio movimiento; un ataque cuerpo a cuerpo justo antes
 * de que salga. Ampliable a reacciones de ficha (decisión 59).
 */
export interface ReactionOpportunity {
  readonly kind: "opportunityAttack";
  readonly reactorId: CreatureId;
  readonly moverId: CreatureId;
  /** Ataques cuerpo a cuerpo del que reacciona que alcanzan al que se mueve. */
  readonly attackIds: readonly AttackId[];
  /** Regla casera Marcar: con Ventaja y sin gastar la reacción. */
  readonly viaMark: boolean;
}

/** Datos de un ataque que completa quien lo hace. */
export interface AttackInput {
  /** Cuerpo a cuerpo: dejar inconsciente en lugar de a 0 PG. */
  readonly knockOut?: boolean;
  /** Obligatorio si ataca un personaje jugador (dados físicos). */
  readonly playerRoll?: PlayerAttackInput;
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
  /**
   * Operación de efecto (aliento, aura, curación…). Se completa al elegirla
   * con `effectInput`: objetivos (`creatures`) o colocación del área (`area`).
   */
  | {
      readonly kind: "effect";
      readonly targeting: "self" | "creatures" | "area";
      /** Datos para la persona o el cerebro: cuántos objetivos, alcance, forma… */
      readonly operation: EffectOperation;
    }
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
  /** Criaturas que la agarran y de las que puede intentar escapar (con su acción). */
  readonly escapeFrom: readonly CreatureId[];
}

export type TurnCommand =
  | { readonly kind: "move"; readonly path: readonly GridPosition[] }
  | { readonly kind: "beginCapability"; readonly source: CapabilitySource }
  | {
      readonly kind: "chooseOption";
      readonly key: string;
      readonly effectInput?: EffectInput;
      readonly attackInput?: AttackInput;
    }
  /** Decidir una reacción pendiente (tomarla con un ataque o dejarla pasar). */
  | {
      readonly kind: "resolveReaction";
      readonly reactorId: CreatureId;
      readonly take: boolean;
      readonly attackId?: AttackId;
      readonly attackInput?: AttackInput;
    }
  | { readonly kind: "forfeitRemaining" }
  /** Levantarse de Derribado: cuesta la mitad de la Velocidad (redondeando abajo). */
  | { readonly kind: "standUp" }
  /** Regla casera Moral: un monstruo que huye y no puede escapar se rinde. */
  | { readonly kind: "surrender" }
  /** Salvación anotada de un jugador para una tirada pendiente (Daño masivo). */
  | { readonly kind: "resolvePendingSave"; readonly creatureId: CreatureId; readonly playerSave: PlayerSaveInput }
  /**
   * Escapar de un agarre: usa la acción (REGLA OFICIAL VERIFICADA). Los
   * jugadores anotan su prueba física (`playerCheck`).
   */
  | { readonly kind: "escapeGrapple"; readonly grapplerId: CreatureId; readonly playerCheck?: PlayerSaveInput }
  | { readonly kind: "endTurn" };

/** Datos que completa quien elige una opción de efecto. */
export interface EffectInput {
  /** Targeting `creatures`: objetivos elegidos (distintos, sin repetir). */
  readonly targetIds?: readonly CreatureId[];
  /** Targeting `area`: colocación (no se usa en emanaciones). */
  readonly placement?: AreaPlacement;
  /** Salvaciones de personajes jugadores tiradas con dados físicos. */
  readonly playerSaves?: Readonly<Record<string, PlayerSaveInput>>;
}

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
  | "resourcesUnavailable"
  | "noLegalOptions"
  | "staleOption"
  | "unknownOption"
  | "targetArmorClassUnknown"
  | "invalidEffectTargets"
  | "invalidAreaPlacement"
  | "saveBonusUnknown"
  | "playerSavesRequired"
  /** Incapacitada, a 0 PG o muerta: no puede usar acciones ni acciones adicionales. */
  | "cannotAct"
  /** Asustada: no puede acercarse voluntariamente al origen de su miedo. */
  | "movementTowardFearSource"
  | "notProne"
  | "cannotStandUp"
  | "knockOutNotAllowed"
  | "reactionsPending"
  | "noPendingReaction"
  | "reactionNotAvailable"
  | "playerAttackRequired"
  | "invalidPlayerRoll"
  | "playerDamageRequired"
  | "savesPending"
  | "noPendingSave"
  | "notFleeing"
  | "notGrappled"
  | "actionAlreadyUsed"
  | "playerCheckRequired";

export type TurnCommandResult =
  | { readonly ok: true; readonly encounter: Encounter; readonly turn: TurnState }
  | {
      readonly ok: false;
      readonly reasonCode: TurnCommandError;
      readonly placementReason?: PlacementReason;
      readonly areaReason?: AreaPlacementError;
      /** Criaturas implicadas (p. ej. a quién hay que pedir la salvación). */
      readonly creatureIds?: readonly CreatureId[];
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
    case "resourceAvailable":
      return true;
    case "not":
      return predicateSupported(predicate.predicate);
    case "all":
    case "any":
      return predicate.predicates.every(predicateSupported);
    default:
      // Las condiciones aún no existen en el estado del encuentro.
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
  for (const cost of resolved.costs) {
    if (cost.kind === "spellSlot") issues.add("costsNotModeled");
    else if (!(definition.resources ?? []).some((r) => r.id === cost.resourceRef)) issues.add("unknownReference");
  }
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
        // DECISIÓN CONFIRMADA: se gastan los recursos de la capacidad usada.
        // PENDIENTE: cobrarlos al elegir esa rama (puede estar en un choice u
        // optional); hasta entonces una capacidad anidada con costes no se ejecuta.
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
        // Hoy: daño (sin condiciones de daño) y curación, con CD fija.
        if (!operation.effects.every(effectSupported) || operation.save?.dc === "spellSaveDc") {
          issues.add("operationNotModeled");
        }
        break;
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

type AtomicOperation = Extract<Operation, { op: "attack" | "standardAction" | "effect" }>;

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
    case "resourceAvailable": {
      const pool = context.actor.state.resources.find((r) => r.id === predicate.resourceRef);
      return pool !== undefined && pool.current >= 1;
    }
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
    case "effect":
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
      // castSpell, unmodeled: no ejecutables (ver `capabilitySupport`).
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
      // Regla casera Moral: quien huye solo se aleja (no ataca).
      if (actor.state.morale.fleeing) continue;
      for (const targetId of targets) {
        const check = checkAttackTarget(encounter, actor, actor.state.position, atom.attackRef, targetId);
        if (!check.ok) continue;
        // PROPUESTA: no se ofrecen criaturas muertas como objetivo.
        if (check.target.state.lifeState === "dead") continue;
        // Encantado: no puede atacar a quien lo encantó (verificado).
        if (cannotHarm(actor, targetId)) continue;
        const rolled = attackConditions(
          encounter,
          actor,
          check.target,
          check.distanceFeet,
          check.beyondNormalRange,
          check.attack.mode,
          check.attack.mode === "melee" && isFlanking(encounter, actor, check.target),
        );
        push({
          choice: {
            kind: "attack",
            attackId: check.attack.id,
            targetId,
            rollMode: rolled.mode,
          },
          rest,
        });
      }
    } else if (atom.op === "effect") {
      if (actor.state.morale.fleeing) continue;
      const targeting = atom.targeting.kind;
      // Con objetivos elegidos, tiene que haber al menos uno al alcance.
      if (targeting === "creatures" && creatureCandidates(encounter, actor, atom).length === 0) continue;
      push({ choice: { kind: "effect", targeting, operation: atom }, rest });
    } else if (
      isExecutableStandard(atom.action) &&
      atom.action !== "attack" &&
      (!actor.state.morale.fleeing || atom.action === "dash" || atom.action === "disengage")
    ) {
      // Las ramas con acciones no modeladas (Esconderse…) no se ofrecen.
      push({ choice: { kind: "standardAction", action: atom.action }, rest });
    }
  }
  return result;
}

/** Criaturas al alcance de un efecto con objetivos elegidos (sin el actor), por id. */
export function creatureCandidates(encounter: Encounter, actor: CombatantRecord, operation: EffectOperation): CreatureId[] {
  if (operation.targeting.kind !== "creatures") return [];
  const range = operation.targeting.rangeFeet;
  return (Object.keys(encounter.combatants).sort() as CreatureId[]).filter((id) => {
    const target = encounter.combatants[id];
    if (!target || id === actor.definition.id || target.state.lifeState === "dead") return false;
    if (cannotHarm(actor, id)) return false;
    const distance =
      footprintDistanceSquares(
        actor.state.position,
        actor.definition.size,
        target.state.position,
        target.definition.size,
        encounter.tableRules.diagonal,
      ) * encounter.grid.feetPerSquare;
    return distance <= range;
  });
}

export type EffectTargetsResult =
  | { readonly ok: true; readonly affected: readonly CreatureId[]; readonly playerSavesNeeded: readonly CreatureId[] }
  | { readonly ok: false; readonly reasonCode: "invalidEffectTargets" | "invalidAreaPlacement"; readonly areaReason?: AreaPlacementError };

/** Qué criaturas afecta un efecto con estos datos (sin tirar dados ni cambiar nada). */
function effectAffected(
  encounter: Encounter,
  actor: CombatantRecord,
  operation: EffectOperation,
  input: EffectInput,
): EffectTargetsResult {
  const targeting = operation.targeting;
  let affected: CreatureId[];
  switch (targeting.kind) {
    case "self":
      affected = [actor.definition.id];
      break;
    case "creatures": {
      const chosen = input.targetIds ?? [];
      const candidates = new Set(creatureCandidates(encounter, actor, operation));
      const distinct = new Set(chosen);
      if (
        chosen.length < 1 ||
        chosen.length > targeting.count ||
        distinct.size !== chosen.length ||
        !chosen.every((id) => candidates.has(id))
      ) {
        return { ok: false, reasonCode: "invalidEffectTargets" };
      }
      affected = [...chosen].sort();
      break;
    }
    case "area": {
      const area = areaSquares(encounter, actor, targeting, input.placement ?? {});
      if (!area.ok) return { ok: false, reasonCode: "invalidAreaPlacement", areaReason: area.reason };
      affected = creaturesInSquares(encounter, area.squares, targeting.includesSelf ? null : actor.definition.id).filter(
        (id) => encounter.combatants[id]?.state.lifeState !== "dead",
      );
      break;
    }
  }
  const playerSavesNeeded = operation.save
    ? affected.filter((id) => encounter.combatants[id]?.definition.kind === "playerCharacter")
    : [];
  return { ok: true, affected, playerSavesNeeded };
}

/** La operación de efecto de una opción de la capacidad en curso (null si no es de efecto o caducó). */
export function effectOperationOf(encounter: Encounter, turn: TurnState, key: string): EffectOperation | null {
  const actor = encounter.combatants[turn.actorId];
  if (!actor || turn.execution === null) return null;
  const [serialText, indexText] = key.split(":");
  if (Number(serialText) !== turn.serial) return null;
  const option = concreteOptions(encounter, actor, turn.execution)[Number(indexText)];
  return option?.choice.kind === "effect" ? option.choice.operation : null;
}

/**
 * Vista previa de una opción de efecto: a quién afectaría y a qué jugadores
 * hay que pedir la salvación. No tira dados ni cambia nada.
 */
export function previewEffect(
  encounter: Encounter,
  turn: TurnState,
  key: string,
  input: EffectInput,
): EffectTargetsResult | { readonly ok: false; readonly reasonCode: "staleOption" | "unknownOption" | "noExecution" } {
  const actor = encounter.combatants[turn.actorId];
  if (!actor || turn.execution === null) return { ok: false, reasonCode: "noExecution" };
  const [serialText, indexText] = key.split(":");
  if (Number(serialText) !== turn.serial) return { ok: false, reasonCode: "staleOption" };
  const option = concreteOptions(encounter, actor, turn.execution)[Number(indexText)];
  if (!option || option.choice.kind !== "effect") return { ok: false, reasonCode: "unknownOption" };
  return effectAffected(encounter, actor, option.choice.operation, input);
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
    budgetFeet: effectiveSpeed(actor),
    actionUsed: false,
    bonusActionUsed: false,
    disengaged: false,
    dodging: false,
    execution: null,
    log: [],
    ended: false,
    pendingReactions: [],
    pendingPath: [],
    pendingStepReactorIds: [],
    pendingSaves: [],
  };
}

function activationFree(turn: TurnState, activation: Capability["activation"]): boolean {
  if (activation === "action") return !turn.actionUsed;
  if (activation === "bonusAction") return !turn.bonusActionUsed;
  return false;
}

export function canMoveNow(turn: TurnState, actor: CombatantRecord): boolean {
  if (turn.ended || actor.state.lifeState !== "alive" || effectiveSpeed(actor) === 0) return false;
  // REGLA OFICIAL VERIFICADA ("Moving between Attacks"): solo entre los
  // ataques de la acción de Atacar. Con otras capacidades en curso no se mueve
  // (PENDIENTE DE VALIDAR si alguna otra regla lo permite).
  if (turn.execution !== null && turn.execution.takenAs !== "attack") return false;
  return turn.budgetFeet === null || turn.movement.spentFeet < turn.budgetFeet;
}

/**
 * Asustado (REGLA OFICIAL VERIFICADA): no puede acercarse voluntariamente al
 * origen de su miedo. Se comprueba casilla a casilla contra cada origen que
 * puede ver (PROPUESTA: "ver" = "en línea de visión" mientras no haya obstáculos).
 */
export function approachesFearSource(
  encounter: Encounter,
  actor: CombatantRecord,
  path: readonly GridPosition[],
  from: GridPosition = actor.state.position,
): boolean {
  const rule = encounter.tableRules.diagonal;
  // Regla casera Moral: quien huye no se acerca a ningún enemigo que vea.
  const fleeingFrom = actor.state.morale.fleeing
    ? Object.values(encounter.combatants)
        .filter((o) => isEnemy(actor, o) && o.state.lifeState === "alive")
        .map((o) => o.definition.id)
    : [];
  for (const sourceId of [...fearSources(actor), ...fleeingFrom]) {
    const source = encounter.combatants[sourceId];
    if (!source || !canSee(actor, source)) continue;
    const distanceFrom = (position: GridPosition): number =>
      footprintDistanceSquares(position, actor.definition.size, source.state.position, source.definition.size, rule);
    let previous = distanceFrom(from);
    for (const square of path) {
      const current = distanceFrom(square);
      if (current < previous) return true;
      previous = current;
    }
  }
  return false;
}

/**
 * Empieza el turno de una criatura con lo que ocurre "al inicio de su turno":
 * caducan las condiciones que duran hasta el inicio de su turno y se tiran
 * sus Recargas. (Las salvaciones contra la muerte las tira el jugador:
 * `recordDeathSave`.) Hasta que exista la iniciativa (decisión 9), quien
 * dirige el combate llama a esta función.
 */
export function beginCreatureTurn(
  encounter: Encounter,
  actorId: CreatureId,
  dice: RandomSource,
): { readonly encounter: Encounter; readonly turn: TurnState; readonly rechargeRolls: readonly RechargeRoll[] } {
  const expired = expireConditionsAtTurnBoundary(encounter, actorId, "start");
  const recharged = rollRechargesAtTurnStart(expired, actorId, dice);
  return { encounter: recharged.encounter, turn: startTurn(recharged.encounter, actorId), rechargeRolls: recharged.rolls };
}

/** Comprueba si una capacidad se puede iniciar ahora y con qué opciones. */
function tryBegin(
  encounter: Encounter,
  actor: CombatantRecord,
  turn: TurnState,
  source: CapabilitySource,
):
  | { ok: true; execution: CapabilityExecution; activation: Capability["activation"]; paidEncounter: Encounter }
  | { ok: false; reasonCode: TurnCommandError } {
  const resolved = resolveCapability(actor.definition, source);
  if (!resolved) return { ok: false, reasonCode: "capabilityUnavailable" };
  // REGLA OFICIAL VERIFICADA (Incapacitado): sin acciones, adicionales ni reacciones.
  if (cannotAct(actor)) return { ok: false, reasonCode: "cannotAct" };
  if (capabilitySupport(actor.definition, source).length > 0) {
    return { ok: false, reasonCode: "capabilityNotSupported" };
  }
  if (!activationFree(turn, resolved.activation)) return { ok: false, reasonCode: "activationUnavailable" };
  const context: EvaluationContext = { actor, lastAttackHit: null };
  if (!resolved.requirements.every((p) => evaluatePredicate(p, context))) {
    return { ok: false, reasonCode: "requirementsNotMet" };
  }
  // DECISIÓN CONFIRMADA: los recursos se pagan al iniciar, todos o ninguno.
  const resourceCosts = resolved.costs.flatMap((c) => (c.kind === "resource" ? [c] : []));
  const paidEncounter = spendResources(encounter, actor.definition.id, resourceCosts);
  if (paidEncounter === null) return { ok: false, reasonCode: "resourcesUnavailable" };
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
  return { ok: true, execution, activation: resolved.activation, paidEncounter };
}

export function getTurnOptions(encounter: Encounter, turn: TurnState): TurnOptions {
  const actor = encounter.combatants[turn.actorId];
  if (!actor || turn.ended) {
    return { canMove: false, capabilities: [], executionOptions: [], canForfeit: false, canEndTurn: false, escapeFrom: [] };
  }
  if (turn.execution !== null) {
    return {
      canMove: canMoveNow(turn, actor),
      capabilities: [],
      executionOptions: concreteOptions(encounter, actor, turn.execution).map((option, index) => ({
        key: `${turn.serial}:${index}`,
        choice: option.choice,
      })),
      canForfeit: true,
      canEndTurn: false,
      escapeFrom: [],
    };
  }
  return {
    canMove: canMoveNow(turn, actor),
    capabilities: capabilitySourcesOf(actor.definition).filter((source) => tryBegin(encounter, actor, turn, source).ok),
    executionOptions: [],
    canForfeit: false,
    canEndTurn: true,
    escapeFrom: turn.actionUsed || cannotAct(actor) ? [] : grapplersOf(actor),
  };
}

const SIZE_ORDER: readonly CreatureSize[] = ["tiny", "small", "medium", "large", "huge", "gargantuan"];

function withConditions(encounter: Encounter, record: CombatantRecord, conditions: CombatantRecord["state"]["conditions"]): Encounter {
  return {
    ...encounter,
    combatants: { ...encounter.combatants, [record.definition.id]: { ...record, state: { ...record.state, conditions } } },
  };
}

/** Quienes agarran a la criatura (sin repetir, en orden estable). */
function grapplersOf(record: CombatantRecord): CreatureId[] {
  return [
    ...new Set(record.state.conditions.flatMap((c) => (c.condition === "grappled" && c.sourceId !== null ? [c.sourceId] : []))),
  ].sort();
}

/** CD de escape del agarre de `grapplerId` sobre la criatura (la mayor si hay varias). */
function escapeDcOf(record: CombatantRecord, grapplerId: CreatureId): number | null {
  const dcs = record.state.conditions.flatMap((c) =>
    c.condition === "grappled" && c.sourceId === grapplerId && c.duration.kind === "untilEscape" ? [c.duration.escapeDc] : [],
  );
  return dcs.length === 0 ? null : Math.max(...dcs);
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
  const result = applyTurnCommandCore(encounter, turn, command, dice);
  if (!result.ok) return result;
  // Agarres que terminan por distancia o porque quien agarra quedó Incapacitado.
  return applyHouseRuleHooks(endBrokenGrapples(result.encounter), result.turn, turn.log.length, dice);
}

/**
 * Reglas caseras que reaccionan a lo que acaba de pasar: Daño masivo (por
 * cada criatura que recibió daño de un único origen) y Moral (disparadores
 * por estado). Se ejecutan tras cada orden aceptada, en ese orden.
 */
function applyHouseRuleHooks(encounter: Encounter, turn: TurnState, fromLog: number, dice: RandomSource): TurnCommandResult {
  let updated = encounter;
  const entries: TurnLogEntry[] = [];
  const pending: PendingSave[] = [...turn.pendingSaves];
  const events: { targetId: CreatureId; amount: number }[] = [];
  for (const entry of turn.log.slice(fromLog)) {
    const sum = (instances: readonly ModifiedDamage[]): number => instances.reduce((t, i) => t + i.final, 0);
    if (entry.kind === "attackResolved") events.push({ targetId: entry.targetId, amount: sum(entry.damageAfterDefenses) });
    if (entry.kind === "opportunityAttack") events.push({ targetId: entry.attack.targetId, amount: sum(entry.attack.damageAfterDefenses) });
    if (entry.kind === "effectResolved") {
      for (const t of entry.targets) events.push({ targetId: t.targetId, amount: sum(t.damageAfterDefenses) });
    }
  }
  for (const event of events) {
    if (!massiveDamageApplies(updated, event.targetId, event.amount)) continue;
    const outcome = resolveMassiveDamage(updated, event.targetId, dice, null, event.targetId === turn.actorId);
    if ("error" in outcome) {
      if (outcome.error === "playerSaveRequired") pending.push({ kind: "massiveDamage", creatureId: event.targetId });
      else entries.push({ kind: "massiveDamageUnresolved", creatureId: event.targetId });
      continue;
    }
    updated = outcome.encounter;
    entries.push({
      kind: "massiveDamage",
      creatureId: event.targetId,
      saveTotal: outcome.save.total,
      saveSucceeded: outcome.save.success,
      shockRoll: outcome.shockRoll,
      shock: outcome.shock,
    });
  }
  const morale = runStateMoraleChecks(updated, dice);
  updated = morale.encounter;
  for (const check of morale.checks) entries.push({ kind: "moraleCheck", check });
  if (entries.length === 0 && pending.length === turn.pendingSaves.length) return { ok: true, encounter, turn };
  return { ok: true, encounter: updated, turn: { ...turn, pendingSaves: pending, log: [...turn.log, ...entries] } };
}

function applyTurnCommandCore(
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

  if (command.kind === "resolvePendingSave") {
    const pendingSave = turn.pendingSaves.find((p) => p.creatureId === command.creatureId);
    if (!pendingSave) return fail("noPendingSave");
    const outcome = resolveMassiveDamage(encounter, command.creatureId, dice, command.playerSave, command.creatureId === turn.actorId);
    if ("error" in outcome) return fail(outcome.error === "playerSaveRequired" ? "playerSavesRequired" : "saveBonusUnknown");
    return {
      ok: true,
      encounter: outcome.encounter,
      turn: {
        ...turn,
        serial: turn.serial + 1,
        pendingSaves: turn.pendingSaves.filter((p) => p !== pendingSave),
        log: [
          ...turn.log,
          {
            kind: "massiveDamage",
            creatureId: command.creatureId,
            saveTotal: outcome.save.total,
            saveSucceeded: outcome.save.success,
            shockRoll: outcome.shockRoll,
            shock: outcome.shock,
          },
        ],
      },
    };
  }
  if (turn.pendingReactions.length > 0 && command.kind !== "resolveReaction") return fail("reactionsPending");

  switch (command.kind) {
    case "resolveReaction":
      return resolveReaction(encounter, turn, command, dice, next);

    case "move": {
      if (!canMoveNow(turn, actor)) return fail("movementNotAllowedNow");
      // Derribado: solo puede arrastrarse (cada pie cuesta 1 extra).
      const crawling = hasCondition(actor, "prone");
      // Se valida el recorrido entero antes de empezar.
      const whole = advanceMovement(encounter, actor, turn.movement, command.path, turn.budgetFeet, crawling ? 2 : 1);
      if (!whole.ok) return fail(whole.reasonCode, whole.placementReason);
      if (approachesFearSource(encounter, actor, command.path)) return fail("movementTowardFearSource");
      return walk(encounter, actor, turn, command.path, next);
    }

    case "beginCapability": {
      if (turn.execution !== null) return fail("executionInProgress");
      const begun = tryBegin(encounter, actor, turn, command.source);
      if (!begun.ok) return fail(begun.reasonCode);
      // DECISIÓN CONFIRMADA: la activación y los recursos se pagan una sola
      // vez, al iniciar, y no se devuelven.
      return {
        ok: true,
        encounter: begun.paidEncounter,
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
      return applyChoice(encounter, actor, turn, execution, option, dice, next, command.effectInput ?? {}, command.attackInput ?? {});
    }

    case "standUp": {
      if (!hasCondition(actor, "prone")) return fail("notProne");
      if (!canMoveNow(turn, actor)) return fail("cannotStandUp");
      // REGLA OFICIAL VERIFICADA (Derribado): cuesta la mitad de la Velocidad
      // (redondeando abajo); con Velocidad 0 no puede levantarse.
      const speed = effectiveSpeed(actor);
      const cost = speed === null ? 0 : Math.floor(speed / 2);
      if (turn.budgetFeet !== null && turn.movement.spentFeet + cost > turn.budgetFeet) return fail("cannotStandUp");
      return {
        ok: true,
        encounter: removeCondition(encounter, turn.actorId, "prone"),
        turn: next({ movement: { ...turn.movement, spentFeet: turn.movement.spentFeet + cost } }, [
          { kind: "stoodUp", spentFeet: cost },
        ]),
      };
    }

    case "escapeGrapple": {
      if (turn.execution !== null) return fail("executionInProgress");
      if (cannotAct(actor)) return fail("cannotAct");
      if (turn.actionUsed) return fail("actionAlreadyUsed");
      const dc = escapeDcOf(actor, command.grapplerId);
      if (dc === null) return fail("notGrappled");
      let check: EscapeCheck;
      if (actor.definition.kind === "playerCharacter") {
        if (!command.playerCheck) return fail("playerCheckRequired");
        check =
          "total" in command.playerCheck
            ? { source: "player", total: command.playerCheck.total, dc, success: command.playerCheck.total >= dc }
            : { source: "player", total: null, dc, success: command.playerCheck.outcome === "success" };
      } else {
        // Elige la mejor: FUE (Atletismo) o DES (Acrobacias). Sin datos, modificador 0.
        const modifier = (ability: "str" | "dex"): number => {
          const score = actor.definition.abilities?.[ability];
          return score === undefined ? 0 : Math.floor((score - 10) / 2);
        };
        const str = actor.definition.skills?.athletics ?? modifier("str");
        const dex = actor.definition.skills?.acrobatics ?? modifier("dex");
        const ability = dex > str ? "dex" : "str";
        const bonus = Math.max(str, dex);
        const adjust = abilityCheckConditions(encounter, actor);
        const first = rollDie(20, dice);
        const d20 = adjust.mode === "disadvantage" ? Math.min(first, rollDie(20, dice)) : first;
        const total = d20 + bonus - adjust.d20Penalty;
        check = { source: "virtual", ability, d20, bonus, penalty: adjust.d20Penalty, total, dc, success: total >= dc };
      }
      const escaped = check.success
        ? withConditions(
            encounter,
            actor,
            actor.state.conditions.filter((c) => !(c.condition === "grappled" && c.sourceId === command.grapplerId)),
          )
        : encounter;
      // La Velocidad es la distancia que puede recorrer en su turno: al recuperar
      // la Velocidad (deja de estar agarrada) recupera el movimiento del turno,
      // contando cada Correr (PENDIENTE DE VALIDAR, ver RULES_VERIFICATION.md).
      const freed = escaped.combatants[actor.definition.id]!;
      const speed = effectiveSpeed(freed);
      const dashes = turn.log.filter((e) => e.kind === "standardActionTaken" && e.action === "dash").length;
      const budgetFeet = speed === null || turn.budgetFeet === null ? turn.budgetFeet : Math.max(turn.budgetFeet, speed * (1 + dashes));
      return {
        ok: true,
        encounter: escaped,
        turn: next({ actionUsed: true, budgetFeet }, [{ kind: "escapeAttempt", grapplerId: command.grapplerId, check }]),
      };
    }

    case "surrender": {
      if (!actor.state.morale.fleeing) return fail("notFleeing");
      return {
        ok: true,
        encounter: {
          ...encounter,
          combatants: {
            ...encounter.combatants,
            [actor.definition.id]: { ...actor, state: { ...actor.state, morale: { ...actor.state.morale, surrendered: true } } },
          },
        },
        turn: next({ execution: null }, [{ kind: "surrendered" }]),
      };
    }

    case "endTurn": {
      if (turn.execution !== null) return fail("executionInProgress");
      if (turn.pendingSaves.length > 0) return fail("savesPending");
      // El turno no puede terminar en un espacio ocupado por otra criatura.
      const placement = validatePlacement(encounter, actor.state.position, actor.definition.size, {
        ignoreCreatureId: turn.actorId,
      });
      if (!placement.valid) return fail("invalidSquare", placement.reason);
      return {
        ok: true,
        encounter: expireConditionsAtTurnBoundary(encounter, turn.actorId, "end"),
        turn: next({ ended: true }, [{ kind: "turnEnded" }]),
      };
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
  effectInput: EffectInput,
  attackInput: AttackInput,
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

    case "effect": {
      const targets = effectAffected(encounter, actor, choice.operation, effectInput);
      if (!targets.ok) {
        return targets.areaReason === undefined
          ? fail(targets.reasonCode)
          : { ok: false, reasonCode: targets.reasonCode, areaReason: targets.areaReason };
      }
      const resolution = resolveEffect(
        encounter,
        choice.operation,
        targets.affected,
        dice,
        effectInput.playerSaves,
        actor.definition.id,
      );
      // Si faltan datos o tiradas de jugadores, no se consume nada.
      if (!resolution.ok) return { ok: false, reasonCode: resolution.reason, creatureIds: resolution.creatureIds };
      const updated: CapabilityExecution = { ...execution, agenda: option.rest };
      const entries = finished(
        [{ kind: "effectResolved", affected: targets.affected, rolls: resolution.rolls, targets: resolution.targets }],
        updated,
      );
      return {
        ok: true,
        encounter: resolution.encounter,
        turn: next({ execution: updated.agenda.length === 0 ? null : updated }, entries),
      };
    }

    case "standardAction": {
      const updated: CapabilityExecution = { ...execution, agenda: option.rest };
      const effects: Partial<TurnState> = {};
      switch (choice.action) {
        case "dash": {
          // REGLA OFICIAL VERIFICADA (Glosario 2024, "Dash"): movimiento extra igual a la Velocidad.
          // "Speed after applying any modifiers"; con Velocidad 0 que no puede aumentar no suma.
          const speed = speedCannotIncrease(actor) ? 0 : effectiveSpeed(actor);
          if (turn.budgetFeet !== null && speed !== null) {
            Object.assign(effects, { budgetFeet: turn.budgetFeet + speed });
          }
          break;
        }
        case "disengage":
          Object.assign(effects, { disengaged: true });
          break;
        case "dodge":
          // Persiste en la criatura hasta el inicio de su siguiente turno.
          Object.assign(effects, { dodging: true });
          break;
        case "attack":
          break;
      }
      const entries = finished([{ kind: "standardActionTaken", action: choice.action }], updated);
      const dodged =
        choice.action === "dodge"
          ? {
              ...encounter,
              combatants: {
                ...encounter.combatants,
                [actor.definition.id]: { ...actor, state: { ...actor.state, dodging: true } },
              },
            }
          : encounter;
      return {
        ok: true,
        encounter: dodged,
        turn: next({ ...effects, execution: updated.agenda.length === 0 ? null : updated }, entries),
      };
    }

    case "attack": {
      const performed = performAttack(encounter, actor, choice.attackId, choice.targetId, choice.rollMode, dice, attackInput);
      if (!performed.ok) return fail(performed.reasonCode);
      const { resolution } = performed.log;
      const updatedEncounter = performed.encounter;
      const updated: CapabilityExecution = {
        ...execution,
        agenda: option.rest,
        lastAttackHit: resolution.outcome !== "miss",
      };
      const entries = finished(
        [{ kind: "attackResolved", ...performed.log }],
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

// ---------------------------------------------------------------------------
// Ataques (del turno y de reacciones) y movimiento con ataques de oportunidad
// ---------------------------------------------------------------------------

type NextFn = (changes: Partial<TurnState>, entries: readonly TurnLogEntry[]) => TurnState;

/**
 * Un ataque concreto: valida alcance y objetivo, calcula Ventaja/Desventaja y
 * críticos por condiciones, tira (monstruos) o usa la tirada anotada
 * (personajes jugadores), aplica defensas y reglas de 0 PG.
 */
function performAttack(
  encounter: Encounter,
  attacker: CombatantRecord,
  attackId: AttackId,
  targetId: CreatureId,
  rollMode: RollMode,
  dice: RandomSource,
  input: AttackInput,
  context: { readonly duringOwnTurn: boolean; readonly extraAdvantage?: boolean } = { duringOwnTurn: true },
): { ok: true; encounter: Encounter; log: AttackOutcomeLog } | { ok: false; reasonCode: TurnCommandError } {
  const check = checkAttackTarget(encounter, attacker, attacker.state.position, attackId, targetId);
  if (!check.ok) return { ok: false, reasonCode: "unknownOption" };
  // REGLA OFICIAL VERIFICADA: dejar inconsciente solo con un ataque cuerpo a cuerpo.
  if (input.knockOut && check.attack.mode !== "melee") return { ok: false, reasonCode: "knockOutNotAllowed" };
  const rolled = attackConditions(
    encounter,
    attacker,
    check.target,
    check.distanceFeet,
    check.beyondNormalRange,
    check.attack.mode,
    context.extraAdvantage === true || (check.attack.mode === "melee" && isFlanking(encounter, attacker, check.target)),
  );

  let resolution: AttackResolution;
  if (attacker.definition.kind === "playerCharacter") {
    if (!input.playerRoll) return { ok: false, reasonCode: "playerAttackRequired" };
    const player = resolvePlayerAttack(
      { target: check.target.definition, mode: rollMode, criticalOnHit: rolled.criticalOnHit },
      input.playerRoll,
    );
    if (!player.resolved) {
      return { ok: false, reasonCode: player.reason === "targetArmorClassUnknown" ? "targetArmorClassUnknown" : player.reason };
    }
    resolution = player;
  } else {
    resolution = resolveAttack(
      {
        attack: check.attack,
        target: check.target.definition,
        mode: rollMode,
        d20Penalty: rolled.d20Penalty,
        criticalOnHit: rolled.criticalOnHit,
      },
      dice,
    );
  }
  // Sin CA registrada no se puede resolver: no se consume nada.
  if (!resolution.resolved) return { ok: false, reasonCode: "targetArmorClassUnknown" };

  const defended = applyDamageModifiers(
    check.target.definition,
    resolution.damage.map((part) => ({ type: part.type, amount: part.total })),
    { resistAll: conditionResistances(check.target) === "all" },
  );
  // Atacar a otra criatura con la parte que agarra suelta ese agarre (soltar es gratis).
  const released = releaseGrapples(encounter, attacker.definition.id, attackId, targetId);
  const damage = dealDamage(released, targetId, defended.total, {
    critical: resolution.outcome === "criticalHit",
    knockOut: input.knockOut === true,
  });
  // Regla casera Marcar: todo ataque cuerpo a cuerpo marca a su objetivo.
  let afterHit = damage.encounter;
  const conditionsApplied: ConditionId[] = [];
  if (resolution.outcome !== "miss") {
    for (const effect of check.attack.onHitConditions ?? []) {
      const target = afterHit.combatants[targetId];
      if (!target || (effect.targetMaxSize !== undefined && SIZE_ORDER.indexOf(target.definition.size) > SIZE_ORDER.indexOf(effect.targetMaxSize))) continue;
      const applied = applyCondition(afterHit, targetId, effect.condition, attacker.definition.id, effect.duration, {
        viaAttackId: attackId,
        rangeFeet: check.attack.rangeFeet.normal,
      });
      if (applied.applied) {
        afterHit = applied.encounter;
        conditionsApplied.push(effect.condition);
      }
    }
  }
  const marked =
    check.attack.mode === "melee" ? markTarget(afterHit, attacker.definition.id, targetId, context.duringOwnTurn) : afterHit;
  return {
    ok: true,
    encounter: marked,
    log: {
      attackId,
      targetId,
      resolution,
      damageAfterDefenses: defended.instances,
      damageApplied: damage.hitPointsLost,
      knockedOut: damage.knockedOut,
      targetLifeStateAfter: damage.lifeStateAfter,
      ...(conditionsApplied.length > 0 ? { conditionsApplied } : {}),
    },
  };
}

/** Alcance cuerpo a cuerpo de una criatura (el mayor de sus ataques cuerpo a cuerpo). */
function meleeAttacksReaching(encounter: Encounter, reactor: CombatantRecord, mover: CombatantRecord, at: GridPosition): AttackId[] {
  const distance =
    footprintDistanceSquares(
      reactor.state.position,
      reactor.definition.size,
      at,
      mover.definition.size,
      encounter.tableRules.diagonal,
    ) * encounter.grid.feetPerSquare;
  return reactor.definition.attacks.filter((a) => a.mode === "melee" && distance <= a.rangeFeet.normal).map((a) => a.id);
}

/**
 * Quién puede hacer un ataque de oportunidad si `mover` pasa de `from` a `to`
 * con su propio movimiento (REGLA OFICIAL VERIFICADA): lo ve, tiene la
 * reacción, puede actuar, y `mover` sale de su alcance. Destrabarse lo evita.
 * PENDIENTE: Ataque sin armas (todas las criaturas) y reacciones de ficha.
 */
function opportunityReactors(
  encounter: Encounter,
  mover: CombatantRecord,
  from: GridPosition,
  to: GridPosition,
  turn: TurnState,
): ReactionOpportunity[] {
  if (turn.disengaged) return [];
  return (Object.keys(encounter.combatants).sort() as CreatureId[]).flatMap((id) => {
    const reactor = encounter.combatants[id];
    if (!reactor || id === mover.definition.id) return [];
    // DECISIÓN CONFIRMADA: solo se ofrece a los enemigos del que se mueve.
    if (!isEnemy(reactor, mover)) return [];
    if (cannotAct(reactor) || !canSee(reactor, mover)) return [];
    // Regla casera Daño masivo: el shock impide reaccionar.
    if (reactor.state.shock !== null) return [];
    // Regla casera Marcar: contra quien marcó, sin gastar la reacción, una vez por turno.
    const turnKey = `${encounter.round}:${encounter.turnIndex}:${mover.definition.id}`;
    const viaMark =
      encounter.tableRules.mark && hasMarked(reactor, mover.definition.id) && reactor.state.markOpportunityTurnKey !== turnKey;
    if (!reactor.state.reactionAvailable && !viaMark) return [];
    if (cannotHarm(reactor, mover.definition.id)) return [];
    const before = meleeAttacksReaching(encounter, reactor, mover, from);
    if (before.length === 0) return [];
    const reachAfter = meleeAttacksReaching(encounter, reactor, mover, to);
    // "Leaves your reach": sale del alcance (del mayor de sus ataques cuerpo a cuerpo).
    if (reachAfter.length > 0) return [];
    return [{ kind: "opportunityAttack" as const, reactorId: id, moverId: mover.definition.id, attackIds: before, viaMark }];
  });
}

/**
 * Recorre `path` casilla a casilla. Si un paso provoca ataques de
 * oportunidad, el movimiento se detiene ANTES de ese paso y quedan pendientes.
 */
function walk(
  encounter: Encounter,
  actor: CombatantRecord,
  turn: TurnState,
  path: readonly GridPosition[],
  next: NextFn,
  exemptFirstStep: readonly CreatureId[] = [],
): TurnCommandResult {
  const crawling = hasCondition(actor, "prone");
  let position = actor.state.position;
  for (let i = 0; i < path.length; i++) {
    const square = path[i]!;
    const reactors = opportunityReactors(encounter, actor, position, square, turn).filter(
      (r) => i > 0 || !exemptFirstStep.includes(r.reactorId),
    );
    if (reactors.length > 0) {
      const done = path.slice(0, i);
      let progress = turn.movement;
      if (done.length > 0) {
        const moved = advanceMovement(encounter, actor, turn.movement, done, turn.budgetFeet, crawling ? 2 : 1);
        if (!moved.ok) return fail(moved.reasonCode, moved.placementReason);
        progress = moved.progress;
      }
      return {
        ok: true,
        encounter: withPosition(encounter, turn.actorId, progress.position),
        turn: next(
          {
            movement: progress,
            pendingReactions: reactors,
            pendingPath: path.slice(i),
            pendingStepReactorIds: [...(i === 0 ? exemptFirstStep : []), ...reactors.map((r) => r.reactorId)],
          },
          done.length > 0 ? [{ kind: "moved", path: done, spentFeet: progress.spentFeet - turn.movement.spentFeet }] : [],
        ),
      };
    }
    position = square;
  }
  const moved = advanceMovement(encounter, actor, turn.movement, path, turn.budgetFeet, crawling ? 2 : 1);
  if (!moved.ok) return fail(moved.reasonCode, moved.placementReason);
  return {
    ok: true,
    encounter: withPosition(encounter, turn.actorId, moved.progress.position),
    turn: next({ movement: moved.progress, pendingPath: [], pendingStepReactorIds: [] }, [
      { kind: "moved", path, spentFeet: moved.progress.spentFeet - turn.movement.spentFeet },
    ]),
  };
}

/** Decide una reacción pendiente y, si no quedan, sigue el movimiento. */
function resolveReaction(
  encounter: Encounter,
  turn: TurnState,
  command: Extract<TurnCommand, { kind: "resolveReaction" }>,
  dice: RandomSource,
  next: NextFn,
): TurnCommandResult {
  const pending = turn.pendingReactions.find((r) => r.reactorId === command.reactorId);
  if (!pending) return fail("noPendingReaction");
  let updated = encounter;
  const entries: TurnLogEntry[] = [];
  if (command.take) {
    const reactor = encounter.combatants[pending.reactorId];
    if (!reactor || cannotAct(reactor) || (!pending.viaMark && !reactor.state.reactionAvailable)) return fail("reactionNotAvailable");
    const attackId = command.attackId ?? pending.attackIds[0];
    if (attackId === undefined || !pending.attackIds.includes(attackId)) return fail("unknownOption");
    const mover = encounter.combatants[pending.moverId];
    if (!mover) return fail("unknownActor");
    const check = checkAttackTarget(encounter, reactor, reactor.state.position, attackId, pending.moverId);
    if (!check.ok) return fail("unknownOption");
    const mode = attackConditions(
      encounter,
      reactor,
      mover,
      check.distanceFeet,
      check.beyondNormalRange,
      check.attack.mode,
      pending.viaMark || isFlanking(encounter, reactor, mover),
    ).mode;
    const performed = performAttack(encounter, reactor, attackId, pending.moverId, mode, dice, command.attackInput ?? {}, {
      duringOwnTurn: false,
      extraAdvantage: pending.viaMark,
    });
    if (!performed.ok) return fail(performed.reasonCode);
    const after = performed.encounter.combatants[pending.reactorId]!;
    const turnKey = `${encounter.round}:${encounter.turnIndex}:${pending.moverId}`;
    updated = {
      ...performed.encounter,
      combatants: {
        ...performed.encounter.combatants,
        [pending.reactorId]: {
          ...after,
          state: pending.viaMark
            ? { ...after.state, markOpportunityTurnKey: turnKey }
            : { ...after.state, reactionAvailable: false },
        },
      },
    };
    entries.push({ kind: "opportunityAttack", reactorId: pending.reactorId, attack: performed.log });
  } else {
    entries.push({ kind: "reactionDeclined", reactorId: pending.reactorId });
  }

  const remaining = turn.pendingReactions.filter((r) => r !== pending);
  if (remaining.length > 0) return { ok: true, encounter: updated, turn: next({ pendingReactions: remaining }, entries) };

  // Sin reacciones pendientes: se revalida y se sigue el movimiento si se puede.
  const intermediate = next({ pendingReactions: [] }, entries);
  const mover = updated.combatants[turn.actorId];
  const path = turn.pendingPath;
  if (!mover || path.length === 0) {
    return { ok: true, encounter: updated, turn: { ...intermediate, pendingPath: [], pendingStepReactorIds: [] } };
  }
  const crawling = hasCondition(mover, "prone");
  const valid =
    canMoveNow(intermediate, mover) &&
    advanceMovement(updated, mover, intermediate.movement, path, intermediate.budgetFeet, crawling ? 2 : 1).ok &&
    !approachesFearSource(updated, mover, path);
  if (!valid) {
    return {
      ok: true,
      encounter: updated,
      turn: {
        ...intermediate,
        pendingPath: [],
        pendingStepReactorIds: [],
        log: [...intermediate.log, { kind: "movementStopped", remainingPath: path }],
      },
    };
  }
  const nextAfter: NextFn = (changes, more) => ({
    ...intermediate,
    ...changes,
    serial: intermediate.serial + 1,
    log: [...intermediate.log, ...more],
  });
  return walk(updated, mover, intermediate, path, nextAfter, intermediate.pendingStepReactorIds);
}
