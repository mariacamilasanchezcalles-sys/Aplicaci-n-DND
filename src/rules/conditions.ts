import type {
  AbilityId,
  ActiveCondition,
  CombatantRecord,
  ConditionId,
  CreatureId,
  DamageType,
  DurationSpec,
  Encounter,
} from "../models";
import type { RollMode } from "./resolution";

/**
 * CONDICIONES COMO EFECTOS MECÁNICOS.
 * Texto de cada condición: REGLA OFICIAL VERIFICADA (Glosario 2024, entradas
 * "[Condition]"). Aquí solo los efectos que el motor ya puede aplicar; el
 * resto está anotado como PENDIENTE junto a cada condición.
 */

type StoredCondition = ActiveCondition["condition"];

/** Condiciones que incluyen Incapacitado (Paralizado, Petrificado, Aturdido, Inconsciente). */
const IMPLIES_INCAPACITATED: ReadonlySet<StoredCondition> = new Set(["paralyzed", "petrified", "stunned", "unconscious"]);
/** "Speed 0 and can't increase". */
const SPEED_ZERO: ReadonlySet<StoredCondition> = new Set(["grappled", "restrained", "paralyzed", "petrified", "unconscious"]);
/** Fallan automáticamente las salvaciones de Fuerza y Destreza. */
const AUTO_FAIL_STR_DEX: ReadonlySet<StoredCondition> = new Set(["paralyzed", "petrified", "stunned", "unconscious"]);
/** "Attack rolls against you have Advantage". */
const ATTACKED_WITH_ADVANTAGE: ReadonlySet<StoredCondition> = new Set([
  "blinded",
  "paralyzed",
  "petrified",
  "restrained",
  "stunned",
  "unconscious",
]);
/** Impacto a 5 pies o menos = crítico. */
const AUTO_CRIT_WITHIN_5: ReadonlySet<StoredCondition> = new Set(["paralyzed", "unconscious"]);

/** ¿Tiene la condición (directamente o porque otra la incluye)? */
export function hasCondition(record: CombatantRecord, condition: ConditionId): boolean {
  if (condition === "exhaustion") return record.state.exhaustionLevel > 0;
  const stored = record.state.conditions;
  if (stored.some((c) => c.condition === condition)) return true;
  return condition === "incapacitated" && stored.some((c) => IMPLIES_INCAPACITATED.has(c.condition));
}

const anyOf = (record: CombatantRecord, set: ReadonlySet<StoredCondition>): boolean =>
  record.state.conditions.some((c) => set.has(c.condition));

/** No puede realizar acciones, acciones adicionales ni reacciones. */
export function cannotAct(record: CombatantRecord): boolean {
  return record.state.lifeState !== "alive" || hasCondition(record, "incapacitated");
}

/**
 * Velocidad efectiva en pies: 0 con Agarrado, Apresado, Paralizado,
 * Petrificado o Inconsciente ("can't increase"); el Cansancio la reduce en
 * 5 x nivel. null si la criatura no tiene Velocidad registrada.
 */
export function effectiveSpeed(record: CombatantRecord): number | null {
  const base = record.definition.stats.speedFeet;
  if (base === undefined) return null;
  if (record.state.lifeState !== "alive" || anyOf(record, SPEED_ZERO)) return 0;
  return Math.max(0, base - 5 * record.state.exhaustionLevel);
}

/** "Can't increase": Correr no añade movimiento. */
export function speedCannotIncrease(record: CombatantRecord): boolean {
  return anyOf(record, SPEED_ZERO);
}

/**
 * ¿Puede `observer` ver a `target`? PENDIENTE (percepción, luz, cobertura,
 * sentidos especiales): hoy solo cuentan Cegado e Invisible.
 */
export function canSee(observer: CombatantRecord, target: CombatantRecord): boolean {
  return !hasCondition(observer, "blinded") && !hasCondition(target, "invisible");
}

