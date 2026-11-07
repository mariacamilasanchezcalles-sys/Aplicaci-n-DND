import { FEATURE_NAMES } from "./features";
import type { FeatureName, FeatureVector, FeatureWeights } from "./features";

/**
 * CALIBRACIÓN DE PESOS (DECISIÓN CONFIRMADA, decisión 71): los pesos salen
 * de las decisiones de la jugadora en escenarios concretos, no se inventan.
 *
 * Cada escenario da: la opción que ella eligió y las demás. Se buscan pesos
 * w tales que puntuación(elegida) − puntuación(otra) ≥ margen para TODAS.
 * Algoritmo determinista (perceptrón con margen, desde w = 0, orden fijo):
 * si existe solución la encuentra; si no, informa qué casos no se cumplen.
 */
export interface CalibrationCase {
  readonly id: string;
  readonly chosen: FeatureVector;
  readonly others: readonly { readonly id: string; readonly features: FeatureVector }[];
}

export interface CalibrationResult {
  readonly weights: FeatureWeights;
  readonly satisfied: boolean;
  /** Pares (caso, opción) que no quedan por debajo de la elegida con el margen. */
  readonly violations: readonly string[];
  readonly iterations: number;
}

const zeroWeights = (): Record<FeatureName, number> =>
  Object.fromEntries(FEATURE_NAMES.map((n) => [n, 0])) as Record<FeatureName, number>;

const diff = (a: FeatureVector, b: FeatureVector): Record<FeatureName, number> =>
  Object.fromEntries(FEATURE_NAMES.map((n) => [n, a[n] - b[n]])) as Record<FeatureName, number>;

const dot = (w: Record<FeatureName, number>, d: Record<FeatureName, number>): number =>
  FEATURE_NAMES.reduce((s, n) => s + w[n] * d[n], 0);

/**
 * Signos que exige la descripción de la personalidad (TACTICAL_BRAIN_SPEC.md
 * §4): un rasgo "bueno" no puede pesar en contra ni uno "malo" a favor.
 */
export type SignConstraints = Partial<Record<FeatureName, "nonNegative" | "nonPositive">>;

export function solveWeights(
  cases: readonly CalibrationCase[],
  margin = 1,
  maxRounds = 10_000,
  signs: SignConstraints = {},
): CalibrationResult {
  const project = (w: Record<FeatureName, number>): void => {
    for (const n of FEATURE_NAMES) {
      if (signs[n] === "nonNegative" && w[n] < 0) w[n] = 0;
      if (signs[n] === "nonPositive" && w[n] > 0) w[n] = 0;
    }
  };
  const constraints = cases.flatMap((c) => c.others.map((o) => ({ id: `${c.id}>${o.id}`, d: diff(c.chosen, o.features) })));
  const w = zeroWeights();
  let rounds = 0;
  for (; rounds < maxRounds; rounds++) {
    let changed = false;
    for (const { d } of constraints) {
      if (dot(w, d) < margin) {
        for (const n of FEATURE_NAMES) w[n] += d[n];
        project(w);
        changed = true;
      }
    }
    if (!changed) break;
  }
  // Redondeo a 3 decimales para leerlos; se vuelve a comprobar con los redondeados.
  const rounded = Object.fromEntries(FEATURE_NAMES.map((n) => [n, Math.round(w[n] * 1000) / 1000])) as Record<FeatureName, number>;
  const violations = constraints.filter(({ d }) => dot(rounded, d) <= 0).map(({ id }) => id);
  return { weights: rounded, satisfied: violations.length === 0, violations, iterations: rounds };
}

/**
 * Signos por personalidad, derivados del texto de la jugadora (PROPUESTA,
 * decisión 88; TACTICAL_BRAIN_SPEC.md §4):
 * - Pragmático: "prioriza la supervivencia y la eficacia", "usa cobertura",
 *   coopera; conserva recursos ("retira recursos cuando deja de ser favorable").
 * - Agresivo: "prioriza causar daño", "persigue objetivos vulnerables",
 *   "sigue considerando el peligro", "puede gastar recursos".
 * - Pacifista: "evita causar daño", "prefiere incapacitar o controlar antes
 *   que matar", "puede proteger aliados".
 */
export const PERSONALITY_SIGNS: Readonly<Record<"pragmatic" | "aggressive" | "pacifist", SignConstraints>> = {
  pragmatic: {
    damageDealt: "nonNegative",
    threatReduction: "nonNegative",
    immediateThreatReduction: "nonNegative",
    finishingChance: "nonNegative",
    damageTaken: "nonPositive",
    deathRisk: "nonPositive",
    flankingPairs: "nonNegative",
    resourcesSpent: "nonPositive",
    conditionsInflicted: "nonNegative",
    friendlyDamage: "nonPositive",
  },
  aggressive: {
    damageDealt: "nonNegative",
    threatReduction: "nonNegative",
    immediateThreatReduction: "nonNegative",
    finishingChance: "nonNegative",
    damageTaken: "nonPositive",
    deathRisk: "nonPositive",
    flankingPairs: "nonNegative",
    conditionsInflicted: "nonNegative",
    friendlyDamage: "nonPositive",
  },
  pacifist: {
    damageDealt: "nonPositive",
    // "Prioriza huir" (especificación §4): sobre todo si está herido.
    adjacentEnemiesWhileBloodied: "nonPositive",
    finishingChance: "nonPositive",
    damageTaken: "nonPositive",
    deathRisk: "nonPositive",
    conditionsInflicted: "nonNegative",
    friendlyDamage: "nonPositive",
  },
};
