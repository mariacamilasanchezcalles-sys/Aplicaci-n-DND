import type { CombatantRecord, CreatureId, Encounter } from "../models";
import { hasCondition } from "./conditions";
import { rollDie } from "./dice";
import type { RandomSource } from "./dice";
import { beginCreatureTurn } from "./turnExecution";
import type { TurnState } from "./turnExecution";
import type { RechargeRoll } from "./resources";

/**
 * INICIATIVA Y ORDEN DE TURNOS.
 * REGLA OFICIAL VERIFICADA (SRD 5.2.1, "Combat"; Glosario 2024):
 * - Al empezar el combate cada participante hace una prueba de Destreza; el
 *   DM tira por los monstruos y hace UNA tirada para cada grupo de criaturas
 *   idénticas.
 * - Sorprendido: Desventaja. Invisible: Ventaja. Incapacitado: Desventaja.
 * - Orden de mayor a menor; se mantiene de asalto en asalto. Empates: los
 *   decide el DM entre monstruos y los jugadores entre personajes.
 * - Un asalto termina cuando todos han tenido su turno.
 * Los personajes jugadores tiran con dados físicos: se anota su total.
 */

/** Bonificador de iniciativa: el del perfil o, si falta, el modificador de Destreza. */
export function initiativeBonusOf(record: CombatantRecord): number | null {
  const explicit = record.definition.initiativeBonus;
  if (explicit !== undefined) return explicit;
  const dex = record.definition.abilities?.dex;
  return dex === undefined ? null : Math.floor((dex - 10) / 2);
}

export interface MonsterInitiativeRoll {
  /** Criaturas que comparten la tirada (grupo de criaturas idénticas). */
  readonly creatureIds: readonly CreatureId[];
  readonly d20Rolls: readonly number[];
  readonly bonus: number;
  readonly total: number;
}

export type MonsterInitiativeResult =
  | { readonly ok: true; readonly totals: Readonly<Record<string, number>>; readonly rolls: readonly MonsterInitiativeRoll[] }
  | { readonly ok: false; readonly reason: "unknownCreature" | "notAMonster" | "initiativeBonusUnknown"; readonly creatureIds: readonly CreatureId[] };

/**
 * Tira la iniciativa de los monstruos con dados virtuales. Cada elemento de
 * `groups` es un grupo de criaturas idénticas que comparte una tirada (quien
 * dirige el combate decide los grupos). Usa el bonificador y el estado del
 * primero del grupo.
 */
export function rollMonsterInitiative(
  encounter: Encounter,
  groups: readonly (readonly CreatureId[])[],
  dice: RandomSource,
  surprised: readonly CreatureId[] = [],
): MonsterInitiativeResult {
  const missing = groups.flat().filter((id) => !encounter.combatants[id]);
  if (missing.length > 0) return { ok: false, reason: "unknownCreature", creatureIds: missing };
  const players = groups.flat().filter((id) => encounter.combatants[id]?.definition.kind !== "monster");
  if (players.length > 0) return { ok: false, reason: "notAMonster", creatureIds: players };
  const unknown = groups.flatMap((group) => {
    const first = group[0] ? encounter.combatants[group[0]] : undefined;
    return first && initiativeBonusOf(first) === null ? [...group] : [];
  });
  if (unknown.length > 0) return { ok: false, reason: "initiativeBonusUnknown", creatureIds: unknown };

  const totals: Record<string, number> = {};
  const rolls: MonsterInitiativeRoll[] = [];
  for (const group of groups) {
    const first = group[0] ? encounter.combatants[group[0]] : undefined;
    if (!first) continue;
    const advantage = hasCondition(first, "invisible");
    const disadvantage = surprised.includes(first.definition.id) || hasCondition(first, "incapacitated");
    const twoDice = advantage !== disadvantage;
    const d20Rolls = twoDice ? [rollDie(20, dice), rollDie(20, dice)] : [rollDie(20, dice)];
    const d20 = !twoDice ? d20Rolls[0]! : advantage ? Math.max(...d20Rolls) : Math.min(...d20Rolls);
    const bonus = initiativeBonusOf(first) ?? 0;
    for (const id of group) totals[id] = d20 + bonus;
    rolls.push({ creatureIds: group, d20Rolls, bonus, total: d20 + bonus });
  }
  return { ok: true, totals, rolls };
}

