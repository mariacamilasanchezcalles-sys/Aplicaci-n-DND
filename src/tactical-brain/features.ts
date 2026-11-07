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
  /**
   * Probabilidad de caer a 0 PG antes de su próximo turno (Supervivencia de la
   * especificación, en negativo). Cada amenaza impacta con su probabilidad y
   * hace su daño medio por impacto (PROPUESTA, decisión 99).
   */
  readonly deathRisk: number;
  /** Enemigos en pie a 5 pies o menos al terminar. */
  readonly adjacentEnemies: number;
  /**
   * Los mismos, solo si al terminar está Maltrecho (la mitad de sus PG o
   * menos; REGLA OFICIAL VERIFICADA); si no, 0 (PROPUESTA, decisión 100).
   */
  readonly adjacentEnemiesWhileBloodied: number;
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
  "adjacentEnemiesWhileBloodied",
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
  let conditionsInflicted = 0;
  let threatReduction = 0;
  let immediateThreatReduction = 0;
  const damageByTarget = new Map<CreatureId, number>();
  for (const attack of simulation.attacks) {
    damageDealt += attack.odds.expectedDamage;
    damageByTarget.set(attack.targetId, (damageByTarget.get(attack.targetId) ?? 0) + attack.odds.expectedDamage);
    if (totalSeen > 0) threatReduction += attack.odds.expectedDamage * ((seen.get(attack.targetId) ?? 0) / totalSeen);
    immediateThreatReduction += attack.odds.expectedDamage * (immediateShare.get(attack.targetId) ?? 0);
    if (final.combatants[attack.targetId]?.side !== side) conditionsInflicted += attack.odds.conditionChance;
  }
  // Efectos (alientos, derribar…): daño y condiciones esperados por objetivo.
  let friendlyDamage = 0;
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

  const threats = [...simulation.provoked, ...port.incomingThreats(final, actorId)];
  const damageTaken = threats.reduce((sum, t) => sum + t.expectedDamage, 0);
  const hp = me.state.currentHitPoints;
  const deathRisk = hp === null ? 0 : hp <= 0 ? 1 : dropChance(threats, hp);

  const enemies = enemiesOf(final, side).filter((id) => final.combatants[id]!.state.lifeState === "alive");
  const adjacentEnemies = enemies.filter((id) => (port.distanceFeet(final, actorId, id) ?? Infinity) <= 5).length;
  const maxHp = me.definition.stats.maxHitPoints;
  const bloodied = hp !== null && maxHp !== undefined && hp * 2 <= maxHp;
  const adjacentEnemiesWhileBloodied = bloodied ? adjacentEnemies : 0;
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
    adjacentEnemiesWhileBloodied,
    flankingPairs,
    resourcesSpent,
    conditionsInflicted,
    friendlyDamage,
  };
}

/**
 * P(la suma de daños de los impactos ≥ PG). Cada amenaza es independiente:
 * impacta con `hitChance` y entonces hace `expectedDamage / hitChance` (el
 * daño medio de un impacto, con críticos). Se recorren todas las
 * combinaciones de impactos (pocas amenazas por turno).
 */
function dropChance(threats: readonly { readonly expectedDamage: number; readonly hitChance: number }[], hp: number): number {
  const live = threats.filter((t) => t.hitChance > 0 && t.expectedDamage > 0);
  let distribution = new Map<number, number>([[0, 1]]);
  for (const t of live) {
    const perHit = t.expectedDamage / t.hitChance;
    const next = new Map<number, number>();
    for (const [damage, p] of distribution) {
      // Por encima de los PG da igual cuánto más: se agrupa para acotar el cálculo.
      const hit = Math.min(hp, damage + perHit);
      next.set(hit, (next.get(hit) ?? 0) + p * t.hitChance);
      next.set(damage, (next.get(damage) ?? 0) + p * (1 - t.hitChance));
    }
    distribution = next;
  }
  let dropped = 0;
  for (const [damage, p] of distribution) if (damage >= hp) dropped += p;
  return Math.min(1, dropped);
}

export type FeatureWeights = Readonly<Record<FeatureName, number>>;

/** Puntuación de un plan: Σ peso × rasgo (los pesos, de la calibración). */
export function scoreFeatures(features: FeatureVector, weights: FeatureWeights): number {
  return FEATURE_NAMES.reduce((sum, name) => sum + weights[name] * features[name], 0);
}
