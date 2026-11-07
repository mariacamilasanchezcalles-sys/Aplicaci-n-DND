import type { AttackId, CreatureId } from "./ids";
import type { CreatureSize, LifeState, SideId } from "./creature";
import type { ConditionId } from "./sheet";
import type { GridPosition } from "./position";

/**
 * MEMORIA DE UN BANDO (DECISIÓN CONFIRMADA 2026-11-07: los monstruos de un
 * mismo bando comparten todo su conocimiento). Solo datos observados: nunca
 * se copian PG ni CA reales de otra criatura. Serializable a JSON.
 * Diseño: docs/TACTICAL_BRAIN_DESIGN.md §3.
 */
export interface CreatureMemory {
  readonly creatureId: CreatureId;
  readonly side: SideId;
  readonly size: CreatureSize;
  /** Última posición vista y asalto en que se vio (null si nunca). */
  readonly lastSeenPosition: GridPosition | null;
  readonly lastSeenRound: number | null;
  /** Estado vital y condiciones la última vez que se vio. */
  readonly lifeStateSeen: LifeState;
  readonly conditionsSeen: readonly ConditionId[];
  /**
   * Cotas de la CA aprendidas de las tiradas del propio bando (conocen su
   * total): impacta con T → CA ≤ T; falla con T → CA ≥ T + 1. El 20 y el 1
   * naturales no informan.
   */
  readonly armorClassAtLeast: number | null;
  readonly armorClassAtMost: number | null;
  /** Daño y curación que el bando ha visto recibir (netos para estimar PG). */
  readonly damageSeen: number;
  readonly healingSeen: number;
  /**
   * Para estimar los PG máximos con Maltrecho (REGLA OFICIAL VERIFICADA:
   * Maltrecho = la mitad de sus PG o menos). Daño neto visto mientras NO
   * estaba Maltrecho (el mayor) → máximo > 2 × eso; daño neto visto ya
   * Maltrecho (el menor) → máximo ≤ 2 × eso.
   */
  readonly netDamageSeenWhileNotBloodied: number | null;
  readonly netDamageSeenWhileBloodied: number | null;
  /** Ataques y capacidades que se le han visto usar. */
  readonly attacksSeen: readonly AttackId[];
  readonly capabilitiesSeen: readonly string[];
  /** Daño que se le ha visto causar (amenaza observada). */
  readonly damageDealtSeen: number;
}

export interface SideKnowledge {
  /** Memoria por criatura observada (por id). */
  readonly creatures: Readonly<Record<string, CreatureMemory>>;
}
