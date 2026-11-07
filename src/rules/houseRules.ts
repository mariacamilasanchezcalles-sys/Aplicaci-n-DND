import type {
  CombatantRecord,
  CreatureId,
  Encounter,
  GridPosition,
  OverwhelmingOpposition,
  SideMorale,
} from "../models";
import { applyCondition, canSee, effectiveSpeed, hasCondition, isEnemy, saveConditions } from "./conditions";
import { footprintDistanceSquares } from "./distance";
import { rollDie } from "./dice";
import type { RandomSource } from "./dice";
import { saveBonusOf } from "./effects";
import type { PlayerSaveInput } from "./effects";
import { FOOTPRINT_SIDE, squaresOf } from "./size";
import { dealDamage } from "./vitality";

/**
 * REGLAS CASERAS DE LA MESA (Guía del DM 2014; DECISIONES CONFIRMADAS el
 * 2026-11-07). Cada una se activa con su interruptor en `tableRules`.
 * Donde chocan con 2024 se aplica 2024 (p. ej. un monstruo a 0 PG muere).
 */

const setRecord = (encounter: Encounter, record: CombatantRecord): Encounter => ({
  ...encounter,
  combatants: { ...encounter.combatants, [record.definition.id]: record },
});

const distanceFeet = (encounter: Encounter, a: CombatantRecord, aPos: GridPosition, b: CombatantRecord): number =>
  footprintDistanceSquares(aPos, a.definition.size, b.state.position, b.definition.size, encounter.tableRules.diagonal) *
  encounter.grid.feetPerSquare;

// ---------------------------------------------------------------------------
// Flanquear
// ---------------------------------------------------------------------------

/**
 * ¿La línea entre los centros de dos casillas cruza el espacio del objetivo
 * por lados (o esquinas) opuestos? (Guía 2014: "traza una línea imaginaria
 * entre los centros de los espacios de ambas".)
 */
function crossesOppositeSides(a: GridPosition, b: GridPosition, target: CombatantRecord): boolean {
  const side = FOOTPRINT_SIDE[target.definition.size];
  const x0 = target.state.position.column;
  const y0 = target.state.position.row;
  const x1 = x0 + side;
  const y1 = y0 + side;
  const px = a.column + 0.5;
  const py = a.row + 0.5;
  const dx = b.column + 0.5 - px;
  const dy = b.row + 0.5 - py;
  // Recorte de Liang–Barsky del segmento con el rectángulo del objetivo.
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [
    [-dx, px - x0],
    [dx, x1 - px],
    [-dy, py - y0],
    [dy, y1 - py],
  ] as const) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
  }
  if (t0 >= t1) return false;
  const mx = px + ((t0 + t1) / 2) * dx;
  const my = py + ((t0 + t1) / 2) * dy;
  if (!(mx > x0 && mx < x1 && my > y0 && my < y1)) return false; // debe pasar por dentro
  const eps = 1e-9;
  const sides = (t: number): Set<string> => {
    const x = px + t * dx;
    const y = py + t * dy;
    const out = new Set<string>();
    if (Math.abs(x - x0) < eps) out.add("left");
    if (Math.abs(x - x1) < eps) out.add("right");
    if (Math.abs(y - y0) < eps) out.add("top");
    if (Math.abs(y - y1) < eps) out.add("bottom");
    return out;
  };
  const entry = sides(t0);
  const exit = sides(t1);
  return (
    (entry.has("left") && exit.has("right")) ||
    (entry.has("right") && exit.has("left")) ||
    (entry.has("top") && exit.has("bottom")) ||
    (entry.has("bottom") && exit.has("top"))
  );
}

/** Casillas del espacio de `who` adyacentes (a 5 pies) al espacio de `target`. */
function adjacentSquares(encounter: Encounter, who: CombatantRecord, target: CombatantRecord): GridPosition[] {
  return squaresOf(who.state.position, who.definition.size).filter(
    (square) =>
      footprintDistanceSquares(square, "medium", target.state.position, target.definition.size, encounter.tableRules.diagonal) === 1,
  );
}

/**
 * REGLA CASERA "Flanquear" (guía 2014): la criatura y al menos un aliado,
 * adyacentes a un enemigo y en lados o esquinas opuestos de su espacio,
 * tienen Ventaja en sus ataques cuerpo a cuerpo contra él. Ambos deben verlo
 * y no estar Incapacitados. Grandes o mayores: basta con una de sus casillas.
 */
