import type { CombatantRecord, CreatureId, Encounter } from "../models";
import { applyCondition } from "./conditions";

/**
 * PUNTOS DE GOLPE, 0 PG Y MUERTE.
 * REGLA OFICIAL VERIFICADA (SRD 5.2.1, "Damage and Healing" y Glosario 2024):
 * - Los PG no bajan de 0 ni superan el máximo.
 * - Monstruo: muere al llegar a 0 PG. (El DM puede tratar a un monstruo como
 *   a un personaje: PENDIENTE, decisión 51.)
 * - Personaje: a 0 PG queda Inconsciente y hace salvaciones contra la muerte,
 *   salvo daño masivo: si el daño restante iguala o supera su máximo, muere.
 * - Daño a 0 PG: un fallo (dos si es crítico); si iguala o supera el máximo, muere.
 * - Tres fallos: muere. Tres éxitos: Estable. Recuperar PG reinicia la cuenta.
 * - Dejar inconsciente: con un ataque cuerpo a cuerpo que lo dejaría a 0 PG,
 *   el atacante puede dejarlo a 1 PG e Inconsciente.
 */

/** Inconsciente causado por las reglas de 0 PG (no por un efecto con origen). */
const ZERO_HP_UNCONSCIOUS = { kind: "indefinite" } as const;

function setRecord(encounter: Encounter, record: CombatantRecord): Encounter {
  return { ...encounter, combatants: { ...encounter.combatants, [record.definition.id]: record } };
}

function fallUnconscious(encounter: Encounter, id: CreatureId): Encounter {
  const applied = applyCondition(encounter, id, "unconscious", null, ZERO_HP_UNCONSCIOUS);
  return applied.applied ? applied.encounter : encounter;
}

export interface DamageOptions {
  /** El daño viene de un impacto crítico (dos fallos si ya está a 0 PG). */
  readonly critical?: boolean;
  /** Dejar inconsciente en lugar de a 0 PG (solo ataques cuerpo a cuerpo; lo valida quien llama). */
  readonly knockOut?: boolean;
}

export interface DamageOutcome {
  readonly encounter: Encounter;
  /** PG realmente perdidos. */
  readonly hitPointsLost: number;
  readonly lifeStateBefore: CombatantRecord["state"]["lifeState"];
  readonly lifeStateAfter: CombatantRecord["state"]["lifeState"];
  readonly knockedOut: boolean;
}

/** Aplica daño (ya con defensas) siguiendo las reglas de 0 PG. */
export function dealDamage(
  encounter: Encounter,
  targetId: CreatureId,
  amount: number,
  options: DamageOptions = {},
): DamageOutcome {
  if (!Number.isInteger(amount) || amount < 0) throw new RangeError(`Daño no válido: ${amount}`);
  const record = encounter.combatants[targetId];
  if (!record) throw new Error(`Criatura no encontrada: ${targetId}`);
  const before = record.state.lifeState;
  const current = record.state.currentHitPoints;
  const max = record.definition.stats.maxHitPoints;
  const unchanged: DamageOutcome = {
    encounter,
    hitPointsLost: 0,
    lifeStateBefore: before,
    lifeStateAfter: before,
    knockedOut: false,
  };
  if (amount === 0 || current === null || before === "dead") return unchanged;

  const isCharacter = record.definition.kind === "playerCharacter";

  // Ya estaba a 0 PG (moribundo o estable).
  if (current === 0) {
    if (!isCharacter) return { ...unchanged, encounter: setRecord(encounter, { ...record, state: { ...record.state, lifeState: "dead" } }), lifeStateAfter: "dead" };
    if (max !== undefined && amount >= max) {
      return { ...unchanged, encounter: setRecord(encounter, { ...record, state: { ...record.state, lifeState: "dead" } }), lifeStateAfter: "dead" };
    }
    const failures = record.state.deathSaves.failures + (options.critical ? 2 : 1);
    const lifeState = failures >= 3 ? "dead" : "dying";
    return {
      ...unchanged,
      encounter: setRecord(encounter, {
        ...record,
        state: { ...record.state, lifeState, deathSaves: { ...record.state.deathSaves, failures: Math.min(3, failures) } },
      }),
      lifeStateAfter: lifeState,
    };
  }

  const remaining = current - amount;
  if (remaining > 0) {
    return {
      ...unchanged,
      encounter: setRecord(encounter, { ...record, state: { ...record.state, currentHitPoints: remaining } }),
      hitPointsLost: amount,
    };
  }

  if (options.knockOut) {
    const knocked = setRecord(encounter, { ...record, state: { ...record.state, currentHitPoints: 1 } });
    return {
      ...unchanged,
      encounter: fallUnconscious(knocked, targetId),
      hitPointsLost: current - 1,
      knockedOut: true,
    };
  }

  const atZero: CombatantRecord = { ...record, state: { ...record.state, currentHitPoints: 0 } };
  if (!isCharacter) {
    return {
      ...unchanged,
      encounter: setRecord(encounter, { ...atZero, state: { ...atZero.state, lifeState: "dead" } }),
      hitPointsLost: current,
      lifeStateAfter: "dead",
    };
  }
  // Daño masivo: lo que sobra tras llegar a 0 iguala o supera el máximo.
  if (max !== undefined && -remaining >= max) {
    return {
      ...unchanged,
      encounter: setRecord(encounter, { ...atZero, state: { ...atZero.state, lifeState: "dead" } }),
      hitPointsLost: current,
      lifeStateAfter: "dead",
    };
  }
  const dying = setRecord(encounter, {
    ...atZero,
    state: { ...atZero.state, lifeState: "dying", deathSaves: { successes: 0, failures: 0 } },
  });
  return { ...unchanged, encounter: fallUnconscious(dying, targetId), hitPointsLost: current, lifeStateAfter: "dying" };
}

