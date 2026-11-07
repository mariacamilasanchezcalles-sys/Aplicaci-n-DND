import { asAttackId, asBonusActionId, asCreatureId, asTraitId } from "../models";
import type {
  AttackDefinition,
  BonusActionActionType,
  BonusActionDefinition,
  Capability,
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
  /** Ataque con efectos distintos del daño o efectos al fallar: se omite de la criatura. */
  | "attackEffectNotSupported"
  | "spellcastingNotSupported"
  | "traitEffectNotSupported"
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

  // Un ataque con efectos que el modelo no puede representar (condición,
  // empujón, efectos al fallar…) NO se incluye: ejecutarlo solo con su daño
  // sería aproximarlo. Las capacidades que lo usen quedan no ejecutables.
  const attacks: AttackDefinition[] = [];
  (sheet.attacks ?? []).forEach((attack, index) => {
    const unsupported =
      attack.onHit.some((effect) => effect.kind !== "damage") ||
      attack.onMiss !== undefined ||
      attack.onHitOrMiss !== undefined;
    if (unsupported) {
      gaps.push({ path: `attacks[${index}]`, reason: "attackEffectNotSupported" });
      return;
    }
    const damage: DamageSpec[] = attack.onHit.flatMap((effect) =>
      effect.kind === "damage"
        ? [
            {
              // Daño fijo (sin dados): 0 dados, solo el bonificador.
              dice: effect.dice ?? { count: 0, sides: 1 },
              bonus: effect.bonus,
              type: effect.damageType,
              ...(effect.condition === undefined ? {} : { condition: effect.condition }),
            },
          ]
        : [],
    );
    attacks.push({
      id: asAttackId(attack.id),
      label: attack.label,
      mode: attack.mode,
      rangeFeet: attack.rangeFeet,
      toHitBonus: attack.toHitBonus,
      damage,
    });
  });

  // Acciones adicionales sencillas (solo acciones estándar, sin costes ni
  // requisitos) van al modelo clásico `bonusActions`, que también entiende
  // `validateTurnPlan`. El resto de capacidades pasa tal cual a
  // `capabilities`; qué puede ejecutar el motor lo decide `rules`
  // (`capabilitySupport`), no este puente.
  const bonusActions: BonusActionDefinition[] = [];
  const capabilities: Capability[] = [];
  for (const capability of sheet.capabilities ?? []) {
    const allowed = capability.activation === "bonusAction" ? standardActionsOf(capability.body) : null;
    const plain =
      (capability.costs ?? []).length === 0 &&
      (capability.requirements ?? []).length === 0 &&
      capability.concentration !== true;
    if (allowed !== null && plain) {
      bonusActions.push({ id: asBonusActionId(capability.id), label: capability.label, allowedActions: allowed });
    } else {
      capabilities.push(capability);
    }
  }

  if (sheet.spellcasting) gaps.push({ path: "spellcasting", reason: "spellcastingNotSupported" });
  (sheet.traits ?? []).forEach((trait, index) => {
    if (trait.effects.length > 0) gaps.push({ path: `traits[${index}]`, reason: "traitEffectNotSupported" });
  });
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
      ...(capabilities.length > 0 ? { capabilities } : {}),
      ...(sheet.resources && sheet.resources.length > 0 ? { resources: sheet.resources } : {}),
      ...(sheet.damageResistances?.length ? { damageResistances: sheet.damageResistances } : {}),
      ...(sheet.damageImmunities?.length ? { damageImmunities: sheet.damageImmunities } : {}),
      ...(sheet.damageVulnerabilities?.length ? { damageVulnerabilities: sheet.damageVulnerabilities } : {}),
      ...(sheet.abilities ? { abilities: sheet.abilities } : {}),
      ...(sheet.savingThrows ? { savingThrows: sheet.savingThrows } : {}),
    },
    gaps,
  };
}