export function isFlanking(encounter: Encounter, attacker: CombatantRecord, target: CombatantRecord): boolean {
  if (!encounter.tableRules.flanking || !isEnemy(attacker, target)) return false;
  const able = (c: CombatantRecord): boolean =>
    c.state.lifeState === "alive" && !hasCondition(c, "incapacitated") && !c.state.morale.surrendered && canSee(c, target);
  if (!able(attacker)) return false;
  const mine = adjacentSquares(encounter, attacker, target);
  if (mine.length === 0) return false;
  return Object.values(encounter.combatants).some((ally) => {
    if (ally.definition.id === attacker.definition.id || ally.side !== attacker.side || !able(ally)) return false;
    const theirs = adjacentSquares(encounter, ally, target);
    return mine.some((a) => theirs.some((b) => crossesOppositeSides(a, b, target)));
  });
}

// ---------------------------------------------------------------------------
// Marcar
// ---------------------------------------------------------------------------

/**
 * REGLA CASERA "Marcar" (guía 2014): un ataque cuerpo a cuerpo marca a su
 * objetivo hasta el final del siguiente turno del atacante.
 */
export function markTarget(encounter: Encounter, attackerId: CreatureId, targetId: CreatureId, duringOwnTurn: boolean): Encounter {
  if (!encounter.tableRules.mark) return encounter;
  const attacker = encounter.combatants[attackerId];
  if (!attacker) return encounter;
  const marks = [
    ...attacker.state.marks.filter((m) => m.targetId !== targetId),
    // Durante su propio turno, "su siguiente turno" es el que viene: dos finales de turno.
    { targetId, turnEndsRemaining: duringOwnTurn ? 2 : 1 },
  ];
  return setRecord(encounter, { ...attacker, state: { ...attacker.state, marks } });
}

export function hasMarked(reactor: CombatantRecord, targetId: CreatureId): boolean {
  return reactor.state.marks.some((m) => m.targetId === targetId);
}

// ---------------------------------------------------------------------------
// Daño masivo
// ---------------------------------------------------------------------------

export type ShockResult =
  | "dropToZero"
  | "dropToZeroStable"
  | "stunned"
  | "noReactionsAndDisadvantage"
  | "noReactions";

/** Tabla "Estado de shock" de la guía 2014 (1d10). */
export function shockFromRoll(d10: number): ShockResult {
  if (d10 <= 1) return "dropToZero";
  if (d10 <= 3) return "dropToZeroStable";
  if (d10 <= 5) return "stunned";
  if (d10 <= 7) return "noReactionsAndDisadvantage";
  return "noReactions";
}

export interface MassiveDamageOutcome {
  readonly encounter: Encounter;
  readonly save: { readonly total: number | null; readonly success: boolean; readonly source: "virtual" | "player" | "automaticFailure" };
  readonly shockRoll: number | null;
  readonly shock: ShockResult | null;
}

/** ¿Procede la salvación de Daño masivo? (daño de un único origen ≥ mitad del máximo, y sigue en pie). */
export function massiveDamageApplies(encounter: Encounter, targetId: CreatureId, damageTaken: number): boolean {
  if (!encounter.tableRules.massiveDamage) return false;
  const record = encounter.combatants[targetId];
  const max = record?.definition.stats.maxHitPoints;
  return record !== undefined && max !== undefined && record.state.lifeState === "alive" && damageTaken > 0 && damageTaken * 2 >= max;
}

/**
 * REGLA CASERA "Daño masivo" (guía 2014): salvación de Constitución CD 15;
 * si falla, 1d10 en la tabla de shock. Consecuencias con reglas 2024
 * (DECISIÓN CONFIRMADA): a 0 PG un monstruo muere y un personaje queda
 * moribundo (o estable). Los jugadores tiran su salvación (`playerSave`); la
 * tabla la tira la app.
 */