/** Orígenes de miedo de una criatura Asustada. */
export function fearSources(record: CombatantRecord): CreatureId[] {
  return record.state.conditions.flatMap((c) => (c.condition === "frightened" && c.sourceId ? [c.sourceId] : []));
}

/** Encantado: no puede atacar ni dañar a quien lo encantó. */
export function cannotHarm(attacker: CombatantRecord, targetId: CreatureId): boolean {
  return attacker.state.conditions.some((c) => c.condition === "charmed" && c.sourceId === targetId);
}

export interface AttackConditionsResult {
  readonly mode: RollMode;
  /** Penalización por Cansancio (−2 por nivel) a la tirada de ataque. */
  readonly d20Penalty: number;
  /** Si impacta, es crítico (Paralizado o Inconsciente, atacante a 5 pies o menos). */
  readonly criticalOnHit: boolean;
}

/**
 * Ventaja, Desventaja y críticos de una tirada de ataque por condiciones.
 * Ventaja y Desventaja no se acumulan y se anulan entre sí (verificado).
 */
export function attackConditions(
  encounter: Encounter,
  attacker: CombatantRecord,
  target: CombatantRecord,
  distanceFeet: number,
  beyondNormalRange: boolean,
): AttackConditionsResult {
  let advantage = false;
  let disadvantage = beyondNormalRange;
  const within5 = distanceFeet <= 5;

  // Atacante.
  if (hasCondition(attacker, "blinded") || hasCondition(attacker, "poisoned")) disadvantage = true;
  if (hasCondition(attacker, "prone") || hasCondition(attacker, "restrained")) disadvantage = true;
  for (const sourceId of fearSources(attacker)) {
    const source = encounter.combatants[sourceId];
    if (source && canSee(attacker, source)) disadvantage = true; // fuente "within line of sight"
  }
  const grapplers = attacker.state.conditions.filter((c) => c.condition === "grappled").map((c) => c.sourceId);
  if (grapplers.length > 0 && !grapplers.includes(target.definition.id)) disadvantage = true;
  if (hasCondition(attacker, "invisible") && !canSee(target, attacker)) advantage = true;

  // Objetivo.
  if (anyOf(target, ATTACKED_WITH_ADVANTAGE)) advantage = true;
  if (hasCondition(target, "prone")) {
    if (within5) advantage = true;
    else disadvantage = true;
  }
  if (hasCondition(target, "invisible") && !canSee(attacker, target)) disadvantage = true;

  const mode: RollMode = advantage === disadvantage ? "normal" : advantage ? "advantage" : "disadvantage";
  return {
    mode,
    d20Penalty: 2 * attacker.state.exhaustionLevel,
    criticalOnHit: within5 && anyOf(target, AUTO_CRIT_WITHIN_5),
  };
}

export interface SaveConditionsResult {
  readonly autoFail: boolean;
  readonly mode: RollMode;
  /** Penalización por Cansancio (−2 por nivel). */
  readonly d20Penalty: number;
}

/** Salvaciones afectadas por condiciones. */
export function saveConditions(record: CombatantRecord, ability: AbilityId): SaveConditionsResult {
  const strOrDex = ability === "str" || ability === "dex";
  return {
    autoFail: strOrDex && anyOf(record, AUTO_FAIL_STR_DEX),
    mode: ability === "dex" && hasCondition(record, "restrained") ? "disadvantage" : "normal",
    d20Penalty: 2 * record.state.exhaustionLevel,
  };
}

/** Defensas añadidas por condiciones: Petrificado tiene Resistencia a todo el daño. */
export function conditionResistances(record: CombatantRecord): readonly DamageType[] | "all" {
  return hasCondition(record, "petrified") ? "all" : [];
}

function isImmune(record: CombatantRecord, condition: ConditionId): boolean {
  if ((record.definition.conditionImmunities ?? []).includes(condition)) return true;
  // Petrificado: "Immunity to the Poisoned condition".
  return condition === "poisoned" && hasCondition(record, "petrified");
}

