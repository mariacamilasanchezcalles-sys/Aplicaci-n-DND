import type { DiceExpression } from "../models";
import type { KnowledgePriors } from "./knowledge";

/**
 * SUPUESTOS POR NIVEL DEL GRUPO (decisión 73; tabla APROBADA el 2026-11-07,
 * docs/BRAIN_CALIBRATION.md). Derivados del SRD 5.2.1:
 * - PG máximos ≈ 9,75 + 6,5 × (nivel − 1) (media de las 12 clases, matriz
 *   estándar; "Level 1 Hit Points" y "Fixed Hit Points by Class").
 * - CA en el intervalo 11–18, central 14 (equipo inicial de las clases).
 * - Velocidad 30 pies (la de casi todas las especies del SRD).
 * - Ataque presunto (PROPUESTA, decisión 85): bonificador por competencia
 *   del nivel + 3 (característica principal 15 + 2 del trasfondo = 17) y
 *   daño 1d8 + 3 de un arma cuerpo a cuerpo de una mano, alcance 5 pies.
 * - Salvación supuesta (PROPUESTA, decisión 92): media de los modificadores
 *   de la matriz estándar (+2, +2, +1, +1, 0, −1 → 5/6) más el bonificador
 *   por competencia en 2 de las 6 salvaciones (cada clase tiene 2).
 */
export function proficiencyBonusForLevel(level: number): number {
  // SRD 5.2.1, "Character Advancement": +2 (1–4), +3 (5–8), +4 (9–12), +5 (13–16), +6 (17–20).
  return 2 + Math.floor((Math.min(20, Math.max(1, level)) - 1) / 4);
}

export interface PresumedAttack {
  readonly toHitBonus: number;
  readonly dice: DiceExpression;
  readonly damageBonus: number;
  readonly reachFeet: number;
}

export function priorsForPartyLevel(level: number): KnowledgePriors {
  const l = Math.min(20, Math.max(1, Math.round(level)));
  return {
    armorClass: 14,
    armorClassRange: { min: 11, max: 18 },
    maxHitPoints: Math.round(9.75 + 6.5 * (l - 1)),
    speedFeet: 30,
    presumedAttack: { toHitBonus: proficiencyBonusForLevel(l) + 3, dice: { count: 1, sides: 8 }, damageBonus: 3, reachFeet: 5 },
    saveBonus: Math.round((5 / 6 + (proficiencyBonusForLevel(l) * 2) / 6) * 100) / 100,
  };
}
