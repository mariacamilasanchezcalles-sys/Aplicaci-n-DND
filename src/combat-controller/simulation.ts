import type { AttackId, CreatureId, Encounter } from "../models";
import { buildBeliefEncounter, plausibleValues } from "../perception";
import type { KnowledgeView } from "../perception";
import {
  applyTurnCommand,
  effectOperationOf,
  footprintDistanceSquares,
  previewEffect,
  saveBonusOf,
  saveConditions,
  saveSuccessChance,
  averageDice,
  startTurn,
  areaPlacementCandidates,
  attackConditions,
  attackOdds,
  checkAttackTarget,
  defenseMultiplier,
  effectTargetCandidates,
  getTurnOptions,
  isFlanking,
  reachableSquares,
} from "../rules";
import type { RandomSource } from "../rules";
import type { EffectTargetOdds, EstimatedAttackOdds, IncomingThreat, SimulationPort } from "../tactical-brain";
import type { AttackDefinition, CombatantRecord } from "../models";

/**
 * DADOS ESPERADOS (PROPUESTA, decisión 81): devuelven la media del dado
 * redondeada al par más cercano (d20 → 10, d6 → 4, d4 → 2, d8 → 4, d10 → 6,
 * d12 → 6). Solo sirven para avanzar un estado creído de forma
 * determinista; las probabilidades se calculan aparte (`attackOdds`).
 */
export const expectedDice: RandomSource = {
  nextInt(min, max) {
    const mean = (min + max) / 2;
    const floor = Math.floor(mean);
    if (mean - floor !== 0.5) return Math.round(mean);
    return floor % 2 === 0 ? floor : floor + 1;
  },
};

/**
 * Crea el puerto de simulación del bando de `view.observerId` (diseño
 * aprobado, §1). Usa el encuentro real SOLO para lo público (mapa, reglas de
 * mesa, iniciativa); todo lo demás sale de la vista de conocimiento.
 */
