import type { AttackId, CreatureId, Encounter } from "../models";
import { buildBeliefEncounter, plausibleValues } from "../perception";
import type { KnowledgeView } from "../perception";
import {
  applyTurnCommand,
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
import type { EstimatedAttackOdds, SimulationPort } from "../tactical-brain";

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

  return {
    belief,
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
      const rolled = attackConditions(
        state,
        attacker,
        check.target,
        check.distanceFeet,
        check.beyondNormalRange,
        check.attack.mode,
        check.attack.mode === "melee" && isFlanking(state, attacker, check.target),
      );
      // CA: aliados → la real (la conoce el bando); enemigos → el intervalo estimado.
      const known = knownEnemies.get(targetId);
      const armorClasses = known
        ? plausibleValues(known.armorClass)
        : check.target.definition.stats.armorClass === undefined
          ? []
          : [check.target.definition.stats.armorClass];
      if (armorClasses.length === 0) {
        return { hitChance: 0, critChance: 0, expectedDamage: 0, armorClassSamples: 0 };
      }
      // Defensas: de los aliados se conocen; de los enemigos, aún no se estiman (PENDIENTE).
      const defenses = known
        ? {}
        : {
            immunities: check.target.definition.damageImmunities ?? [],
            resistances: check.target.definition.damageResistances ?? [],
            vulnerabilities: check.target.definition.damageVulnerabilities ?? [],
          };
      let hit = 0;
      let crit = 0;
      let damage = 0;
      for (const armorClass of armorClasses) {
        const odds = attackOdds(check.attack, armorClass, rolled.mode, { d20Penalty: rolled.d20Penalty, criticalOnHit: rolled.criticalOnHit });
        hit += odds.hitChance;
        crit += odds.critChance;
        for (const [type, amount] of Object.entries(odds.expectedDamageByType)) {
          damage += (amount ?? 0) * defenseMultiplier(type as keyof typeof odds.expectedDamageByType, defenses);
        }
      }
      const n = armorClasses.length;
      return { hitChance: hit / n, critChance: crit / n, expectedDamage: damage / n, armorClassSamples: n };
    },
  };
}