export type StartCombatResult =
  | { readonly ok: true; readonly encounter: Encounter }
  | { readonly ok: false; readonly reason: "missingInitiative"; readonly creatureIds: readonly CreatureId[] }
  /** Hay empates sin decidir: `tieOrder` debe ordenar a todas estas criaturas. */
  | { readonly ok: false; readonly reason: "tiesUndecided"; readonly ties: readonly (readonly CreatureId[])[] };

/**
 * Fija el orden de iniciativa. `totals` debe tener a todas las criaturas
 * (monstruos tirados con `rollMonsterInitiative`, jugadores anotados).
 * Los empates los decide la persona con `tieOrder` (lista en el orden deseado).
 * No empieza ningún turno: usa `advanceTurn`.
 */
export function startCombat(
  encounter: Encounter,
  totals: Readonly<Record<string, number>>,
  tieOrder: readonly CreatureId[] = [],
): StartCombatResult {
  const ids = Object.keys(encounter.combatants) as CreatureId[];
  const missing = ids.filter((id) => typeof totals[id] !== "number" || !Number.isInteger(totals[id]));
  if (missing.length > 0) return { ok: false, reason: "missingInitiative", creatureIds: missing };

  const byTotal = new Map<number, CreatureId[]>();
  for (const id of ids) byTotal.set(totals[id]!, [...(byTotal.get(totals[id]!) ?? []), id]);
  const ties = [...byTotal.values()].filter((group) => group.length > 1);
  const undecided = ties.filter((group) => !group.every((id) => tieOrder.includes(id)));
  if (undecided.length > 0) return { ok: false, reason: "tiesUndecided", ties: undecided.map((g) => [...g].sort()) };

  const order = [...ids].sort((a, b) => totals[b]! - totals[a]! || tieOrder.indexOf(a) - tieOrder.indexOf(b));
  const initiativeTotals: Record<string, number> = {};
  for (const id of ids) initiativeTotals[id] = totals[id]!;
  return {
    ok: true,
    encounter: { ...encounter, initiativeOrder: order, initiativeTotals, round: 0, turnIndex: -1 },
  };
}

/** Criatura que tiene el turno, o null fuera de combate. */
export function currentCreature(encounter: Encounter): CreatureId | null {
  return encounter.turnIndex < 0 ? null : (encounter.initiativeOrder[encounter.turnIndex] ?? null);
}

export type AdvanceTurnResult =
  | {
      readonly ok: true;
      readonly encounter: Encounter;
      readonly turn: TurnState;
      readonly rechargeRolls: readonly RechargeRoll[];
      /** Monstruos muertos cuyo turno se saltó (PROPUESTA, decisión 58). */
      readonly skipped: readonly CreatureId[];
    }
  | { readonly ok: false; readonly reason: "combatNotStarted" | "turnNotEnded" | "noActiveCombatants" };

/**
 * Pasa al siguiente turno del orden de iniciativa (el primero si el combate
 * acaba de empezar). Exige que el turno actual haya terminado. Al cambiar de
 * vuelta empieza un asalto nuevo. Al inicio del turno: recupera la reacción,
 * termina Esquivar, caducan condiciones y se tiran Recargas.
 */
export function advanceTurn(
  encounter: Encounter,
  currentTurn: TurnState | null,
  dice: RandomSource,
): AdvanceTurnResult {
  if (encounter.initiativeOrder.length === 0) return { ok: false, reason: "combatNotStarted" };
  if (encounter.turnIndex >= 0 && (currentTurn === null || !currentTurn.ended)) {
    return { ok: false, reason: "turnNotEnded" };
  }
  const order = encounter.initiativeOrder;
  let index = encounter.turnIndex;
  let round = encounter.round;
  const skipped: CreatureId[] = [];
  for (let step = 0; step < order.length; step++) {
    index += 1;
    if (index >= order.length || round === 0) {
      if (index >= order.length) index = 0;
      round += 1;
    }
    const id = order[index]!;
    const record = encounter.combatants[id];
    // Los monstruos muertos no juegan turno; los personajes a 0 PG sí (salvaciones contra la muerte).
    if (record && !(record.definition.kind === "monster" && record.state.lifeState === "dead")) {
      const restored: Encounter = {
        ...encounter,
        round,
        turnIndex: index,
        combatants: {
          ...encounter.combatants,
          [id]: { ...record, state: { ...record.state, reactionAvailable: true, dodging: false } },
        },
      };
      const begun = beginCreatureTurn(restored, id, dice);
      return { ok: true, encounter: begun.encounter, turn: begun.turn, rechargeRolls: begun.rechargeRolls, skipped };
    }
    skipped.push(id);
  }
  return { ok: false, reason: "noActiveCombatants" };
}