export function resolveMassiveDamage(
  encounter: Encounter,
  targetId: CreatureId,
  dice: RandomSource,
  playerSave: PlayerSaveInput | null,
  duringOwnTurn: boolean,
): MassiveDamageOutcome | { readonly error: "playerSaveRequired" | "saveBonusUnknown" } {
  const record = encounter.combatants[targetId];
  if (!record) return { error: "saveBonusUnknown" };
  const dc = 15;
  const adjust = saveConditions(record, "con");
  let save: MassiveDamageOutcome["save"];
  if (adjust.autoFail) {
    save = { total: null, success: false, source: "automaticFailure" };
  } else if (record.definition.kind === "playerCharacter") {
    if (playerSave === null) return { error: "playerSaveRequired" };
    const total = "total" in playerSave ? playerSave.total : null;
    save = { total, success: "total" in playerSave ? playerSave.total >= dc : playerSave.outcome === "success", source: "player" };
  } else {
    const bonus = saveBonusOf(record.definition, "con");
    if (bonus === null) return { error: "saveBonusUnknown" };
    const first = rollDie(20, dice);
    const d20 =
      adjust.mode === "disadvantage" ? Math.min(first, rollDie(20, dice)) : adjust.mode === "advantage" ? Math.max(first, rollDie(20, dice)) : first;
    const total = d20 + bonus - adjust.d20Penalty;
    save = { total, success: total >= dc, source: "virtual" };
  }
  if (save.success) return { encounter, save, shockRoll: null, shock: null };

  const shockRoll = rollDie(10, dice);
  const shock = shockFromRoll(shockRoll);
  let updated = encounter;
  const current = record.state.currentHitPoints ?? 0;
  switch (shock) {
    case "dropToZero":
      updated = dealDamage(updated, targetId, current).encounter;
      break;
    case "dropToZeroStable": {
      updated = dealDamage(updated, targetId, current).encounter;
      const after = updated.combatants[targetId];
      if (after && after.state.lifeState === "dying") {
        updated = setRecord(updated, { ...after, state: { ...after.state, lifeState: "stable", deathSaves: { successes: 0, failures: 0 } } });
      }
      break;
    }
    case "stunned": {
      // "Hasta el final de su siguiente turno".
      const applied = applyCondition(updated, targetId, "stunned", null, { kind: "indefinite" });
      if (applied.applied) {
        const after = applied.encounter.combatants[targetId]!;
        const conditions = after.state.conditions.map((c) =>
          c.condition === "stunned" && c.sourceId === null && c.duration.kind === "indefinite" && c.turnEndsRemaining === undefined
            ? { ...c, turnEndsRemaining: duringOwnTurn ? 2 : 1 }
            : c,
        );
        updated = setRecord(applied.encounter, { ...after, state: { ...after.state, conditions } });
      }
      break;
    }
    case "noReactionsAndDisadvantage":
    case "noReactions": {
      const after = updated.combatants[targetId]!;
      updated = setRecord(updated, {
        ...after,
        state: { ...after.state, shock: { kind: shock, turnEndsRemaining: duringOwnTurn ? 2 : 1 } },
      });
      break;
    }
  }
  return { encounter: updated, save, shockRoll, shock };
}

// ---------------------------------------------------------------------------
// Moral
// ---------------------------------------------------------------------------

export type MoraleTrigger =
  | "surprised"
  | "belowHalfHitPoints"
  | "cannotHarmOpponents"
  | "groupSurprised"
  | "leaderDown"
  | "groupHalved";

export interface MoraleCheck {
  readonly trigger: MoraleTrigger;
  /** Quien hace la salvación (la criatura o el líder del grupo). */
  readonly saverId: CreatureId;
  /** Quienes huyen si falla. */
  readonly affected: readonly CreatureId[];
  readonly d20Rolls: readonly number[];
  readonly total: number | null;
  readonly success: boolean;
}

const isMonster = (r: CombatantRecord): boolean => r.definition.kind === "monster";
const standing = (r: CombatantRecord): boolean =>
  r.state.lifeState === "alive" && !hasCondition(r, "incapacitated") && !r.state.morale.surrendered;

/** Miembros monstruo de un bando. */
function monstersOfSide(encounter: Encounter, side: string): CombatantRecord[] {
  return Object.values(encounter.combatants)
    .filter((r) => r.side === side && isMonster(r))
    .sort((a, b) => (a.definition.id < b.definition.id ? -1 : 1));
}

/** Prepara la Moral por bando al empezar el combate (miembros iniciales, líder y oposición abrumadora). */
export function initSideMorale(
  encounter: Encounter,
  leaders: Readonly<Record<string, CreatureId>> = {},
  overwhelming: Readonly<Record<string, OverwhelmingOpposition>> = {},
): Encounter {
  const sides = [...new Set(Object.values(encounter.combatants).filter(isMonster).map((r) => r.side))].sort();
  const sideMorale: Record<string, SideMorale> = {};
  for (const side of sides) {
    sideMorale[side] = {
      leaderId: leaders[side] ?? null,
      startingMembers: monstersOfSide(encounter, side).length,
      overwhelming: overwhelming[side] ?? "none",
      leaderTriggered: false,
      halvedTriggered: false,
    };
  }
  return { ...encounter, sideMorale };
}