export function createSimulationPort(publicEncounter: Encounter, view: KnowledgeView): SimulationPort {
  const belief = buildBeliefEncounter(publicEncounter, view);
  const knownEnemies = new Map(view.knownCreatures.flatMap((k) => (k.relation === "enemy" ? [[k.creatureId, k] as const] : [])));

  const distance = (state: Encounter, a: CombatantRecord, b: CombatantRecord): number =>
    footprintDistanceSquares(a.state.position, a.definition.size, b.state.position, b.definition.size, state.tableRules.diagonal) *
    state.grid.feetPerSquare;

  /** CA posibles de una criatura vista por el bando (aliados: la real; enemigos: estimada). */
  const armorClassesOf = (target: CombatantRecord): number[] => {
    const known = knownEnemies.get(target.definition.id);
    if (known) return plausibleValues(known.armorClass);
    return target.definition.stats.armorClass === undefined ? [] : [target.definition.stats.armorClass];
  };

  /** Probabilidades de `attack` de `attacker` contra `target` como si estuviera a `distanceFeet`. */
  const oddsAt = (state: Encounter, attacker: CombatantRecord, attack: AttackDefinition, target: CombatantRecord, distanceFeet: number, beyondNormalRange: boolean): EstimatedAttackOdds => {
    const rolled = attackConditions(
      state,
      attacker,
      target,
      distanceFeet,
      beyondNormalRange,
      attack.mode,
      attack.mode === "melee" && isFlanking(state, attacker, target),
    );
    const armorClasses = armorClassesOf(target);
    if (armorClasses.length === 0) return { hitChance: 0, critChance: 0, expectedDamage: 0, armorClassSamples: 0 };
    const defenses = knownEnemies.has(target.definition.id)
      ? {}
      : {
          immunities: target.definition.damageImmunities ?? [],
          resistances: target.definition.damageResistances ?? [],
          vulnerabilities: target.definition.damageVulnerabilities ?? [],
        };
    let hit = 0;
    let crit = 0;
    let damage = 0;
    for (const armorClass of armorClasses) {
      const odds = attackOdds(attack, armorClass, rolled.mode, { d20Penalty: rolled.d20Penalty, criticalOnHit: rolled.criticalOnHit });
      hit += odds.hitChance;
      crit += odds.critChance;
      for (const [type, amount] of Object.entries(odds.expectedDamageByType)) {
        damage += (amount ?? 0) * defenseMultiplier(type as keyof typeof odds.expectedDamageByType, defenses);
      }
    }
    const n = armorClasses.length;
    return { hitChance: hit / n, critChance: crit / n, expectedDamage: damage / n, armorClassSamples: n };
  };

  return {
    belief,
    startTurn: (state, actorId) => startTurn(state, actorId),
    effectOdds(state, turn, key, input): EffectTargetOdds[] | null {
      const operation = effectOperationOf(state, turn, key);
      const actor = state.combatants[turn.actorId];
      if (!operation || !actor) return null;
      const preview = previewEffect(state, turn, key, input);
      if (!preview.ok) return null;
      const save = operation.save;
      const dc = save && typeof save.dc === "number" ? save.dc : null;
      // Media del daño (se tira una vez para todos) por tipo.
      const damage = operation.effects.flatMap((e) => (e.kind === "damage" ? [{ type: e.damageType, amount: (e.dice ? averageDice(e.dice) : 0) + e.bonus }] : []));
      const conditionIds = operation.effects.flatMap((e) => (e.kind === "applyCondition" ? [e.condition] : []));
      return preview.affected.map((targetId) => {
        const target = state.combatants[targetId]!;
        const known = knownEnemies.get(targetId);
        let failChance = 1;
        if (save && dc !== null) {
          const adjust = saveConditions(target, save.ability);
          // Bonificador: el real de los del propio bando; el supuesto de los enemigos.
          const bonus = known ? (view.priors.saveBonus ?? 0) : (saveBonusOf(target.definition, save.ability) ?? 0);
          failChance = adjust.autoFail ? 1 : 1 - saveSuccessChance(bonus, dc, adjust.mode, adjust.d20Penalty);
        }
        const successFactor = save?.onSuccess === "halfDamage" ? 0.5 : 0;
        const defenses = known
          ? {}
          : {
              immunities: target.definition.damageImmunities ?? [],
              resistances: target.definition.damageResistances ?? [],
              vulnerabilities: target.definition.damageVulnerabilities ?? [],
            };
        const expectedDamage = damage.reduce(
          (sum, d) => sum + d.amount * (failChance + (1 - failChance) * successFactor) * defenseMultiplier(d.type, defenses),
          0,
        );
        // Inmunidades: las del propio bando se conocen; las de los enemigos, no.
        const applicable = conditionIds.filter((c) => known || !(target.definition.conditionImmunities ?? []).includes(c));
        return {
          targetId,
          ally: target.side === actor.side,
          saveFailChance: failChance,
          expectedDamage,
          conditionChance: applicable.length > 0 ? failChance : 0,
        };
      });
    },
    distanceFeet(state, a, b) {
      const ra = state.combatants[a];
      const rb = state.combatants[b];
      return ra && rb ? distance(state, ra, rb) : null;
    },
    flanks(state, attackerId, targetId) {
      const attacker = state.combatants[attackerId];
      const target = state.combatants[targetId];
      return attacker !== undefined && target !== undefined && isFlanking(state, attacker, target);
    },
    incomingThreats(state, targetId): IncomingThreat[] {
      const target = state.combatants[targetId];
      if (!target) return [];
      const threats: IncomingThreat[] = [];
      for (const enemy of Object.values(state.combatants).sort((x, y) => (x.definition.id < y.definition.id ? -1 : 1))) {
        if (enemy.side === target.side || enemy.state.lifeState !== "alive" || enemy.state.morale.surrendered) continue;
        const speed = enemy.definition.stats.speedFeet ?? 0;
        const gap = distance(state, enemy, target);
        let best: EstimatedAttackOdds | null = null;
        for (const attack of enemy.definition.attacks) {
          const reach = attack.mode === "melee" ? attack.rangeFeet.normal : (attack.rangeFeet.long ?? attack.rangeFeet.normal);
          // PROPUESTA (decisión 86): puede atacar si llega moviéndose a su Velocidad.
          if (gap > speed + reach) continue;
          const at = attack.mode === "melee" ? Math.min(gap, reach) : Math.max(0, gap - speed);
          const odds = oddsAt(state, enemy, attack, target, at, attack.mode === "ranged" && at > attack.rangeFeet.normal);
          if (best === null || odds.expectedDamage > best.expectedDamage) best = odds;
        }
        if (best) threats.push({ enemyId: enemy.definition.id, expectedDamage: best.expectedDamage, hitChance: best.hitChance });
      }
      return threats;
    },
    getOptions: (state, turn) => getTurnOptions(state, turn),
    reachable: (state, turn) => reachableSquares(state, turn),
    areaPlacements: (state, turn, key, limit) => areaPlacementCandidates(state, turn, key, limit),
    effectTargets: (state, turn, key) => effectTargetCandidates(state, turn, key),
    apply: (state, turn, command) => applyTurnCommand(state, turn, command, expectedDice),

    attackOdds(state, attackerId: CreatureId, attackId: AttackId, targetId: CreatureId): EstimatedAttackOdds | null {
      const attacker = state.combatants[attackerId];
      if (!attacker) return null;
      const check = checkAttackTarget(state, attacker, attacker.state.position, attackId, targetId);
      if (!check.ok) return null;
      return oddsAt(state, attacker, check.attack, check.target, check.distanceFeet, check.beyondNormalRange);
    },
  };
}
