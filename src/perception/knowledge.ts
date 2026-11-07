import type {
  AttackId,
  CombatantRecord,
  ConditionId,
  CreatureId,
  CreatureSize,
  Encounter,
  GridPosition,
  LifeState,
  SideId,
} from "../models";
import { sidePerceives } from "./memory";
import type { PresumedAttack } from "./priors";

/**
 * VISTA DE CONOCIMIENTO (`KnowledgeView`): lo único que recibe el cerebro.
 * Distingue lo percibido, lo recordado, lo estimado (con incertidumbre) y lo
 * desconocido (simplemente no aparece). Diseño: TACTICAL_BRAIN_DESIGN.md §3.
 */

/**
 * Supuesto inicial para lo que aún no se ha observado (DECISIÓN CONFIRMADA:
 * según el nivel del grupo). PENDIENTE: la tabla por nivel; mientras tanto
 * quien construye la vista lo pasa (o null = sin supuesto).
 */
export interface KnowledgePriors {
  readonly armorClass: number | null;
  /** Intervalo plausible de CA antes de observar (para promediar probabilidades). */
  readonly armorClassRange: { readonly min: number; readonly max: number } | null;
  readonly maxHitPoints: number | null;
  /** Velocidad supuesta de un enemigo cuya Velocidad no se conoce. */
  readonly speedFeet: number | null;
  /** Ataque supuesto de un enemigo al que aún no se le conocen ataques. */
  readonly presumedAttack: PresumedAttack | null;
}

export const NO_PRIORS: KnowledgePriors = {
  armorClass: null,
  armorClassRange: null,
  maxHitPoints: null,
  speedFeet: null,
  presumedAttack: null,
};

/** Estimación con incertidumbre: cotas observadas y supuesto inicial. */
export interface Estimate {
  readonly atLeast: number | null;
  readonly atMost: number | null;
  readonly prior: number | null;
  /** Intervalo plausible supuesto (solo CA). */
  readonly priorRange?: { readonly min: number; readonly max: number } | null;
}

/** Lo que el bando sabe de sí mismo y de sus aliados: todo (comparten mente). */
export interface KnownAlly {
  readonly relation: "self" | "ally";
  readonly creatureId: CreatureId;
  readonly record: CombatantRecord;
}

/** Lo que el bando sabe de una criatura de otro bando. */
export interface KnownOther {
  readonly relation: "enemy";
  readonly creatureId: CreatureId;
  readonly side: SideId;
  readonly kind: "monster" | "playerCharacter";
  readonly size: CreatureSize;
  /** ¿La percibe ahora mismo algún miembro del bando? */
  readonly visibleNow: boolean;
  /** Posición actual si es visible; si no, la última vista. */
  readonly position: GridPosition | null;
  /** Asaltos desde que se vio por última vez (0 = ahora). */
  readonly positionAgeRounds: number | null;
  readonly lifeStateSeen: LifeState;
  readonly conditionsSeen: readonly ConditionId[];
  readonly armorClass: Estimate;
  /** PG máximos estimados (Maltrecho y daño neto visto). */
  readonly maxHitPoints: Estimate;
  readonly damageSeen: number;
  readonly healingSeen: number;
  readonly attacksSeen: readonly AttackId[];
  readonly capabilitiesSeen: readonly string[];
  /** Daño que se le ha visto causar (amenaza observada). */
  readonly damageDealtSeen: number;
}

export type KnownCreature = KnownAlly | KnownOther;

export interface KnowledgeView {
  readonly observerId: CreatureId;
  readonly side: SideId;
  readonly round: number;
  readonly knownCreatures: readonly KnownCreature[];
  /** Supuestos con los que se construyó (por nivel del grupo). */
  readonly priors: KnowledgePriors;
}

/**
 * Construye la vista de `observerId`: su bando completo (sí mismo y aliados)
 * y lo que el bando recuerda de los demás. Una criatura de otro bando que el
 * bando nunca ha percibido no aparece.
 */
export function buildKnowledgeView(
  encounter: Encounter,
  observerId: CreatureId,
  priors: KnowledgePriors = NO_PRIORS,
): KnowledgeView {
  const observer = encounter.combatants[observerId];
  if (!observer) throw new Error(`Criatura no encontrada: ${observerId}`);
  const side = observer.side;
  const memory = encounter.sideKnowledge[side]?.creatures ?? {};
  const known: KnownCreature[] = [];
  for (const id of Object.keys(encounter.combatants).sort() as CreatureId[]) {
    const record = encounter.combatants[id]!;
    if (record.side === side) {
      known.push({ relation: id === observerId ? "self" : "ally", creatureId: id, record });
      continue;
    }
    const m = memory[id];
    if (!m) continue;
    const visibleNow = sidePerceives(encounter, side, record);
    known.push({
      relation: "enemy",
      creatureId: id,
      side: m.side,
      kind: m.kind,
      size: m.size,
      visibleNow,
      position: visibleNow ? record.state.position : m.lastSeenPosition,
      positionAgeRounds: visibleNow ? 0 : m.lastSeenRound === null ? null : encounter.round - m.lastSeenRound,
      lifeStateSeen: m.lifeStateSeen,
      conditionsSeen: m.conditionsSeen,
      armorClass: {
        atLeast: m.armorClassAtLeast,
        atMost: m.armorClassAtMost,
        prior: priors.armorClass,
        priorRange: priors.armorClassRange,
      },
      maxHitPoints: {
        atLeast: m.netDamageSeenWhileNotBloodied === null ? null : 2 * m.netDamageSeenWhileNotBloodied + 1,
        atMost: m.netDamageSeenWhileBloodied === null ? null : 2 * m.netDamageSeenWhileBloodied,
        prior: priors.maxHitPoints,
      },
      damageSeen: m.damageSeen,
      healingSeen: m.healingSeen,
      attacksSeen: m.attacksSeen,
      capabilitiesSeen: m.capabilitiesSeen,
      damageDealtSeen: m.damageDealtSeen,
    });
  }
  return { observerId, side, round: encounter.round, knownCreatures: known, priors };
}

/** Punto de integración para el controlador. */
export interface PerceptionProvider {
  buildKnowledge(encounter: Encounter, observerId: CreatureId): KnowledgeView;
}