/** Salvación de Sabiduría CD 10 (guía 2014), con Desventaja o fallo automático si el DM juzga la oposición abrumadora. */
function moraleSave(
  saver: CombatantRecord,
  overwhelming: OverwhelmingOpposition,
  dice: RandomSource,
): { d20Rolls: number[]; total: number | null; success: boolean } {
  const adjust = saveConditions(saver, "wis");
  if (overwhelming === "autoFail" || adjust.autoFail) return { d20Rolls: [], total: null, success: false };
  const bonus = saveBonusOf(saver.definition, "wis") ?? 0;
  const disadvantage = overwhelming === "disadvantage" || adjust.mode === "disadvantage";
  const advantage = adjust.mode === "advantage";
  const twoDice = disadvantage !== advantage;
  const d20Rolls = twoDice ? [rollDie(20, dice), rollDie(20, dice)] : [rollDie(20, dice)];
  const d20 = !twoDice ? d20Rolls[0]! : advantage ? Math.max(...d20Rolls) : Math.min(...d20Rolls);
  const total = d20 + bonus - adjust.d20Penalty;
  return { d20Rolls, total, success: total >= 10 };
}

function setFleeing(encounter: Encounter, ids: readonly CreatureId[]): Encounter {
  let updated = encounter;
  for (const id of ids) {
    const r = updated.combatants[id];
    if (r) updated = setRecord(updated, { ...r, state: { ...r.state, morale: { ...r.state.morale, fleeing: true } } });
  }
  return updated;
}

/** Quién salva por el grupo: el líder o, si no puede, el de mayor Carisma que pueda. */
function groupSaver(encounter: Encounter, side: string): CombatantRecord | null {
  const morale = encounter.sideMorale[side];
  const leader = morale?.leaderId ? encounter.combatants[morale.leaderId] : undefined;
  if (leader && standing(leader)) return leader;
  const candidates = monstersOfSide(encounter, side).filter(standing);
  candidates.sort((a, b) => (b.definition.abilities?.cha ?? 0) - (a.definition.abilities?.cha ?? 0));
  return candidates[0] ?? null;
}

function runCheck(
  encounter: Encounter,
  trigger: MoraleTrigger,
  saver: CombatantRecord,
  affected: readonly CreatureId[],
  dice: RandomSource,
): { encounter: Encounter; check: MoraleCheck } {
  const overwhelming = encounter.sideMorale[saver.side]?.overwhelming ?? "none";
  const save = moraleSave(saver, overwhelming, dice);
  const check: MoraleCheck = { trigger, saverId: saver.definition.id, affected, ...save };
  return { encounter: save.success ? encounter : setFleeing(encounter, affected), check };
}

/**
 * Disparadores de Moral que dependen del estado (se comprueban tras cada
 * orden): bajar de la mitad de PG por primera vez, líder fuera de combate y
 * grupo reducido a la mitad sin que caiga ningún rival. Cada uno, una vez por
 * combate. Solo monstruos.
 */
export function runStateMoraleChecks(encounter: Encounter, dice: RandomSource): { encounter: Encounter; checks: MoraleCheck[] } {
  if (!encounter.tableRules.morale) return { encounter, checks: [] };
  let updated = encounter;
  const checks: MoraleCheck[] = [];

  // Individual: por debajo de la mitad de PG por primera vez.
  for (const id of Object.keys(updated.combatants).sort() as CreatureId[]) {
    const r = updated.combatants[id]!;
    const max = r.definition.stats.maxHitPoints;
    const hp = r.state.currentHitPoints;
    if (!isMonster(r) || !standing(r) || r.state.morale.fleeing || r.state.morale.belowHalfTriggered) continue;
    if (max === undefined || hp === null || hp * 2 >= max) continue;
    updated = setRecord(updated, { ...r, state: { ...r.state, morale: { ...r.state.morale, belowHalfTriggered: true } } });
    const result = runCheck(updated, "belowHalfHitPoints", updated.combatants[id]!, [id], dice);
    updated = result.encounter;
    checks.push(result.check);
  }

  // Grupo.
  for (const side of Object.keys(updated.sideMorale).sort()) {
    const morale = updated.sideMorale[side]!;
    const members = monstersOfSide(updated, side);
    const fleeTargets = (): CreatureId[] =>
      monstersOfSide(updated, side).filter((m) => standing(m) && !m.state.morale.fleeing).map((m) => m.definition.id);

    const leader = morale.leaderId ? updated.combatants[morale.leaderId] : undefined;
    if (!morale.leaderTriggered && leader && !standing(leader)) {
      updated = { ...updated, sideMorale: { ...updated.sideMorale, [side]: { ...morale, leaderTriggered: true } } };
      const saver = groupSaver(updated, side);
      if (saver) {
        const result = runCheck(updated, "leaderDown", saver, fleeTargets(), dice);
        updated = result.encounter;
        checks.push(result.check);
      }
    }

    const current = updated.sideMorale[side]!;
    const opponentsFallen = Object.values(updated.combatants).some(
      (r) => members[0] !== undefined && isEnemy(r, members[0]) && r.state.lifeState !== "alive",
    );
    const remaining = members.filter(standing).length;
    if (!current.halvedTriggered && !opponentsFallen && current.startingMembers > 0 && remaining * 2 <= current.startingMembers && remaining > 0) {
      updated = { ...updated, sideMorale: { ...updated.sideMorale, [side]: { ...current, halvedTriggered: true } } };
      const saver = groupSaver(updated, side);
      if (saver) {
        const result = runCheck(updated, "groupHalved", saver, fleeTargets(), dice);
        updated = result.encounter;
        checks.push(result.check);
      }
    }
  }
  return { encounter: updated, checks };
}

