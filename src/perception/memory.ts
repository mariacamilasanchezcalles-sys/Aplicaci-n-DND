import type { CombatantRecord, CreatureId, CreatureMemory, Encounter, SideKnowledge } from "../models";
import { canSee, hasCondition } from "../rules";
import type { TurnLogEntry } from "../rules";

/**
 * ACTUALIZACIÓN DE LA MEMORIA DE CADA BANDO a partir de lo que percibe.
 * Diseño aprobado (docs/TACTICAL_BRAIN_DESIGN.md §3):
 * - Todos aprenden de lo que perciben (INT y SAB: más adelante).
 * - El bando comparte todo su conocimiento.
 * - Nunca se copia la CA ni los PG reales de otra criatura: solo hechos
 *   observables (posición, condiciones visibles, Maltrecho, daño visto,
 *   impacto o fallo de sus propias tiradas).
 */

const ALIVE_PERCEIVER = (r: CombatantRecord): boolean =>
  r.state.lifeState === "alive" && !hasCondition(r, "unconscious");

/** Bandos con al menos un monstruo (los que piensa el cerebro). */
function thinkingSides(encounter: Encounter): string[] {
  return [...new Set(Object.values(encounter.combatants).filter((r) => r.definition.kind === "monster").map((r) => r.side))].sort();
}

/**
 * ¿Percibe el bando a esta criatura? Sí si es de su bando, o si algún miembro
 * consciente puede verla (PENDIENTE: oído, sentidos especiales, luz).
 */
export function sidePerceives(encounter: Encounter, side: string, target: CombatantRecord): boolean {
  if (target.side === side) return true;
  return Object.values(encounter.combatants).some((m) => m.side === side && ALIVE_PERCEIVER(m) && canSee(m, target));
}

function emptyMemory(target: CombatantRecord): CreatureMemory {
  return {
    creatureId: target.definition.id,
    side: target.side,
    size: target.definition.size,
    lastSeenPosition: null,
    lastSeenRound: null,
    lifeStateSeen: target.state.lifeState,
    conditionsSeen: [],
    armorClassAtLeast: null,
    armorClassAtMost: null,
    damageSeen: 0,
    healingSeen: 0,
    netDamageSeenWhileNotBloodied: null,
    netDamageSeenWhileBloodied: null,
    attacksSeen: [],
    capabilitiesSeen: [],
    damageDealtSeen: 0,
  };
}

type MemoryUpdate = (memory: CreatureMemory) => CreatureMemory;

function updateMemory(encounter: Encounter, side: string, targetId: CreatureId, update: MemoryUpdate): Encounter {
  const target = encounter.combatants[targetId];
  if (!target || target.side === side) return encounter;
  const knowledge: SideKnowledge = encounter.sideKnowledge[side] ?? { creatures: {} };
  const current = knowledge.creatures[targetId] ?? emptyMemory(target);
  return {
    ...encounter,
    sideKnowledge: {
      ...encounter.sideKnowledge,
      [side]: { creatures: { ...knowledge.creatures, [targetId]: update(current) } },
    },
  };
}

const addUnique = <T>(list: readonly T[], item: T): T[] => (list.includes(item) ? [...list] : [...list, item]);

/**
 * Lo que el bando ve ahora: posición, estado vital, condiciones visibles y
 * Maltrecho (para acotar los PG máximos con el daño neto visto).
 */
export function observeState(encounter: Encounter): Encounter {
  let updated = encounter;
  for (const side of thinkingSides(encounter)) {
    for (const target of Object.values(encounter.combatants)) {
      if (target.side === side || !sidePerceives(encounter, side, target)) continue;
      updated = updateMemory(updated, side, target.definition.id, (m) => {
        const max = target.definition.stats.maxHitPoints;
        const hp = target.state.currentHitPoints;
        // Maltrecho es observable a simple vista (decisión de diseño); los PG exactos no.
        const bloodied = max !== undefined && hp !== null ? hp * 2 <= max : null;
        const net = m.damageSeen - m.healingSeen;
        return {
          ...m,
          lastSeenPosition: target.state.position,
          lastSeenRound: encounter.round,
          lifeStateSeen: target.state.lifeState,
          conditionsSeen: [
            ...target.state.conditions.map((c) => c.condition).filter((c) => c !== "invisible"),
            ...(target.state.exhaustionLevel > 0 ? (["exhaustion"] as const) : []),
          ].filter((c, i, all) => all.indexOf(c) === i),
          netDamageSeenWhileNotBloodied:
            bloodied === false ? Math.max(m.netDamageSeenWhileNotBloodied ?? 0, net) : m.netDamageSeenWhileNotBloodied,
          netDamageSeenWhileBloodied:
            bloodied === true ? Math.min(m.netDamageSeenWhileBloodied ?? Number.MAX_SAFE_INTEGER, net) : m.netDamageSeenWhileBloodied,
        };
      });
    }
  }
  return updated;
}

