import type { CreatureSize, DamageType, DiceExpression, RangeFeet, DamageCondition } from "./creature";
import type { StandardActionType } from "./actions";

/**
 * FICHA DECLARATIVA DE CRIATURA (formato JSON). Solo tipos: aquí no hay reglas.
 *
 * La ficha DECLARA capacidades; el motor de reglas las interpreta con
 * manejadores generales por tipo de operación y de efecto. Nunca se programa
 * un comportamiento por monstruo. Diseño completo y estado de cada decisión:
 * docs/SHEET_ARCHITECTURE.md.
 *
 * Todos los identificadores (`id`, `*Ref`) son datos funcionales; los `label`
 * son solo para personas y el programa nunca los interpreta.
 */

/** Versión del formato de ficha. Cambia cuando cambie la forma del JSON. */
export const SHEET_FORMAT_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Vocabulario cerrado (PENDIENTE DE VALIDAR contra SRD 5.2.1)
// ---------------------------------------------------------------------------

export type AbilityId = "str" | "dex" | "con" | "int" | "wis" | "cha";

export type CreatureTypeId =
  | "aberration"
  | "beast"
  | "celestial"
  | "construct"
  | "dragon"
  | "elemental"
  | "fey"
  | "fiend"
  | "giant"
  | "humanoid"
  | "monstrosity"
  | "ooze"
  | "plant"
  | "undead";

/** Condiciones de las reglas 2024. Cada una tendrá efectos mecánicos, no solo etiqueta. */
export type ConditionId =
  | "blinded"
  | "charmed"
  | "deafened"
  | "exhaustion"
  | "frightened"
  | "grappled"
  | "incapacitated"
  | "invisible"
  | "paralyzed"
  | "petrified"
  | "poisoned"
  | "prone"
  | "restrained"
  | "stunned"
  | "unconscious";

export type SkillId =
  | "acrobatics"
  | "animalHandling"
  | "arcana"
  | "athletics"
  | "deception"
  | "history"
  | "insight"
  | "intimidation"
  | "investigation"
  | "medicine"
  | "nature"
  | "perception"
  | "performance"
  | "persuasion"
  | "religion"
  | "sleightOfHand"
  | "stealth"
  | "survival";

export type AreaShape = "cone" | "cube" | "cylinder" | "emanation" | "line" | "sphere";

// ---------------------------------------------------------------------------
// Datos básicos de la criatura
// ---------------------------------------------------------------------------

export interface SheetSource {
  /** `testFixture`: dato de prueba, nunca estadística oficial. */
  readonly kind: "official" | "homebrew" | "testFixture";
  /** Referencia bibliográfica para personas (p. ej. "MM 2024, p. 142"). */
  readonly reference?: string;
}

export interface HitPointsSpec {
  readonly average: number;
  readonly formula?: { readonly dice: DiceExpression; readonly bonus: number };
}

/** Velocidades en pies. `walk` es obligatoria (puede ser 0). */
export interface SpeedSpec {
  readonly walk: number;
  readonly burrow?: number;
  readonly climb?: number;
  readonly fly?: number;
  readonly swim?: number;
  readonly hover?: boolean;
}

/** Sentidos en pies de alcance. */
export interface SensesSpec {
  readonly blindsight?: number;
  readonly darkvision?: number;
  readonly tremorsense?: number;
  readonly truesight?: number;
  readonly passivePerception?: number;
}

// ---------------------------------------------------------------------------
// Recursos y costes
// ---------------------------------------------------------------------------

/** Cómo se recupera un recurso de usos limitados. */
export type RecoverySpec =
  /** Recarga X–6: al inicio del turno de la criatura se tira 1d6 (dado virtual). */
  | { readonly kind: "recharge"; readonly minRoll: number }
  | { readonly kind: "shortRest" }
  | { readonly kind: "longRest" };

export interface ResourceDefinition {
  readonly id: string;
  readonly label: string;
  readonly max: number;
  readonly recovery: readonly RecoverySpec[];
}

/** Coste además del de activación (acción, adicional o reacción). */
export type CostSpec =
  | { readonly kind: "resource"; readonly resourceRef: string; readonly amount: number }
  | { readonly kind: "spellSlot"; readonly minLevel: number };

// ---------------------------------------------------------------------------
// Condiciones de uso (requisitos y `conditional`)
// ---------------------------------------------------------------------------

/**
 * Predicados declarativos. El motor los evalúa; la ficha no contiene lógica.
 * Los requisitos que se derivan de la operación (alcance de un ataque, tener
 * la acción disponible…) NO se declaran: los aplica siempre el motor.
 */
export type SheetPredicate =
  | { readonly kind: "resourceAvailable"; readonly resourceRef: string }
  | { readonly kind: "selfHasCondition"; readonly condition: ConditionId }
  | { readonly kind: "selfLacksCondition"; readonly condition: ConditionId }
  | { readonly kind: "targetHasCondition"; readonly condition: ConditionId }
  /** Maltrecha (Bloodied): PG a la mitad o menos. Sin efecto mecánico propio. */
  | { readonly kind: "selfBloodied" }
  /** La operación anterior de esta misma capacidad impactó. */
  | { readonly kind: "previousAttackHit" }
  | { readonly kind: "not"; readonly predicate: SheetPredicate }
  | { readonly kind: "all"; readonly predicates: readonly SheetPredicate[] }
  | { readonly kind: "any"; readonly predicates: readonly SheetPredicate[] };