/**
 * Curación: no supera el máximo. Desde 0 PG la criatura vuelve en sí: se
 * quita el Inconsciente de las reglas de 0 PG (sigue Derribada) y se
 * reinician las salvaciones contra la muerte. Los muertos no se curan.
 */
export function healCreature(
  encounter: Encounter,
  targetId: CreatureId,
  amount: number,
): { readonly encounter: Encounter; readonly healed: number } {
  const record = encounter.combatants[targetId];
  const max = record?.definition.stats.maxHitPoints;
  if (!record || amount <= 0 || record.state.currentHitPoints === null || max === undefined || record.state.lifeState === "dead") {
    return { encounter, healed: 0 };
  }
  const current = record.state.currentHitPoints;
  const next = Math.min(max, current + amount);
  const conditions =
    current === 0 || record.state.conditions.some((c) => c.condition === "unconscious" && c.sourceId === null)
      ? record.state.conditions.filter((c) => !(c.condition === "unconscious" && c.sourceId === null))
      : record.state.conditions;
  return {
    encounter: setRecord(encounter, {
      ...record,
      state: {
        ...record.state,
        currentHitPoints: next,
        conditions,
        lifeState: "alive",
        deathSaves: { successes: 0, failures: 0 },
      },
    }),
    healed: next - current,
  };
}

export type DeathSaveResult = "success" | "failure" | "twoFailures" | "regainedHitPoint";

/**
 * Salvación contra la muerte de un personaje (la tira el jugador con dados
 * físicos y se anota el d20). 10 o más: éxito; 1: dos fallos; 20: recupera
 * 1 PG. Tres éxitos: Estable; tres fallos: muere.
 */
export function recordDeathSave(
  encounter: Encounter,
  creatureId: CreatureId,
  d20: number,
): { readonly encounter: Encounter; readonly result: DeathSaveResult } | { readonly error: "notDying" | "invalidRoll" } {
  const record = encounter.combatants[creatureId];
  if (!record || record.state.lifeState !== "dying") return { error: "notDying" };
  if (!Number.isInteger(d20) || d20 < 1 || d20 > 20) return { error: "invalidRoll" };
  if (d20 === 20) return { encounter: healCreature(encounter, creatureId, 1).encounter, result: "regainedHitPoint" };

  const { successes, failures } = record.state.deathSaves;
  const result: DeathSaveResult = d20 === 1 ? "twoFailures" : d20 >= 10 ? "success" : "failure";
  const nextSuccesses = result === "success" ? successes + 1 : successes;
  const nextFailures = failures + (result === "twoFailures" ? 2 : result === "failure" ? 1 : 0);
  const lifeState = nextFailures >= 3 ? "dead" : nextSuccesses >= 3 ? "stable" : "dying";
  return {
    encounter: setRecord(encounter, {
      ...record,
      state: {
        ...record.state,
        lifeState,
        // Al quedar Estable la cuenta vuelve a cero (sigue Inconsciente).
        deathSaves: lifeState === "stable" ? { successes: 0, failures: 0 } : { successes: nextSuccesses, failures: Math.min(3, nextFailures) },
      },
    }),
    result,
  };
}
