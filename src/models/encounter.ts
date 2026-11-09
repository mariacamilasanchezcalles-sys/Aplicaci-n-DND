import type { CreatureId, EncounterId } from "./ids";
import type { CombatantRecord } from "./creature";
import type { DiagonalRule, GridConfig } from "./position";
import type { SideIntentions, SideKnowledge } from "./knowledge";

/**
 * Política de ocupación de casillas, como DATO del encuentro para que el
 * motor de reglas pueda validarla.
 *
 * - `one-creature-per-space`: el espacio de una criatura (su huella según el
 *   tamaño: Pequeña/Mediana 1x1, Grande 2x2, Enorme 3x3, Gargantuesca 4x4)
 *   no puede solaparse con el de otra. PENDIENTE: las criaturas Diminutas
 *   (el manual permite 4 por casilla) se tratan como 1 casilla exclusiva.
 */
export type OccupancyPolicy = "one-creature-per-space";

/**
 * Cómo se atraviesan los espacios de otras criaturas.
 * - `houseSmallOrMedium`: REGLA CASERA del DM de la jugadora: se puede pasar,
 *   y detenerse a actuar, en el espacio de una criatura Diminuta, Pequeña o
 *   Mediana (aliada o enemiga) a coste normal; las Grandes o mayores bloquean.
 * PENDIENTE: la regla oficial 2024 (necesita bandos, decisión 4).
 */
export type MovementThroughCreaturesRule = "houseSmallOrMedium";

/**
 * CONFIGURACIÓN DE MESA (DECISIÓN CONFIRMADA 2026-11-07): interruptores de
 * reglas caseras y opcionales por encuentro. El motor la lee; el cerebro
 * táctico nunca la cambia. Solo contiene reglas IMPLEMENTADAS: una regla sin
 * implementar no puede activarse (ver docs/HOUSE_RULES.md).
 */
/**
 * Qué casillas cubre un área de efecto (las reglas 2024 no lo definen).
 * - `halfSquareDmg2014`: REGLA CASERA (Guía del DM 2014, "Áreas de efecto"):
 *   origen en una intersección; casilla afectada si el área cubre al menos la mitad.
 */
export type AreaTemplateRule = "halfSquareDmg2014";

export interface TableRules {
  readonly diagonal: DiagonalRule;
  readonly movementThroughCreatures: MovementThroughCreaturesRule;
  readonly areaTemplate: AreaTemplateRule;
  /** REGLA CASERA (guía DM 2014, "Flanquear"): Ventaja cuerpo a cuerpo al flanquear. */
  readonly flanking: boolean;
  /** REGLA CASERA (guía DM 2014, "Marcar"): ataques de oportunidad con Ventaja contra el marcado. */
  readonly mark: boolean;
  /** REGLA CASERA (guía DM 2014, "Daño masivo"): salvación de CON 15 y tabla de shock. */
  readonly massiveDamage: boolean;
  /** REGLA CASERA (guía DM 2014, "Moral"): monstruos que huyen o se rinden. */
  readonly morale: boolean;
}

/** Cómo se juzga una oposición "abrumadora" para la Moral (lo decide el DM por bando). */
export type OverwhelmingOpposition = "none" | "disadvantage" | "autoFail";

/** Datos de Moral por bando (solo monstruos). */
export interface SideMorale {
  /** Líder del grupo (opcional). */
  readonly leaderId: CreatureId | null;
  /** Miembros al empezar el combate. */
  readonly startingMembers: number;
  readonly overwhelming: OverwhelmingOpposition;
  /** Disparadores de grupo ya usados (cada uno una vez por combate). */
  readonly leaderTriggered: boolean;
  readonly halvedTriggered: boolean;
}

/**
 * Niveles de dificultad del cerebro táctico (DECISIÓN CONFIRMADA: calidad de
 * la búsqueda, nunca estadísticas ni información).
 */
export type DifficultyId = "easy" | "normal" | "hard";

/**
 * Ajustes del cerebro que se asignan en el encuentro (DECISIÓN CONFIRMADA:
 * personalidad y dificultad en el encuentro; supuestos según el nivel del
 * grupo). La personalidad va en la definición de cada monstruo.
 */
export interface BrainSettings {
  /** Nivel del grupo de personajes (supuesto inicial de CA, PG, ataque y salvación). null: sin definir. */
  readonly partyLevel: number | null;
  /** Dificultad de cada monstruo (por id); sin entrada: "normal" (PROPUESTA, decisión 112). */
  readonly difficultyByCreature: Readonly<Record<string, DifficultyId>>;
}

/**
 * Estado real y completo del combate. Es serializable a JSON (sin Map/Set).
 * Lo que cada monstruo CONOCE se modela aparte en el módulo `perception`.
 */
export interface Encounter {
  readonly id: EncounterId;
  readonly label: string;
  readonly grid: GridConfig;
  readonly occupancyPolicy: OccupancyPolicy;
  readonly tableRules: TableRules;
  readonly combatants: Readonly<Record<string, CombatantRecord>>;
  /** Orden de iniciativa (de mayor a menor, empates ya decididos). Vacío fuera de combate. */
  readonly initiativeOrder: readonly CreatureId[];
  /** Total de iniciativa de cada criatura (por id). */
  readonly initiativeTotals: Readonly<Record<string, number>>;
  /** Asalto actual (desde 1); 0 fuera de combate. */
  readonly round: number;
  /** Posición en `initiativeOrder` de quien tiene el turno; -1 fuera de combate. */
  readonly turnIndex: number;
  /** Moral por bando (regla casera). */
  readonly sideMorale: Readonly<Record<string, SideMorale>>;
  /** Conocimiento compartido de cada bando (percepción y memoria). */
  readonly sideKnowledge: Readonly<Record<string, SideKnowledge>>;
  /** Pizarra de intenciones de cada bando (cooperación, etapa 5 del cerebro). */
  readonly sideIntentions: Readonly<Record<string, SideIntentions>>;
  readonly brainSettings: BrainSettings;
}
