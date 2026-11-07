import type { AttackDefinition, DamageType, DiceExpression } from "../models";
import type { RollMode } from "./resolution";

/**
 * PROBABILIDADES Y VALORES ESPERADOS de las reglas ya verificadas, para que
 * el cerebro prevea consecuencias sin tirar dados reales (diseño aprobado).
 * Mismas reglas que `resolveAttack` y `resolveEffect`:
 * - Ataque: el 20 natural impacta y es crítico; el 1 natural falla; si no,
 *   impacta con total >= CA. Crítico: se doblan los dados de daño.
 * - Salvación: éxito con total >= CD; el 20 y el 1 no son especiales.
 * - Ventaja: el mayor de dos d20; Desventaja: el menor.
 */

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

const twoDice = (single: number, mode: RollMode): number =>
  mode === "advantage" ? 1 - (1 - single) ** 2 : mode === "disadvantage" ? single ** 2 : single;

/** Media de una tirada de dados (sin modificadores). */
export function averageDice(dice: DiceExpression): number {
  return (dice.count * (dice.sides + 1)) / 2;
}

export interface AttackOdds {
  /** Probabilidad de impactar (incluye el crítico). */
  readonly hitChance: number;
  readonly critChance: number;
  /** Daño esperado por tipo antes de las defensas del objetivo. */
  readonly expectedDamageByType: Readonly<Partial<Record<DamageType, number>>>;
  readonly expectedDamage: number;
}

/**
 * Probabilidades de un ataque contra una CA concreta. `criticalOnHit`:
 * Paralizado o Inconsciente a 5 pies. `d20Penalty`: Cansancio.
 */
export function attackOdds(
  attack: AttackDefinition,
  armorClass: number,
  mode: RollMode,
  options: { readonly d20Penalty?: number; readonly criticalOnHit?: boolean } = {},
): AttackOdds {
  const penalty = options.d20Penalty ?? 0;
  let hitsOnSingle = 0;
  for (let natural = 1; natural <= 20; natural++) {
    if (natural === 20 || (natural !== 1 && natural + attack.toHitBonus - penalty >= armorClass)) hitsOnSingle++;
  }
  const hitChance = twoDice(hitsOnSingle / 20, mode);
  const critChance = options.criticalOnHit ? hitChance : twoDice(1 / 20, mode);
  const normalChance = hitChance - critChance;

  const byType: Partial<Record<DamageType, number>> = {};
  for (const spec of attack.damage) {
    if (spec.condition === "attackRollHadAdvantage" && mode !== "advantage") continue;
    const normal = averageDice(spec.dice) + spec.bonus;
    const critical = 2 * averageDice(spec.dice) + spec.bonus;
    byType[spec.type] = (byType[spec.type] ?? 0) + normalChance * Math.max(0, normal) + critChance * Math.max(0, critical);
  }
  const expectedDamage = Object.values(byType).reduce((sum, v) => sum + (v ?? 0), 0);
  return { hitChance, critChance, expectedDamageByType: byType, expectedDamage };
}

/** Probabilidad de superar una salvación (d20 + bonificador − penalización >= CD). */
export function saveSuccessChance(saveBonus: number, dc: number, mode: RollMode, d20Penalty = 0): number {
  const single = clamp01((21 - (dc - saveBonus + d20Penalty)) / 20);
  return twoDice(single, mode);
}

/**
 * Multiplicador esperado de las defensas de un tipo de daño (PROPUESTA de
 * aproximación: la Resistencia redondea hacia abajo, aquí se toma la mitad).
 */
export function defenseMultiplier(
  type: DamageType,
  defenses: {
    readonly immunities?: readonly DamageType[];
    readonly resistances?: readonly DamageType[];
    readonly vulnerabilities?: readonly DamageType[];
  },
): number {
  if (defenses.immunities?.includes(type)) return 0;
  const resistant = defenses.resistances?.includes(type) ? 0.5 : 1;
  const vulnerable = defenses.vulnerabilities?.includes(type) ? 2 : 1;
  return resistant * vulnerable;
}