// ---------------------------------------------------------------------------
// Efectos
// ---------------------------------------------------------------------------

export type DurationSpec =
  | { readonly kind: "instantaneous" }
  | { readonly kind: "rounds"; readonly count: number }
  | { readonly kind: "minutes"; readonly count: number }
  | {
      readonly kind: "untilTurnBoundary";
      readonly boundary: "start" | "end";
      readonly whose: "source" | "target";
    }
  /** Hasta que la criatura escape (p. ej. Agarrado con CD de escape). */
  | { readonly kind: "untilEscape"; readonly escapeDc: number }
  /** Hasta que otra regla o efecto la termine (p. ej. Inconsciente al llegar a 0 PG). */
  | { readonly kind: "indefinite" };

export interface SavingThrowSpec {
  readonly ability: AbilityId;
  /** CD fija, o la de lanzamiento de conjuros de la ficha. */
  readonly dc: number | "spellSaveDc";
  /** Qué ocurre si la salvación tiene éxito. */
  readonly onSuccess: "negates" | "halfDamage";
}

export type EffectSpec =
  | {
      readonly kind: "damage";
      readonly dice?: DiceExpression;
      readonly bonus: number;
      readonly damageType: DamageType;
      readonly condition?: DamageCondition;
    }
  | { readonly kind: "heal"; readonly dice?: DiceExpression; readonly bonus: number }
  | { readonly kind: "tempHitPoints"; readonly dice?: DiceExpression; readonly bonus: number }
  | { readonly kind: "applyCondition"; readonly condition: ConditionId; readonly duration: DurationSpec }
  | { readonly kind: "removeCondition"; readonly condition: ConditionId }
  | { readonly kind: "forcedMovement"; readonly direction: "push" | "pull"; readonly distanceFeet: number };

/**
 * A quién afecta una operación de efecto. Los ataques eligen su objetivo con
 * las reglas de ataque, no con esto.
 */
export type TargetingSpec =
  | { readonly kind: "self" }
  | { readonly kind: "creatures"; readonly count: number; readonly rangeFeet: number }
  | {
      readonly kind: "area";
      readonly shape: AreaShape;
      /** Radio (esfera, cilindro), lado (cubo), longitud (cono, línea) o distancia (emanación). */
      readonly sizeFeet: number;
      /** Distancia a la que puede estar el punto de origen (0 = desde la criatura). */
      readonly rangeFeet: number;
      /** Solo líneas: anchura (por defecto 5 pies). */
      readonly widthFeet?: number;
      /** Si la propia criatura puede quedar afectada (por defecto no). */
      readonly includesSelf?: boolean;
    };

// ---------------------------------------------------------------------------
// Ataques (operación atómica más común)
// ---------------------------------------------------------------------------

/**
 * Un ataque concreto de la ficha (p. ej. Cimitarra). No es una acción: se usa
 * con la acción de Atacar, o desde una capacidad compuesta (Multiataque).
 * En cuerpo a cuerpo `rangeFeet.normal` es el alcance (reach).
 */
export interface SheetAttack {
  readonly id: string;
  readonly label: string;
  readonly mode: "melee" | "ranged";
  readonly rangeFeet: RangeFeet;
  readonly toHitBonus: number;
  readonly onHit: readonly EffectSpec[];
  readonly onMiss?: readonly EffectSpec[];
  /** Efectos que ocurren impacte o falle (notación "Hit or Miss" del SRD 5.2.1). */
  readonly onHitOrMiss?: readonly EffectSpec[];
}

// ---------------------------------------------------------------------------
// Operaciones: atómicas y compuestas
// ---------------------------------------------------------------------------

/**
 * Árbol de operaciones de una capacidad. Las estructuras compuestas
 * (sequence, choice, repeat, optional, conditional) son herramientas de
 * representación, NO reglas de D&D.
 */
export type Operation =
  // --- atómicas ---
  /** Una tirada de ataque con un ataque de la ficha. */
  | { readonly op: "attack"; readonly attackRef: string }
  /** Realizar una acción estándar (p. ej. Escapismo Ágil: Destrabarse o Esconderse). */
  | { readonly op: "standardAction"; readonly action: StandardActionType }
  /** Efectos sin tirada de ataque (aliento, aura…), con salvación opcional. */
  | {
      readonly op: "effect";
      readonly targeting: TargetingSpec;
      readonly save?: SavingThrowSpec;
      readonly effects: readonly EffectSpec[];
    }
  /** Usar el cuerpo de otra capacidad SIN pagar su activación. */
  | { readonly op: "capability"; readonly capabilityRef: string }
  /** Lanzar un conjuro declarado en `spellcasting`. */
  | { readonly op: "castSpell"; readonly spellRef: string }
  /** Mecánica que existe en la ficha pero aún no tiene representación. */
  | { readonly op: "unmodeled"; readonly note: string }
  // --- compuestas ---
  | { readonly op: "sequence"; readonly steps: readonly Operation[] }
  | { readonly op: "choice"; readonly options: readonly Operation[] }
  | { readonly op: "repeat"; readonly times: number; readonly body: Operation }
  | { readonly op: "optional"; readonly body: Operation }
  | {
      readonly op: "conditional";
      readonly when: SheetPredicate;
      readonly then: Operation;
      readonly otherwise?: Operation;
    };

