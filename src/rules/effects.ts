import type {
  AbilityId,
  CombatantDefinition,
  ConditionId,
  CreatureId,
  DamageType,
  EffectSpec,
  Encounter,
  LifeState,
  Operation,
} from "../models";
import { applyCondition, conditionResistances, durationSupported, removeCondition, saveConditions } from "./conditions";
import { dealDamage, healCreature } from "./vitality";
import { applyDamageModifiers } from "./damage";
import type { ModifiedDamage } from "./damage";
import { rollDice, rollDie } from "./dice";
import type { RandomSource } from "./dice";

export type EffectOperation = Extract<Operation, { op: "effect" }>;

/**
 * Resultado de la salvación de un personaje jugador, tirada con dados físicos
 * (DECISIÓN CONFIRMADA 2026-11-07): el total (el motor lo compara con la CD)
 * o directamente el resultado.
 */
export type PlayerSaveInput = { readonly total: number } | { readonly outcome: "success" | "failure" };

export type SaveRecord =
  | {
      readonly source: "virtual";
      readonly d20: number;
      readonly bonus: number;
      /** Cansancio: 2 por nivel. */
      readonly penalty: number;
      readonly total: number;
      readonly dc: number;
      readonly success: boolean;
    }
  | { readonly source: "player"; readonly total: number | null; readonly dc: number; readonly success: boolean }
  /** Fallo automático por condición (no se tira ni se pide al jugador). */
  | { readonly source: "automaticFailure"; readonly dc: number; readonly success: false };

export interface EffectTargetResult {
  readonly targetId: CreatureId;
  readonly save: SaveRecord | null;
  readonly damageAfterDefenses: readonly ModifiedDamage[];
  readonly damageApplied: number;
  readonly healed: number;
  readonly conditionsApplied: readonly ConditionId[];
  /** Condiciones que no se aplicaron por inmunidad. */
  readonly conditionsResisted: readonly ConditionId[];
  readonly conditionsRemoved: readonly ConditionId[];
  readonly lifeStateAfter: LifeState;
}

export interface RolledAmount {
  readonly kind: "damage" | "heal";
  readonly damageType: DamageType | null;
  readonly dice: readonly number[];
  readonly bonus: number;
  readonly total: number;
}

export type EffectResolution =
  | {
      readonly ok: true;
      readonly encounter: Encounter;
      readonly rolls: readonly RolledAmount[];
      readonly targets: readonly EffectTargetResult[];
    }
  | {
      readonly ok: false;
      /** saveBonusUnknown: a un monstruo le faltan datos; playerSavesRequired: falta la tirada del jugador. */
      readonly reason: "saveBonusUnknown" | "playerSavesRequired";
      readonly creatureIds: readonly CreatureId[];
    };

/** Efectos que el motor sabe aplicar hoy. */
export function effectSupported(effect: EffectSpec): boolean {
  switch (effect.kind) {
    case "damage":
      return effect.condition === undefined;
    case "heal":
    case "removeCondition":
      return true;
    case "applyCondition":
      return durationSupported(effect.duration);
    default:
      return false;
  }
}

/**
 * Bonificador de salvación. REGLA OFICIAL VERIFICADA (SRD 5.2.1): los
 * monstruos tienen modificadores de característica y de salvación; el
 * modificador es floor((puntuación - 10) / 2) (tabla "Ability Modifiers").
 * null si la criatura no tiene esos datos registrados.
 */
export function saveBonusOf(definition: CombatantDefinition, ability: AbilityId): number | null {
  const explicit = definition.savingThrows?.[ability];
  if (explicit !== undefined) return explicit;
  const score = definition.abilities?.[ability];
  return score === undefined ? null : Math.floor((score - 10) / 2);
}

/**
 * Resuelve una operación de efecto sobre criaturas ya determinadas.
 *
 * REGLAS OFICIALES VERIFICADAS (SRD 5.2.1):
 * - Salvación: d20 + bonificador; éxito si iguala o supera la CD. El 20 y
 *   el 1 naturales solo son especiales en tiradas de ataque.
 * - Daño contra varios objetivos a la vez: se tira UNA vez para todos.
 * - "Half damage only" al superar la salvación: mitad (redondeando abajo) e
 *   ignora el resto del efecto. "negates": sin efecto.
 * - Después se aplican Inmunidad, Resistencia y Vulnerabilidad.
 *
 * Antes de tirar ningún dado comprueba que tiene todo lo necesario
 * (bonificadores de los monstruos y tiradas de los jugadores); si falta algo
 * no cambia nada. Orden de dados: salvaciones de los monstruos (por id) y
 * después los dados de daño y curación de cada efecto, en el orden de la ficha.
 */