/**
 * Disparadores de Moral al empezar el combate: criaturas sorprendidas y, si
 * todo el grupo lo está, el grupo (lo salva el líder).
 */
export function runSurpriseMoraleChecks(
  encounter: Encounter,
  surprised: readonly CreatureId[],
  dice: RandomSource,
): { encounter: Encounter; checks: MoraleCheck[] } {
  if (!encounter.tableRules.morale) return { encounter, checks: [] };
  let updated = encounter;
  const checks: MoraleCheck[] = [];
  for (const side of Object.keys(updated.sideMorale).sort()) {
    const members = monstersOfSide(updated, side);
    if (members.length > 0 && members.every((m) => surprised.includes(m.definition.id))) {
      const saver = groupSaver(updated, side);
      if (saver) {
        const result = runCheck(updated, "groupSurprised", saver, members.map((m) => m.definition.id), dice);
        updated = result.encounter;
        checks.push(result.check);
      }
      continue;
    }
    for (const member of members) {
      if (!surprised.includes(member.definition.id) || !standing(member)) continue;
      const result = runCheck(updated, "surprised", updated.combatants[member.definition.id]!, [member.definition.id], dice);
      updated = result.encounter;
      checks.push(result.check);
    }
  }
  return { encounter: updated, checks };
}

/**
 * Disparador al inicio de su turno: "no tiene forma alguna de dañar a sus
 * oponentes durante su turno". PROPUESTA de cálculo (decisión 64): ningún
 * enemigo en pie a su Velocidad + el mayor alcance de sus ataques y efectos
 * de daño, o no tiene ninguno.
 */
export function runTurnStartMoraleCheck(
  encounter: Encounter,
  creatureId: CreatureId,
  dice: RandomSource,
): { encounter: Encounter; checks: MoraleCheck[] } {
  const r = encounter.combatants[creatureId];
  if (!encounter.tableRules.morale || !r || !isMonster(r) || !standing(r) || r.state.morale.fleeing) {
    return { encounter, checks: [] };
  }
  const attackReach = r.definition.attacks.map((a) => (a.mode === "melee" ? a.rangeFeet.normal : (a.rangeFeet.long ?? a.rangeFeet.normal)));
  const effectReach = (r.definition.capabilities ?? []).flatMap((c) =>
    c.body.op === "effect" && c.body.effects.some((e) => e.kind === "damage")
      ? [c.body.targeting.kind === "area" ? c.body.targeting.rangeFeet + c.body.targeting.sizeFeet : c.body.targeting.kind === "creatures" ? c.body.targeting.rangeFeet : 0]
      : [],
  );
  const reach = Math.max(-1, ...attackReach, ...effectReach);
  const speed = effectiveSpeed(r) ?? 0;
  const canHarm =
    reach >= 0 &&
    Object.values(encounter.combatants).some(
      (other) => isEnemy(r, other) && other.state.lifeState !== "dead" && distanceFeet(encounter, other, other.state.position, r) <= speed + reach,
    );
  if (canHarm) return { encounter, checks: [] };
  const result = runCheck(encounter, "cannotHarmOpponents", r, [creatureId], dice);
  return { encounter: result.encounter, checks: [result.check] };
}

/** El DM decide que una criatura que huía o se rindió vuelve a luchar (p. ej. si la siguen atacando). */
export function resumeFighting(encounter: Encounter, creatureId: CreatureId): Encounter {
  const r = encounter.combatants[creatureId];
  if (!r) return encounter;
  return setRecord(encounter, { ...r, state: { ...r.state, morale: { ...r.state.morale, fleeing: false, surrendered: false } } });
}
