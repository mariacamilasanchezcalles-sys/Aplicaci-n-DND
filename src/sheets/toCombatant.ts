import { asAttackId, asBonusActionId, asCreatureId, asTraitId } from "../models";
import type {
  AttackDefinition,
  BonusActionActionType,
  BonusActionDefinition,
  CreatureSheet,
  DamageSpec,
  MonsterDefinition,
  Operation,
  PersonalityId,
} from "../models";

/**
 * Puente TEMPORAL entre la ficha declarativa y el modelo que el motor de
 * reglas ya sabe validar (`MonsterDefinition`). Permite usar fichas JSON hoy
 * sin reescribir el motor. Todo lo que el motor actual no puede ejecutar se
 * informa como hueco (`gaps`), nunca se descarta en silencio ni se aproxima.
 */

export type AdapterGapReason =
  /** Capacidad de acción con operaciones (p. ej. Multiataque): falta el ejecutor de capacidades. */
  | "capabilityNotExecutable"
  /** Acción adicional con costes, requisitos u operaciones distintas de acciones estándar. */
  | "bonusActionNotRepresentable"
  /** Reacciones: faltan el sistema de eventos y la reacción en el motor. */
  | "reactionNotSupported"
  /** Efectos de un ataque distintos del daño (condición, empujón…) o efectos al fallar. */
  | "attackEffectNotSupported"
  | "spellcastingNotSupported"
  | "resourcesNotSupported"
  | "traitEffectNotSupported"
  /** Resistencias, inmunidades o vulnerabilidades: `applyDamage` aún no las aplica. */
  | "damageModifiersNotSupported"
  | "conditionImmunitiesNotSupported";

export interface AdapterGap {
  readonly path: string;
  readonly reason: AdapterGapReason;
}

export interface CombatantFromSheetOptions {
  /** Id de la criatura en el encuentro (una ficha puede usarse varias veces). */
  readonly creatureId: string;
  /** Etiqueta visible; por defecto, la de la ficha. */
  readonly label?: string;
  /** La personalidad se asigna en el encuentro, no en la ficha. */
  readonly personality: PersonalityId;
  /** PG máximos distintos de la ficha (p. ej. dato provisional de un escenario de prueba). */
  readonly maxHitPointsOverride?: number;
}

export interface CombatantFromSheet {
  readonly definition: MonsterDefinition;
  readonly gaps: readonly AdapterGap[];
}

/** Acciones estándar que puede ejecutar una acción adicional en el modelo actual. */
function standardActionsOf(body: Operation): BonusActionActionType[] | null {
  if (body.op === "standardAction") {
    return body.action === "attack" ? null : [body.action];
  }
  if (body.op === "choice") {
    const actions: BonusActionActionType[] = [];
    for (const option of body.options) {
      const inner = standardActionsOf(option);
      if (inner === null) return null;
      actions.push(...inner);
    }
    return actions;
  }
  return null;
}

export function combatantFromSheet(
  sheet: CreatureSheet,
  options: CombatantFromSheetOptions,
): CombatantFromSheet {
  const gaps: AdapterGap[] = [];

  const attacks: AttackDefinition[] = (sheet.attacks ?? []).map((attack, index) => {
    const damage: DamageSpec[] = [];
    attack.onHit.forEach((effect, i) => {
      if (effect.kind !== "damage") {
        gaps.push({ path: `attacks[${index}].onHit[${i}]`, reason: "attackEffectNotSupported" });
        return;
      }
      damage.push({
        // Daño fijo (sin dados): 0 dados, solo el bonificador.
        dice: effect.dice ?? { count: 0, sides: 1 },
        bonus: effect.bonus,
        type: effect.damageType,
        ...(effect.condition === undefined ? {} : { condition: effect.condition }),
      });
    });
    if (attack.onMiss) gaps.push({ path: `attacks[${index}].onMiss`, reason: "attackEffectNotSupported" });
    return {
      id: asAttackId(attack.id),
      label: attack.label,
      mode: attack.mode,
      rangeFeet: attack.rangeFeet,
      toHitBonus: attack.toHitBonus,
      damage,
    };
  });

  const bonusActions: BonusActionDefinition[] = [];
  (sheet.capabilities ?? []).forEach((capability, index) => {
    const path = `capabilities[${index}]`;
    switch (capability.activation) {
      case "action":
        gaps.push({ path, reason: "capabilityNotExecutable" });
        break;
      case "reaction":
        gaps.push({ path, reason: "reactionNotSupported" });
        break;
      case "bonusAction": {
        const allowed = standardActionsOf(capability.body);
        const plain =
          (capability.costs ?? []).length === 0 &&
          (capability.requirements ?? []).length === 0 &&
          capability.concentration !== true;
        if (allowed === null || !plain) {
          gaps.push({ path, reason: "bonusActionNotRepresentable" });
        } else {
          bonusActions.push({
            id: asBonusActionId(capability.id),
            label: capability.label,
            allowedActions: allowed,
          });
        }
        break;
      }
    }
  });

  if (sheet.spellcasting) gaps.push({ path: "spellcasting", reason: "spellcastingNotSupported" });
  if ((sheet.resources ?? []).length > 0) gaps.push({ path: "resources", reason: "resourcesNotSupported" });
  (sheet.traits ?? []).forEach((trait, index) => {
    if (trait.effects.length > 0) gaps.push({ path: `traits[${index}]`, reason: "traitEffectNotSupported" });
  });
  for (const key of ["damageResistances", "damageImmunities", "damageVulnerabilities"] as const) {
    if ((sheet[key] ?? []).length > 0) gaps.push({ path: key, reason: "damageModifiersNotSupported" });
  }
  if ((sheet.conditionImmunities ?? []).length > 0) {
    gaps.push({ path: "conditionImmunities", reason: "conditionImmunitiesNotSupported" });
  }

  return {
    definition: {
      kind: "monster",
      id: asCreatureId(options.creatureId),
      label: options.label ?? sheet.label,
      personality: options.personality,
      size: sheet.size,
      stats: {
        maxHitPoints: options.maxHitPointsOverride ?? sheet.hitPoints.average,
        armorClass: sheet.armorClass,
        speedFeet: sheet.speed.walk,
      },
      attacks,
      bonusActions,
      traits: (sheet.traits ?? []).map((trait) => ({ id: asTraitId(trait.id), label: trait.label })),
    },
    gaps,
  };
}
