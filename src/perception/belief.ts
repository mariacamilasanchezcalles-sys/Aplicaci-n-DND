import type { ActiveCondition, CombatantRecord, Encounter } from "../models";
import { asAttackId } from "../models";
import type { AttackDefinition, Capability } from "../models";
import type { Estimate, KnowledgePriors, KnowledgeView, KnownOther } from "./knowledge";
import type { PresumedAttack } from "./priors";

/** Id del ataque supuesto en el estado creído (no existe en la ficha real). */
export const PRESUMED_ATTACK_ID = asAttackId("presumed-attack");

function presumedAttackDefinition(presumed: PresumedAttack): AttackDefinition {
  return {
    id: PRESUMED_ATTACK_ID,
    label: "Ataque supuesto",
    mode: "melee",
    rangeFeet: { normal: presumed.reachFeet },
    toHitBonus: presumed.toHitBonus,
    damage: [{ dice: presumed.dice, bonus: presumed.damageBonus, type: "slashing" }],
  };
}

/**
 * ESTADO CREÍDO: un `Encounter` construido SOLO con la `KnowledgeView` (y los
 * datos públicos de la mesa: mapa, reglas, iniciativa). Sobre él el cerebro
 * prevé consecuencias con las reglas reales sin conocer los datos ocultos.
 * Diseño aprobado (TACTICAL_BRAIN_DESIGN.md §1).
 */

/**
 * Valor puntual de una estimación (PROPUESTA, decisión 80):
 * - con las dos cotas: el punto medio (redondeado);
 * - con una cota: el supuesto inicial dentro de la cota, o la cota;
 * - sin cotas: el supuesto inicial (o null si no hay).
 */
export function pointEstimate(estimate: Estimate): number | null {
  const { atLeast, atMost, prior } = estimate;
  if (atLeast !== null && atMost !== null) return Math.round((atLeast + atMost) / 2);
  if (atLeast !== null) return prior !== null ? Math.max(atLeast, prior) : atLeast;
  if (atMost !== null) return prior !== null ? Math.min(atMost, prior) : atMost;
  return prior;
}

/** Valores posibles de una estimación para promediar probabilidades (todas las CA del intervalo, o el punto). */
export function plausibleValues(estimate: Estimate): number[] {
  // Cotas observadas, completadas con el intervalo supuesto si falta alguna.
  const low = estimate.atLeast ?? estimate.priorRange?.min ?? null;
  const high = estimate.atMost ?? estimate.priorRange?.max ?? null;
  if (low !== null && high !== null && high >= low) {
    return Array.from({ length: high - low + 1 }, (_, i) => low + i);
  }
  const point = pointEstimate(estimate);
  return point === null ? [] : [point];
}

/** PG actuales estimados: máximo estimado − daño neto visto (al menos 1 si sigue en pie). */
export function estimatedCurrentHitPoints(known: KnownOther): number | null {
  const max = pointEstimate(known.maxHitPoints);
  if (max === null) return null;
  if (known.lifeStateSeen !== "alive") return 0;
  return Math.max(1, max - (known.damageSeen - known.healingSeen));
}

/** Reacciones vistas (con desencadenante sin parámetros) como capacidades con el ataque supuesto. */
function seenReactions(known: KnownOther): Capability[] {
  return known.reactionTriggersSeen.flatMap((trigger): Capability[] =>
    trigger === "selfHitByAttack" || trigger === "selfTakesDamage"
      ? [
          {
            id: `seen-reaction-${trigger}`,
            label: "Reacción vista",
            activation: "reaction",
            trigger: { kind: trigger },
            body: { op: "attack", attackRef: PRESUMED_ATTACK_ID },
          },
        ]
      : [],
  );
}

function beliefRecord(known: KnownOther, priors: KnowledgePriors): CombatantRecord | null {
  if (known.position === null) return null;
  const maxHitPoints = pointEstimate(known.maxHitPoints);
  const armorClass = pointEstimate(known.armorClass);
  const conditions: ActiveCondition[] = known.conditionsSeen
    .filter((c): c is ActiveCondition["condition"] => c !== "exhaustion")
    .map((condition) => ({ condition, sourceId: null, duration: { kind: "indefinite" } }));
  const base = {
    id: known.creatureId,
    label: known.creatureId,
    size: known.size,
    // Velocidad y ataques: supuestos por nivel (PROPUESTA, decisión 85); defensas: desconocidas.
    stats: {
      ...(maxHitPoints === null ? {} : { maxHitPoints }),
      ...(armorClass === null ? {} : { armorClass }),
      ...(priors.speedFeet === null ? {} : { speedFeet: priors.speedFeet }),
    },
    attacks: priors.presumedAttack === null ? [] : [presumedAttackDefinition(priors.presumedAttack)],
    bonusActions: [],
    traits: [],
    // Reacciones que se le han visto usar: se supone que las repite con su
    // ataque supuesto (PROPUESTA, decisión 108).
    ...(priors.presumedAttack === null || seenReactions(known).length === 0 ? {} : { capabilities: seenReactions(known) }),
  };
  return {
    definition:
      known.kind === "monster"
        ? { ...base, kind: "monster", personality: "pragmatic" }
        : { ...base, kind: "playerCharacter", registration: "simplified", testRole: "melee-fighter" },
    side: known.side,
    state: {
      position: known.position,
      currentHitPoints: estimatedCurrentHitPoints(known),
      resources: [],
      conditions,
      exhaustionLevel: known.conditionsSeen.includes("exhaustion") ? 1 : 0,
      lifeState: known.lifeStateSeen,
      deathSaves: { successes: 0, failures: 0 },
      reactionAvailable: true,
      dodging: false,
      marks: [],
      markOpportunityTurnKey: null,
      shock: null,
      morale: { fleeing: false, surrendered: false, belowHalfTriggered: false },
    },
  };
}

/**
 * Construye el estado creído del bando de `view.observerId`. Del encuentro
 * real solo toma lo público (mapa, reglas de mesa, iniciativa) y los
 * registros del propio bando; los enemigos salen de la memoria. Un enemigo
 * sin posición conocida no se coloca.
 */
export function buildBeliefEncounter(publicEncounter: Encounter, view: KnowledgeView): Encounter {
  const combatants: Record<string, CombatantRecord> = {};
  for (const known of view.knownCreatures) {
    if (known.relation === "enemy") {
      const record = beliefRecord(known, view.priors);
      if (record) combatants[known.creatureId] = record;
    } else {
      combatants[known.creatureId] = known.record;
    }
  }
  const ownMorale = publicEncounter.sideMorale[view.side];
  return {
    id: publicEncounter.id,
    label: publicEncounter.label,
    grid: publicEncounter.grid,
    occupancyPolicy: publicEncounter.occupancyPolicy,
    tableRules: publicEncounter.tableRules,
    // Completo (es público); los enemigos sin posición conocida simplemente no tienen registro.
    initiativeOrder: publicEncounter.initiativeOrder,
    initiativeTotals: publicEncounter.initiativeTotals,
    round: publicEncounter.round,
    turnIndex: publicEncounter.turnIndex,
    sideMorale: ownMorale ? { [view.side]: ownMorale } : {},
    sideKnowledge: {},
    combatants,
  };
}