function withState(encounter: Encounter, record: CombatantRecord, state: CombatantRecord["state"]): Encounter {
  return {
    ...encounter,
    combatants: { ...encounter.combatants, [record.definition.id]: { ...record, state } },
  };
}

export type ApplyConditionResult =
  | { readonly applied: true; readonly encounter: Encounter }
  | { readonly applied: false; readonly reason: "immune" | "unknownCreature" | "dead" };

/**
 * Aplica una condición. No se acumula: si ya la tiene del mismo origen se
 * sustituye la duración. Cansancio sube un nivel; con 6 la criatura muere.
 * Inconsciente añade también Derribado ("Inert"; al terminar sigue Derribada).
 */
export function applyCondition(
  encounter: Encounter,
  targetId: CreatureId,
  condition: ConditionId,
  sourceId: CreatureId | null,
  duration: DurationSpec,
): ApplyConditionResult {
  const record = encounter.combatants[targetId];
  if (!record) return { applied: false, reason: "unknownCreature" };
  if (record.state.lifeState === "dead") return { applied: false, reason: "dead" };
  if (isImmune(record, condition)) return { applied: false, reason: "immune" };

  if (condition === "exhaustion") {
    const level = Math.min(6, record.state.exhaustionLevel + 1);
    return {
      applied: true,
      encounter: withState(encounter, record, {
        ...record.state,
        exhaustionLevel: level,
        lifeState: level >= 6 ? "dead" : record.state.lifeState,
      }),
    };
  }

  const add = (list: readonly ActiveCondition[], c: StoredCondition): ActiveCondition[] => [
    ...list.filter((x) => !(x.condition === c && x.sourceId === sourceId)),
    { condition: c, sourceId, duration },
  ];
  let conditions = add(record.state.conditions, condition);
  if (condition === "unconscious" && !isImmune(record, "prone")) {
    conditions = add(conditions, "prone");
  }
  return { applied: true, encounter: withState(encounter, record, { ...record.state, conditions }) };
}

/** Quita todas las instancias de una condición (Cansancio: baja un nivel). */
export function removeCondition(encounter: Encounter, targetId: CreatureId, condition: ConditionId): Encounter {
  const record = encounter.combatants[targetId];
  if (!record) return encounter;
  if (condition === "exhaustion") {
    return withState(encounter, record, {
      ...record.state,
      exhaustionLevel: Math.max(0, record.state.exhaustionLevel - 1),
    });
  }
  return withState(encounter, record, {
    ...record.state,
    conditions: record.state.conditions.filter((c) => c.condition !== condition),
  });
}

/**
 * Hace caducar las condiciones que duran "hasta el inicio/fin del turno" de
 * `creatureId` (en cualquier criatura del encuentro). Las duraciones en
 * asaltos y minutos necesitan la iniciativa (decisión 9) y no se aplican.
 */
export function expireConditionsAtTurnBoundary(
  encounter: Encounter,
  creatureId: CreatureId,
  boundary: "start" | "end",
): Encounter {
  let changed = false;
  const combatants: Record<string, CombatantRecord> = {};
  for (const [id, record] of Object.entries(encounter.combatants)) {
    const kept = record.state.conditions.filter((c) => {
      if (c.duration.kind !== "untilTurnBoundary" || c.duration.boundary !== boundary) return true;
      const whose = c.duration.whose === "source" ? c.sourceId : (id as CreatureId);
      return whose !== creatureId;
    });
    if (kept.length !== record.state.conditions.length) changed = true;
    combatants[id] = kept.length === record.state.conditions.length ? record : { ...record, state: { ...record.state, conditions: kept } };
  }
  return changed ? { ...encounter, combatants } : encounter;
}

/** Duraciones que el motor sabe hacer terminar (o que terminan por otra regla). */
export function durationSupported(duration: DurationSpec): boolean {
  return duration.kind === "untilTurnBoundary" || duration.kind === "untilEscape" || duration.kind === "indefinite";
}
