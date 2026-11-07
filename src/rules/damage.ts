import type { CombatantDefinition, DamageType } from "../models";

/** Daño de un tipo antes de aplicar las defensas del objetivo. */
export interface DamageInstance {
  readonly type: DamageType;
  readonly amount: number;
}

export type DamageDefense = "immune" | "resistant" | "vulnerable" | "resistantAndVulnerable" | "none";

export interface ModifiedDamage {
  readonly type: DamageType;
  readonly raw: number;
  readonly final: number;
  readonly defense: DamageDefense;
}

export interface ModifiedDamageResult {
  readonly instances: readonly ModifiedDamage[];
  readonly total: number;
}

/**
 * Aplica Inmunidad, Resistencia y Vulnerabilidad del objetivo.
 *
 * REGLA OFICIAL VERIFICADA (SRD 5.2.1, "Damage and Healing"):
 * - Orden: primero bonificadores, penalizadores y multiplicadores (aún no
 *   hay ninguno modelado); después Resistencia (mitad, redondeando hacia
 *   abajo); por último Vulnerabilidad (doble).
 * - No se acumulan: cada una se aplica una sola vez a una instancia de daño.
 * - Inmunidad a un tipo: ese daño no afecta.
 *
 * PROPUESTA (PENDIENTE DE VALIDAR qué es "una instancia de daño"): las
 * partes del mismo tipo de una misma tirada de daño se suman en una sola
 * instancia antes de aplicar las defensas (afecta al redondeo de la
 * Resistencia). El orden de los tipos es el de su primera aparición.
 */
export function applyDamageModifiers(
  defender: CombatantDefinition,
  parts: readonly DamageInstance[],
  options: { readonly halve?: boolean } = {},
): ModifiedDamageResult {
  const byType = new Map<DamageType, number>();
  for (const part of parts) {
    if (!Number.isInteger(part.amount) || part.amount < 0) {
      throw new RangeError(`Daño no válido: ${part.amount}`);
    }
    byType.set(part.type, (byType.get(part.type) ?? 0) + part.amount);
  }
  // "Half damage" de una salvación superada es un multiplicador: se aplica
  // ANTES que Resistencia y Vulnerabilidad (orden oficial), redondeando abajo.
  if (options.halve) {
    for (const [type, amount] of byType) byType.set(type, Math.floor(amount / 2));
  }

  const immune = new Set(defender.damageImmunities ?? []);
  const resistant = new Set(defender.damageResistances ?? []);
  const vulnerable = new Set(defender.damageVulnerabilities ?? []);

  const instances: ModifiedDamage[] = [...byType.entries()].map(([type, raw]) => {
    if (immune.has(type)) return { type, raw, final: 0, defense: "immune" };
    const isResistant = resistant.has(type);
    const isVulnerable = vulnerable.has(type);
    let final = raw;
    if (isResistant) final = Math.floor(final / 2);
    if (isVulnerable) final = final * 2;
    const defense: DamageDefense =
      isResistant && isVulnerable
        ? "resistantAndVulnerable"
        : isResistant
          ? "resistant"
          : isVulnerable
            ? "vulnerable"
            : "none";
    return { type, raw, final, defense };
  });

  return { instances, total: instances.reduce((sum, i) => sum + i.final, 0) };
}