export function resolveEffect(
  encounter: Encounter,
  operation: EffectOperation,
  affected: readonly CreatureId[],
  dice: RandomSource,
  playerSaves: Readonly<Record<string, PlayerSaveInput>> = {},
  sourceId: CreatureId | null = null,
): EffectResolution {
  const save = operation.save;
  const dc = save && typeof save.dc === "number" ? save.dc : null;
  if (save && dc === null) throw new Error("CD de conjuro no soportada (ver capabilitySupport)");

  // Fallo automático (Paralizado, Petrificado, Aturdido, Inconsciente en FUE/DES).
  const autoFails = (id: CreatureId): boolean => {
    const record = encounter.combatants[id];
    return save !== undefined && record !== undefined && saveConditions(record, save.ability).autoFail;
  };

  if (save) {
    const unknown = affected.filter((id) => {
      const record = encounter.combatants[id];
      return record?.definition.kind === "monster" && !autoFails(id) && saveBonusOf(record.definition, save.ability) === null;
    });
    if (unknown.length > 0) return { ok: false, reason: "saveBonusUnknown", creatureIds: unknown };
    const missing = affected.filter(
      (id) =>
        encounter.combatants[id]?.definition.kind === "playerCharacter" && !autoFails(id) && playerSaves[id] === undefined,
    );
    if (missing.length > 0) return { ok: false, reason: "playerSavesRequired", creatureIds: missing };
  }

  // 1. Salvaciones.
  const saves = new Map<CreatureId, SaveRecord>();
  if (save && dc !== null) {
    for (const id of affected) {
      const record = encounter.combatants[id];
      if (!record) continue;
      const adjust = saveConditions(record, save.ability);
      if (adjust.autoFail) {
        saves.set(id, { source: "automaticFailure", dc, success: false });
      } else if (record.definition.kind === "playerCharacter") {
        // El jugador ya aplica sus modificadores (Desventaja, Cansancio) al tirar.
        const input = playerSaves[id];
        if (input === undefined) continue;
        const total = "total" in input ? input.total : null;
        const success = "total" in input ? input.total >= dc : input.outcome === "success";
        saves.set(id, { source: "player", total, dc, success });
      } else {
        const bonus = saveBonusOf(record.definition, save.ability) ?? 0;
        const first = rollDie(20, dice);
        const d20 =
          adjust.mode === "disadvantage"
            ? Math.min(first, rollDie(20, dice))
            : adjust.mode === "advantage"
              ? Math.max(first, rollDie(20, dice))
              : first;
        const total = d20 + bonus - adjust.d20Penalty;
        saves.set(id, { source: "virtual", d20, bonus, penalty: adjust.d20Penalty, total, dc, success: total >= dc });
      }
    }
  }

  const succeeded = (id: CreatureId): boolean => saves.get(id)?.success === true;
  const receives = (id: CreatureId): boolean => !succeeded(id) || save?.onSuccess === "halfDamage";
  const hasAmounts = operation.effects.some((e) => e.kind === "damage" || e.kind === "heal");

  // 2. Dados de daño y curación: una sola vez para todos.
  const rolls: RolledAmount[] = [];
  if (hasAmounts && affected.some(receives)) {
    for (const effect of operation.effects) {
      if (effect.kind !== "damage" && effect.kind !== "heal") continue;
      const roll = effect.dice ? rollDice(effect.dice, dice) : { rolls: [], total: 0 };
      rolls.push({
        kind: effect.kind,
        damageType: effect.kind === "damage" ? effect.damageType : null,
        dice: roll.rolls,
        bonus: effect.bonus,
        total: Math.max(0, roll.total + effect.bonus),
      });
    }
  }

  // 3. Aplicar a cada objetivo.
  let updated = encounter;
  const targets: EffectTargetResult[] = [];
  for (const id of affected) {
    const record = updated.combatants[id];
    if (!record) continue;
    const saveRecord = saves.get(id) ?? null;
    const success = succeeded(id);
    const halve = success && save?.onSuccess === "halfDamage";
    const takesNothing = success && save?.onSuccess === "negates";

    const damageParts = takesNothing
      ? []
      : rolls.flatMap((r) => (r.kind === "damage" && r.damageType ? [{ type: r.damageType, amount: r.total }] : []));
    const defended = applyDamageModifiers(record.definition, damageParts, {
      halve,
      resistAll: conditionResistances(record) === "all",
    });
    const damage = dealDamage(updated, id, defended.total);
    updated = damage.encounter;

    // Con la salvación superada se ignora el resto del efecto (curación, condiciones).
    const healTotal = success ? 0 : rolls.filter((r) => r.kind === "heal").reduce((sum, r) => sum + r.total, 0);
    const heal = healCreature(updated, id, healTotal);
    updated = heal.encounter;

    const conditionsApplied: ConditionId[] = [];
    const conditionsResisted: ConditionId[] = [];
    const conditionsRemoved: ConditionId[] = [];
    if (!success) {
      for (const effect of operation.effects) {
        if (effect.kind === "applyCondition") {
          const result = applyCondition(updated, id, effect.condition, sourceId, effect.duration);
          if (result.applied) {
            updated = result.encounter;
            conditionsApplied.push(effect.condition);
          } else {
            conditionsResisted.push(effect.condition);
          }
        } else if (effect.kind === "removeCondition") {
          updated = removeCondition(updated, id, effect.condition);
          conditionsRemoved.push(effect.condition);
        }
      }
    }

    targets.push({
      targetId: id,
      save: saveRecord,
      damageAfterDefenses: defended.instances,
      damageApplied: damage.hitPointsLost,
      healed: heal.healed,
      conditionsApplied,
      conditionsResisted,
      conditionsRemoved,
      lifeStateAfter: updated.combatants[id]?.state.lifeState ?? "alive",
    });
  }

  return { ok: true, encounter: updated, rolls, targets };
}
