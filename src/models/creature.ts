import type { AttackId, BonusActionId, CreatureId, ResourceId, TraitId } from "./ids";
import type { GridPosition } from "./position";
import type { BonusActionActionType } from "./actions";
import type { Capability } from "./sheet";

/** PENDIENTE: catálogo de personalidades. Por ahora solo existe la de prueba. */
export type PersonalityId = "pragmatic";

/** Categorías de tamaño del manual. La huella en casillas la calcula `rules`. */
export type CreatureSize =
  | "tiny"
  | "small"
  | "medium"
  | "large"
  | "huge"
  | "gargantuan";

/**
 * Tipos de daño de las reglas 2024 (Rules Glossary, "Damage Types").
 * PENDIENTE DE VALIDAR: cotejar la lista con SRD 5.2.1.
 */
export type DamageType =
  | "acid"
  | "bludgeoning"
  | "cold"
  | "fire"
  | "force"
  | "lightning"
  | "necrotic"
  | "piercing"
  | "poison"
  | "psychic"
  | "radiant"
  | "slashing"
  | "thunder";

export interface DiceExpression {
  readonly count: number;
  readonly sides: number;
}

/** Condición para que un componente de daño se aplique (dato, no texto libre). */
export type DamageCondition = "attackRollHadAdvantage";

export interface DamageSpec {
  readonly dice: DiceExpression;
  readonly bonus: number;
  readonly type: DamageType;
  /** Si se omite, el componente siempre se aplica al impactar. */
  readonly condition?: DamageCondition;
}

export interface RangeFeet {
  readonly normal: number;
  readonly long?: number;
}

/**
 * Definición de un ataque (datos, sin reglas). `label` es solo para personas.
 * En ataques cuerpo a cuerpo, `rangeFeet.normal` es el alcance (reach).
 */
export interface AttackDefinition {
  readonly id: AttackId;
  readonly label: string;
  readonly mode: "melee" | "ranged";
  readonly rangeFeet: RangeFeet;
  readonly toHitBonus: number;
  readonly damage: readonly DamageSpec[];
}

/** Acción adicional que la criatura puede realizar (datos, sin lógica). */
export interface BonusActionDefinition {
  readonly id: BonusActionId;
  readonly label: string;
  readonly allowedActions: readonly BonusActionActionType[];
}

/** Rasgo pasivo. PENDIENTE: efectos tipados cuando se definan. */
export interface TraitDefinition {
  readonly id: TraitId;
  readonly label: string;
}

/** PENDIENTE: catálogo de recursos (conjuros, usos por descanso, etc.). */
export interface ResourcePool {
  readonly id: ResourceId;
  readonly current: number;
  readonly max: number;
}

/**
 * Estadísticas de combate. Opcionales a propósito: el registro simplificado
 * de personajes jugadores no exige la hoja completa.
 */
export interface CombatStats {
  readonly maxHitPoints?: number;
  readonly armorClass?: number;
  /** Si se omite, el motor no valida el presupuesto de movimiento. */
  readonly speedFeet?: number;
  /**
   * Ataques que permite una sola acción de Atacar. Si se omite, es 1: la
   * acción de Atacar base permite un ataque; más ataques los concede un rasgo
   * concreto (p. ej. Extra Attack o Multiattack de la ficha).
   */
  readonly attacksPerAttackAction?: number;
}

/** Rol de prueba para registros simplificados. PENDIENTE: catálogo definitivo. */
export type TestRole = "melee-fighter" | "ranged-spellcaster";

interface CombatantBase {
  readonly id: CreatureId;
  readonly label: string;
  readonly size: CreatureSize;
  readonly stats: CombatStats;
  readonly attacks: readonly AttackDefinition[];
  readonly bonusActions: readonly BonusActionDefinition[];
  readonly traits: readonly TraitDefinition[];
  /**
   * Capacidades declarativas (Multiataque, etc.) que ejecuta el motor paso a
   * paso (`rules/turnExecution.ts`). Opcional: las criaturas simples no la necesitan.
   */
  readonly capabilities?: readonly Capability[];
}

export interface MonsterDefinition extends CombatantBase {
  readonly kind: "monster";
  readonly personality: PersonalityId;
}

/** Registro simplificado: sin importación de fichas ni hoja completa. */
export interface PlayerCharacterDefinition extends CombatantBase {
  readonly kind: "playerCharacter";
  readonly registration: "simplified";
  readonly testRole: TestRole;
}

export type CombatantDefinition = MonsterDefinition | PlayerCharacterDefinition;

/** Estado mutable del combate de una criatura (separado de su definición). */
export interface CombatantState {
  readonly position: GridPosition;
  readonly currentHitPoints: number | null;
  readonly resources: readonly ResourcePool[];
}

export interface CombatantRecord {
  readonly definition: CombatantDefinition;
  readonly state: CombatantState;
}