export type OperationKind = Operation["op"];

// ---------------------------------------------------------------------------
// Capacidades (acciones, acciones adicionales y reacciones de la ficha)
// ---------------------------------------------------------------------------

/** Desencadenantes de reacción (eventos de combate). Lista ampliable. */
export type TriggerSpec =
  | { readonly kind: "creatureLeavesReach" }
  | { readonly kind: "selfTargetedByAttack" }
  | { readonly kind: "selfHitByAttack" }
  | { readonly kind: "selfTakesDamage" }
  | { readonly kind: "creatureEntersArea"; readonly rangeFeet: number }
  | { readonly kind: "selfDropsToZeroHitPoints" }
  | { readonly kind: "creatureTakesAction"; readonly action: StandardActionType };

export type ActivationKind = "action" | "bonusAction" | "reaction";

export interface Capability {
  readonly id: string;
  readonly label: string;
  /** Qué ranura de la economía de acciones consume (se paga una sola vez). */
  readonly activation: ActivationKind;
  /**
   * La capacidad se realiza COMO esa acción estándar. Multiataque: "attack"
   * (REGLA OFICIAL VERIFICADA, SRD 5.2.1 "Multiattack": sus ataques son parte
   * de la acción de Atacar; por "Moving between Attacks" se puede mover entre
   * ellos). Solo válido con `activation: "action"`.
   */
  readonly takenAs?: "attack";
  /** Obligatorio si y solo si `activation` es "reaction". */
  readonly trigger?: TriggerSpec;
  readonly costs?: readonly CostSpec[];
  readonly requirements?: readonly SheetPredicate[];
  readonly concentration?: boolean;
  readonly body: Operation;
}

// ---------------------------------------------------------------------------
// Rasgos pasivos y conjuros
// ---------------------------------------------------------------------------

export type PassiveEffectSpec =
  /** Rasgo sin representación mecánica todavía (se avisa al cargar). */
  { readonly kind: "unmodeled"; readonly note: string };

export interface TraitSpec {
  readonly id: string;
  readonly label: string;
  readonly effects: readonly PassiveEffectSpec[];
}

export type SpellUsage =
  | { readonly kind: "atWill" }
  | { readonly kind: "perDay"; readonly uses: number }
  | { readonly kind: "slots" };

export interface SpellcastingSpec {
  readonly ability: AbilityId;
  readonly saveDc?: number;
  readonly attackBonus?: number;
  /** Espacios por nivel de conjuro: { "1": 4, "2": 3 }. */
  readonly slots?: Readonly<Record<string, number>>;
  readonly spells: readonly {
    /** Referencia a un catálogo de conjuros (PENDIENTE: aún no existe). */
    readonly spellRef: string;
    readonly usage: SpellUsage;
  }[];
}

// ---------------------------------------------------------------------------
// Ficha completa
// ---------------------------------------------------------------------------

/**
 * Ficha de criatura. Solo son obligatorios los datos mínimos para combatir;
 * una ficha sencilla no necesita estructuras vacías. La personalidad y la
 * habilidad táctica NO están en la ficha: se asignan en el encuentro.
 */
export interface CreatureSheet {
  readonly sheetFormat: typeof SHEET_FORMAT_VERSION;
  readonly id: string;
  readonly label: string;
  readonly source: SheetSource;
  readonly size: CreatureSize;
  readonly creatureType?: CreatureTypeId;
  readonly armorClass: number;
  readonly hitPoints: HitPointsSpec;
  readonly speed: SpeedSpec;
  readonly abilities?: Partial<Record<AbilityId, number>>;
  /** Bonificador total de salvación cuando difiere del modificador. */
  readonly savingThrows?: Partial<Record<AbilityId, number>>;
  readonly skills?: Partial<Record<SkillId, number>>;
  readonly senses?: SensesSpec;
  readonly damageResistances?: readonly DamageType[];
  readonly damageImmunities?: readonly DamageType[];
  readonly damageVulnerabilities?: readonly DamageType[];
  readonly conditionImmunities?: readonly ConditionId[];
  readonly resources?: readonly ResourceDefinition[];
  readonly traits?: readonly TraitSpec[];
  /** Ataques concretos que la criatura conoce (no son acciones por sí mismos). */
  readonly attacks?: readonly SheetAttack[];
  /** Acciones, acciones adicionales y reacciones propias de la ficha. */
  readonly capabilities?: readonly Capability[];
  readonly spellcasting?: SpellcastingSpec;
}
