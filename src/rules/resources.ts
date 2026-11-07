import type { CreatureId, Encounter, ResourcePool } from "../models";
import { rollDie } from "./dice";
import type { RandomSource } from "./dice";

/** Usos que le quedan a una criatura de un recurso (0 si no lo tiene). */
export function resourceRemaining(encounter: Encounter, creatureId: CreatureId, resourceId: string): number {
  const pool = encounter.combatants[creatureId]?.state.resources.find((r) => r.id === resourceId);
  return pool?.current ?? 0;
}

/**
 * Gasta recursos de una criatura de forma ATÓMICA: si alguno no alcanza, no
 * gasta nada y devuelve null. `costs` puede repetir un recurso (se suman).
 */
export function spendResources(
  encounter: Encounter,
  creatureId: CreatureId,
  costs: readonly { readonly resourceRef: string; readonly amount: number }[],
): Encounter | null {
  const record = encounter.combatants[creatureId];
  if (!record) return null;
  const totals = new Map<string, number>();
  for (const cost of costs) totals.set(cost.resourceRef, (totals.get(cost.resourceRef) ?? 0) + cost.amount);
  for (const [id, amount] of totals) {
    if (resourceRemaining(encounter, creatureId, id) < amount) return null;
  }
  const resources: ResourcePool[] = record.state.resources.map((pool) => {
    const amount = totals.get(pool.id);
    return amount === undefined ? pool : { ...pool, current: pool.current - amount };
  });
  return {
    ...encounter,
    combatants: { ...encounter.combatants, [creatureId]: { ...record, state: { ...record.state, resources } } },
  };
}

export interface RechargeRoll {
  readonly resourceId: string;
  readonly roll: number;
  readonly recharged: boolean;
}

/**
 * Recarga al inicio del turno de la criatura.
 *
 * REGLA OFICIAL VERIFICADA (SRD 5.2.1, "Recharge X–Y"): al inicio de cada
 * turno del monstruo se tira 1d6; si el resultado está en el rango, recupera
 * el uso. Solo se tira para recursos gastados, en el orden de la ficha.
 * Debe llamarse al empezar el turno, antes de `startTurn` (hasta que exista
 * la iniciativa, decisión 9). PENDIENTE: recuperación en descansos.
 */
export function rollRechargesAtTurnStart(
  encounter: Encounter,
  creatureId: CreatureId,
  dice: RandomSource,
): { readonly encounter: Encounter; readonly rolls: readonly RechargeRoll[] } {
  const record = encounter.combatants[creatureId];
  if (!record) throw new Error(`Criatura no encontrada: ${creatureId}`);
  const rolls: RechargeRoll[] = [];
  const recharged = new Set<string>();
  for (const definition of record.definition.resources ?? []) {
    const recharge = definition.recovery.find((r) => r.kind === "recharge");
    const pool = record.state.resources.find((r) => r.id === definition.id);
    if (!recharge || recharge.kind !== "recharge" || !pool || pool.current >= pool.max) continue;
    const roll = rollDie(6, dice);
    const success = roll >= recharge.minRoll;
    rolls.push({ resourceId: definition.id, roll, recharged: success });
    if (success) recharged.add(definition.id);
  }
  if (recharged.size === 0) return { encounter, rolls };
  const resources = record.state.resources.map((pool) =>
    recharged.has(pool.id) ? { ...pool, current: pool.max } : pool,
  );
  return {
    encounter: {
      ...encounter,
      combatants: { ...encounter.combatants, [creatureId]: { ...record, state: { ...record.state, resources } } },
    },
    rolls,
  };
}
