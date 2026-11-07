import type { CreatureId, Encounter } from "../models";
import type { KnowledgeView } from "../perception";
import type { PlanSimulation } from "./plan";
import type { SimulationPort } from "./simulation";

/**
 * RASGOS MEDIDOS DE UN PLAN (factores de TACTICAL_BRAIN_SPEC.md §3, en
 * unidades naturales; diseño aprobado §5). Se CALCULAN; los pesos que los
 * combinan salen de la calibración con la jugadora.
 */
export interface FeatureVector {
  /** Daño esperado que causa el plan (PG). */
  readonly damageDealt: number;
  /** Daño esperado ponderado por la amenaza observada de cada objetivo (PG). */
  readonly threatReduction: number;
  /**
   * Daño esperado ponderado por la amenaza INMEDIATA de cada objetivo: la parte
   * del daño que podría recibir de él antes de su próximo turno (PG).
   */
  readonly immediateThreatReduction: number;
  /** Suma por objetivo de min(1, daño esperado / PG estimados): posibilidad de rematar. */
  readonly finishingChance: number;
  /** Daño esperado que recibirá hasta su próximo turno, con los ataques de oportunidad del plan (PG). */
  readonly damageTaken: number;
  /** min(1, daño esperado recibido / PG actuales). */
  readonly deathRisk: number;
  /** Enemigos en pie a 5 pies o menos al terminar. */
  readonly adjacentEnemies: number;
  /** Pares (miembro del bando, enemigo) en los que hay flanqueo al terminar. */
  readonly flankingPairs: number;
  /** Usos limitados gastados. */
  readonly resourcesSpent: number;
  /** Condiciones esperadas en enemigos (control): suma de probabilidades. */
  readonly conditionsInflicted: number;
  /** Daño esperado a criaturas del propio bando (fuego amigo, PG). */
  readonly friendlyDamage: number;
}

export const FEATURE_NAMES = [
  "damageDealt",
  "threatReduction",
  "immediateThreatReduction",
  "finishingChance",
  "damageTaken",
  "deathRisk",
  "adjacentEnemies",
  "flankingPairs",
  "resourcesSpent",
  "conditionsInflicted",
  "friendlyDamage",
] as const satisfies readonly (keyof FeatureVector)[];

export type FeatureName = (typeof FEATURE_NAMES)[number];

const enemiesOf = (state: Encounter, side: string): CreatureId[] =>
  (Object.keys(state.combatants).sort() as CreatureId[]).filter((id) => state.combatants[id]!.side !== side);

export function computeFeatures(
  port: SimulationPort,
  view: KnowledgeView,
  actorId: CreatureId,
  simulation: Extract<PlanSimulation, { ok: true }>,
): FeatureVector {
  const { initial, final } = simulation;
  const me = final.combatants[actorId];
  if (!me) throw new Error(`Actor desconocido: ${actorId}`);
  const side = me.side;

  // Amenaza observada: parte del daño causado por cada enemigo según lo visto.
  const seen = new Map(view.knownCreatures.flatMap((k) => (k.relation === "enemy" ? [[k.creatureId, k.damageDealtSeen] as const] : [])));
  const totalSeen = [...seen.values()].reduce((a, b) => a + b, 0);

  // Amenaza inmediata al empezar el plan: quién puede atacarle y cuánto.
  const startThreats = port.incomingThreats(initial, actorId);
  const totalStartThreat = startThreats.reduce((s, t) => s + t.expectedDamage, 0);
  const immediateShare = new Map(startThreats.map((t) => [t.enemyId, totalStartThreat > 0 ? t.expectedDamage / totalStartThreat : 0] as const));

  let damageDealt = 0;
  let threatReduction = 0;
  let immediateThreatReduction = 0;
  const damageByTarget = new Map<CreatureId, number>();
  for (const attack of simulation.attacks) {
    damageDealt += attack.odds.expectedDamage;
    damageByTarget.set(attack.targetId, (damageByTarget.get(attack.targetId) ?? 0) + attack.odds.expectedDamage);
    if (totalSeen > 0) threatReduction += attack.odds.expectedDamage * ((seen.get(attack.targetId) ?? 0) / totalSeen);
    immediateThreatReduction += attack.odds.expectedDamage * (immediateShare.get(attack.targetId) ?? 0);
  }
  // Efectos (alientos, derribar…): daño y condiciones esperados por objetivo.
  let friendlyDamage = 0;
  let conditionsInflicted = 0;
  for (const effect of simulation.effects) {
    for (const t of effect.targets) {
      if (t.ally) {
        friendlyDamage += t.expectedDamage;
        continue;
      }
      damageDealt += t.expectedDamage;
      conditionsInflicted += t.conditionChance;
      damageByTarget.set(t.targetId, (damageByTarget.get(t.targetId) ?? 0) + t.expectedDamage);
      if (totalSeen > 0) threatReduction += t.expectedDamage * ((seen.get(t.targetId) ?? 0) / totalSeen);
      immediateThreatReduction += t.expectedDamage * (immediateShare.get(t.targetId) ?? 0);
    }
  }
  let finishingChance = 0;
  for (const [targetId, damage] of damageByTarget) {
    const hp = initial.combatants[targetId]?.state.currentHitPoints;
    if (hp !== null && hp !== undefined && hp > 0) finishingChance += Math.min(1, damage / hp);
  }

  const provokedDamage = simulation.provoked.reduce((sum, p) => sum + p.expectedDamage, 0);
  const incoming = port.incomingThreats(final, actorId).reduce((sum, t) => sum + t.expectedDamage, 0);
  const damageTaken = provokedDamage + incoming;
  const hp = me.state.currentHitPoints;
  const deathRisk = hp === null ? 0 : hp <= 0 ? 1 : Math.min(1, damageTaken / hp);

  const enemies = enemiesOf(final, side).filter((id) => final.combatants[id]!.state.lifeState === "alive");
  const adjacentEnemies = enemies.filter((id) => (port.distanceFeet(final, actorId, id) ?? Infinity) <= 5).length;
  const members = (Object.keys(final.combatants).sort() as CreatureId[]).filter((id) => final.combatants[id]!.side === side);
  let flankingPairs = 0;
  for (const member of members) for (const enemy of enemies) if (port.flanks(final, member, enemy)) flankingPairs++;

  const resourcesSpent = (initial.combatants[actorId]?.state.resources ?? []).reduce((sum, pool) => {
    const after = me.state.resources.find((r) => r.id === pool.id)?.current ?? pool.current;
    return sum + Math.max(0, pool.current - after);
  }, 0);

  return {
    damageDealt,
    threatReduction,
    immediateThreatReduction,
    finishingChance,
    damageTaken,
    deathRisk,
    adjacentEnemies,
    flankingPairs,
    resourcesSpent,
    conditionsInflicted,
    friendlyDamage,
  };
}

export type FeatureWeights = Readonly<Record<FeatureName, number>>;

/** Puntuación de un plan: Σ peso × rasgo (los pesos, de la calibración). */
export function scoreFeatures(features: FeatureVector, weights: FeatureWeights): number {
  return FEATURE_NAMES.reduce((sum, name) => sum + weights[name] * features[name], 0);
}