/** Clave de una capacidad para recordar que se ha visto usar. */
function capabilityKey(source: Extract<TurnLogEntry, { kind: "capabilityBegun" }>["source"]): string {
  switch (source.kind) {
    case "standard":
      return `standard:${source.action}`;
    case "sheet":
      return `sheet:${source.capabilityId}`;
    case "bonusAction":
      return `bonusAction:${source.bonusActionId}`;
  }
}

/**
 * Procesa lo ocurrido en una orden (entradas nuevas del registro del turno
 * de `actorId`). Cada bando aprende lo que percibe:
 * - de los ataques de SU bando conoce el total: cotas de la CA del objetivo;
 * - de cualquier ataque o efecto que vea: daño recibido y causado, ataques y
 *   capacidades usados.
 * Se llama con el encuentro DESPUÉS de la orden.
 */
export function observeLogEntries(encounter: Encounter, actorId: CreatureId, entries: readonly TurnLogEntry[]): Encounter {
  let updated = encounter;
  const sides = thinkingSides(encounter);
  const perceives = (side: string, id: CreatureId): boolean => {
    const r = updated.combatants[id];
    return r !== undefined && sidePerceives(updated, side, r);
  };

  for (const entry of entries) {
    if (entry.kind === "attackResolved" || entry.kind === "opportunityAttack") {
      const attackerId = entry.kind === "attackResolved" ? actorId : entry.reactorId;
      const attack = entry.kind === "attackResolved" ? entry : entry.attack;
      const attacker = updated.combatants[attackerId];
      if (!attacker) continue;
      const { resolution } = attack;
      for (const side of sides) {
        if (!perceives(side, attackerId) && !perceives(side, attack.targetId)) continue;
        // Ataque propio del bando: conoce su total → cotas de la CA.
        if (attacker.side === side && resolution.naturalRoll !== 20 && resolution.naturalRoll !== 1) {
          const hit = resolution.outcome !== "miss";
          updated = updateMemory(updated, side, attack.targetId, (m) => ({
            ...m,
            armorClassAtMost: hit ? Math.min(m.armorClassAtMost ?? Number.MAX_SAFE_INTEGER, resolution.attackTotal) : m.armorClassAtMost,
            armorClassAtLeast: hit ? m.armorClassAtLeast : Math.max(m.armorClassAtLeast ?? 0, resolution.attackTotal + 1),
          }));
        }
        updated = updateMemory(updated, side, attack.targetId, (m) => ({ ...m, damageSeen: m.damageSeen + attack.damageApplied }));
        updated = updateMemory(updated, side, attackerId, (m) => ({
          ...m,
          attacksSeen: addUnique(m.attacksSeen, attack.attackId),
          damageDealtSeen: m.damageDealtSeen + attack.damageApplied,
        }));
      }
    } else if (entry.kind === "effectResolved") {
      for (const side of sides) {
        if (!perceives(side, actorId) && !entry.affected.some((id) => perceives(side, id))) continue;
        const dealt = entry.targets.reduce((sum, t) => sum + t.damageApplied, 0);
        updated = updateMemory(updated, side, actorId, (m) => ({ ...m, damageDealtSeen: m.damageDealtSeen + dealt }));
        for (const t of entry.targets) {
          updated = updateMemory(updated, side, t.targetId, (m) => ({
            ...m,
            damageSeen: m.damageSeen + t.damageApplied,
            healingSeen: m.healingSeen + t.healed,
          }));
        }
      }
    } else if (entry.kind === "capabilityBegun") {
      for (const side of sides) {
        if (!perceives(side, actorId)) continue;
        updated = updateMemory(updated, side, actorId, (m) => ({ ...m, capabilitiesSeen: addUnique(m.capabilitiesSeen, capabilityKey(entry.source)) }));
      }
    }
  }
  return observeState(updated);
}
