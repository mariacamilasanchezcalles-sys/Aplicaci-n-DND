import type {
  AttackDefinition,
  CombatantDefinition,
  CreatureId,
  DamageType,
  Encounter,
} from "../models";
import { rollDice, rollDie } from "./dice";
import type { RandomSource } from "./dice";

export type RollMode = "normal" | "advantage" | "disadvantage";

/**
 * Ventaja y desventaja sobre la misma tirada se cancelan; varias fuentes del
 * mismo tipo no se acumulan (Basic Rules 2024, glosario). Quién concede cada
 * una (Oculto, Invisible, alcance largo, enemigo adyacente...) lo determina
 * quien llama: PENDIENTE de modelar con el estado completo del combate.
 */
export function combineRollModes(hasAdvantage: boolean, hasDisadvantage: boolean): RollMode {
  if (hasAdvantage === hasDisadvantage) return "normal";
  return hasAdvantage ? "advantage" : "disadvantage";
}

export type AttackOutcome = "criticalHit" | "hit" | "miss";

export interface DamageRollResult {
  readonly type: DamageType;
  readonly dice: readonly number[];
  readonly modifier: number;
  readonly total: number;
}

export type AttackResolution =
  | { readonly resolved: false; readonly reason: "targetArmorClassUnknown" }
  | {
      readonly resolved: true;
      readonly mode: RollMode;
      readonly d20Rolls: readonly number[];
      readonly naturalRoll: number;
      readonly attackTotal: number;
      readonly targetArmorClass: number;
      readonly outcome: AttackOutcome;
      readonly damage: readonly DamageRollResult[];
      readonly totalDamage: number;
    };

export interface ResolveAttackInput {
  readonly attack: AttackDefinition;
  readonly target: CombatantDefinition;
  readonly mode: RollMode;
  /** Se resta a la tirada (Cansancio: 2 por nivel, REGLA OFICIAL VERIFICADA). */
  readonly d20Penalty?: number;
  /** Un impacto es crítico (Paralizado o Inconsciente a 5 pies, REGLA OFICIAL VERIFICADA). */
  readonly criticalOnHit?: boolean;
}

/**
 * Resuelve una tirada de ataque y su daño. No aplica el daño (ver
 * `applyDamage`) ni comprueba legalidad (eso es `validateTurnPlan`).
 *
 * Reglas (Basic Rules 2024): un 20 natural impacta siempre y es crítico; un 1
 * natural falla siempre; en crítico se tiran dos veces todos los dados de
 * daño y se suman los modificadores una vez. El impacto se decide con
 * "total >= CA" (VERIFICADO: SRD 5.2.1, "D20 Tests", iguala o supera).
 *
 * Orden de consumo de dados (para pruebas reproducibles): primero el/los d20
 * (2 con ventaja o desventaja), luego, solo si impacta, los dados de cada
 * componente de daño en el orden del dato (dos veces sus dados si es crítico).
 * Un componente con condición `attackRollHadAdvantage` solo se tira si el modo
 * final es ventaja.
 */
export function resolveAttack(input: ResolveAttackInput, source: RandomSource): AttackResolution {
  const targetArmorClass = input.target.stats.armorClass;
  if (targetArmorClass === undefined) {
    return { resolved: false, reason: "targetArmorClassUnknown" };
  }

  const d20Rolls: number[] = [rollDie(20, source)];
  if (input.mode !== "normal") d20Rolls.push(rollDie(20, source));

  const naturalRoll =
    input.mode === "disadvantage" ? Math.min(...d20Rolls) : Math.max(...d20Rolls);
  const attackTotal = naturalRoll + input.attack.toHitBonus - (input.d20Penalty ?? 0);

  const outcome: AttackOutcome =
    naturalRoll === 20
      ? "criticalHit"
      : naturalRoll === 1
        ? "miss"
        : attackTotal >= targetArmorClass
          ? input.criticalOnHit
            ? "criticalHit"
            : "hit"
          : "miss";

  const damage: DamageRollResult[] = [];
  if (outcome !== "miss") {
    const diceMultiplier = outcome === "criticalHit" ? 2 : 1;
    for (const spec of input.attack.damage) {
      if (spec.condition === "attackRollHadAdvantage" && input.mode !== "advantage") continue;
      const roll = rollDice({ count: spec.dice.count * diceMultiplier, sides: spec.dice.sides }, source);
      damage.push({
        type: spec.type,
        dice: roll.rolls,
        modifier: spec.bonus,
        total: roll.total + spec.bonus,
      });
    }
  }

  return {
    resolved: true,
    mode: input.mode,
    d20Rolls,
    naturalRoll,
    attackTotal,
    targetArmorClass,
    outcome,
    damage,
    totalDamage: damage.reduce((sum, part) => sum + part.total, 0),
  };
}

/**
 * Resta daño a una criatura. Los PG no bajan de 0 (Basic Rules 2024).
 * PENDIENTE: consecuencias de llegar a 0 (salvaciones de muerte de personajes
 * jugadores, qué ocurre con monstruos): aquí solo se fijan los PG en 0.
 */
export function applyDamage(encounter: Encounter, targetId: CreatureId, amount: number): Encounter {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new RangeError(`El daño debe ser un entero >= 0 (recibido: ${amount})`);
  }
  const record = encounter.combatants[targetId];
  if (!record) throw new Error(`Criatura no encontrada: ${targetId}`);
  const current = record.state.currentHitPoints;
  if (current === null) {
    throw new Error(`No se pueden aplicar PG a una criatura sin PG registrados: ${targetId}`);
  }
  return {
    ...encounter,
    combatants: {
      ...encounter.combatants,
      [targetId]: {
        ...record,
        state: { ...record.state, currentHitPoints: Math.max(0, current - amount) },
      },
    },
  };
}
