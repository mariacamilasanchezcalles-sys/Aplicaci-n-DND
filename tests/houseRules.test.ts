import { describe, expect, it } from "vitest";
import { asAttackId, asCreatureId } from "../src/models";
import type { CombatantDefinition, CreatureSize, Encounter, GridPosition, TableRules } from "../src/models";
import {
  advanceTurn,
  applyCondition,
  applyTurnCommand,
  dealDamage,
  getTurnOptions,
  isFlanking,
  resolveMassiveDamage,
  resumeFighting,
  runStateMoraleChecks,
  runSurpriseMoraleChecks,
  shockFromRoll,
  startCombat,
  startTurn,
} from "../src/rules";
import type { TurnCommand, TurnState } from "../src/rules";
import { goblin } from "../src/scenarios/provisionalScenario";
import { CORE_TEST_TABLE_RULES, emptyEncounter, engine, scriptedDice } from "./helpers";

const id = asCreatureId;
const at = (column: number, row: number): GridPosition => ({ column, row });
const monster = (name: string, hp = 20, size: CreatureSize = "medium"): CombatantDefinition => ({
  ...goblin,
  id: id(name),
  label: name,
  size,
  stats: { ...goblin.stats, maxHitPoints: hp },
});
const hero = (name: string, hp = 30): CombatantDefinition => ({
  kind: "playerCharacter",
  registration: "simplified",
  testRole: "melee-fighter",
  id: id(name),
  label: name,
  size: "medium",
  stats: { maxHitPoints: hp, armorClass: 12, speedFeet: 30 },
  attacks: [{ id: asAttackId("sword"), label: "Espada", mode: "melee", rangeFeet: { normal: 5 }, toHitBonus: 5, damage: [] }],
  bonusActions: [],
  traits: [],
});

function scene(rules: Partial<TableRules>, ...entries: readonly (readonly [CombatantDefinition, number, number, string?])[]): Encounter {
  const base = { ...emptyEncounter(20, 20), tableRules: { ...CORE_TEST_TABLE_RULES, ...rules } };
  return entries.reduce((e, [d, c, r, side]) => engine.addCombatant(e, d, { column: c, row: r }, side ? { side } : {}), base);
}
type State = { encounter: Encounter; turn: TurnState };
function run(state: State, command: TurnCommand, dice = scriptedDice([])): State {
  const result = applyTurnCommand(state.encounter, state.turn, command, dice);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return { encounter: result.encounter, turn: result.turn };
}
const rec = (e: Encounter, name: string) => e.combatants[name]!;

describe("Flanquear (regla casera, guía 2014)", () => {
  const flank = (ally: GridPosition, rules: Partial<TableRules> = { flanking: true }, size: CreatureSize = "medium") => {
    const e = scene(rules, [monster("a"), 4, 5], [monster("b"), ally.column, ally.row], [hero("t"), 5, 5]);
    const withSize = size === "medium" ? e : scene(rules, [monster("a"), 4, 5], [monster("b"), ally.column, ally.row], [{ ...hero("t"), size }, 5, 5]);
    return isFlanking(withSize, rec(withSize, "a"), rec(withSize, "t"));
  };

  it("lados opuestos: sí; lados contiguos: no; con la regla apagada: no", () => {
    expect(flank(at(6, 5))).toBe(true);
    expect(flank(at(5, 6))).toBe(false);
    expect(flank(at(6, 5), { flanking: false })).toBe(false);
  });

  it("si la línea entre centros cruza lados contiguos, no flanquean", () => {
    // (4,5) y (6,6): la línea entre centros entra por el lado izquierdo y sale por el de abajo (contiguos).
    expect(flank(at(6, 6))).toBe(false);
  });

  it("esquinas opuestas", () => {
    const e = scene({ flanking: true }, [monster("a"), 4, 4], [monster("b"), 6, 6], [hero("t"), 5, 5]);
    expect(isFlanking(e, rec(e, "a"), rec(e, "t"))).toBe(true);
  });

  it("objetivo Grande: basta con que una casilla de cada uno cumpla", () => {
    expect(flank(at(7, 6), { flanking: true }, "large")).toBe(true);
  });

  it("el aliado debe ver al objetivo y no estar Incapacitado", () => {
    const e = scene({ flanking: true }, [monster("a"), 4, 5], [monster("b"), 6, 5], [hero("t"), 5, 5]);
    const stunned = applyCondition(e, id("b"), "stunned", null, { kind: "indefinite" });
    if (!stunned.applied) throw new Error(stunned.reason);
    expect(isFlanking(stunned.encounter, rec(stunned.encounter, "a"), rec(stunned.encounter, "t"))).toBe(false);
  });

  it("en el turno: el ataque cuerpo a cuerpo flanqueando se ofrece con Ventaja", () => {
    const e = scene({ flanking: true }, [monster("a"), 4, 5], [monster("b"), 6, 5], [hero("t"), 5, 5]);
    const begun = run({ encounter: e, turn: startTurn(e, id("a")) }, { kind: "beginCapability", source: { kind: "standard", action: "attack" } });
    const options = getTurnOptions(begun.encounter, begun.turn).executionOptions.map((o) => o.choice);
    expect(options).toContainEqual({ kind: "attack", attackId: "scimitar", targetId: "t", rollMode: "advantage" });
  });
});

describe("Marcar (regla casera, guía 2014)", () => {
  it("el ataque cuerpo a cuerpo marca; el marcado que se aleja recibe un ataque de oportunidad con Ventaja sin gastar la reacción", () => {
    const e = scene({ mark: true }, [monster("a"), 5, 5], [hero("t"), 6, 5]);
    let s: State = { encounter: e, turn: startTurn(e, id("a")) };
    s = run(s, { kind: "beginCapability", source: { kind: "standard", action: "attack" } });
    const key = getTurnOptions(s.encounter, s.turn).executionOptions.find((o) => o.choice.kind === "attack" && o.choice.attackId === "scimitar")?.key ?? "";
    s = run(s, { kind: "chooseOption", key }, scriptedDice([2])); // falla, pero marca igual
    expect(rec(s.encounter, "a").state.marks).toEqual([{ targetId: "t", turnEndsRemaining: 2 }]);

    // "a" ya gastó su reacción; aun así puede atacar al marcado.
    let e2 = s.encounter;
    e2 = { ...e2, combatants: { ...e2.combatants, a: { ...rec(e2, "a"), state: { ...rec(e2, "a").state, reactionAvailable: false } } } };
    let t: State = { encounter: e2, turn: startTurn(e2, id("t")) };
    t = run(t, { kind: "move", path: [at(7, 5)] });
    expect(t.turn.pendingReactions).toEqual([{ kind: "opportunityAttack", reactorId: "a", moverId: "t", attackIds: ["scimitar"], viaMark: true }]);
    // Ventaja: 18 + 4 >= 12 impacta; 1d6 = 2 (+2) y el 1d4 del Goblin por la Ventaja = 1.
    const dice = scriptedDice([3, 18, 2, 1]);
    t = run(t, { kind: "resolveReaction", reactorId: id("a"), take: true }, dice);
    expect(dice.remaining()).toBe(0);
    expect(rec(t.encounter, "t").state.currentHitPoints).toBe(30 - 5);
    expect(rec(t.encounter, "a").state.reactionAvailable).toBe(false);
    // Solo uno por turno: volver y salir otra vez no provoca otro.
    t = run(t, { kind: "move", path: [at(6, 5)] });
    t = run(t, { kind: "move", path: [at(7, 5)] });
    expect(t.turn.pendingReactions).toEqual([]);
  });

  it("la marca dura hasta el final del siguiente turno del atacante", () => {
    const e = scene({ mark: true }, [monster("a"), 5, 5], [hero("t"), 6, 5]);
    let s: State = { encounter: e, turn: startTurn(e, id("a")) };
    s = run(s, { kind: "beginCapability", source: { kind: "standard", action: "attack" } });
    s = run(s, { kind: "chooseOption", key: getTurnOptions(s.encounter, s.turn).executionOptions[0]?.key ?? "" }, scriptedDice([2]));
    s = run(s, { kind: "endTurn" });
    expect(rec(s.encounter, "a").state.marks).toHaveLength(1);
    const again = run({ encounter: s.encounter, turn: startTurn(s.encounter, id("a")) }, { kind: "endTurn" });
    expect(rec(again.encounter, "a").state.marks).toEqual([]);
  });
});

describe("Daño masivo (regla casera, guía 2014)", () => {
  it("tabla de shock (1d10)", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 10].map(shockFromRoll)).toEqual([
      "dropToZero",
      "dropToZeroStable",
      "dropToZeroStable",
      "stunned",
      "stunned",
      "noReactionsAndDisadvantage",
      "noReactionsAndDisadvantage",
      "noReactions",
      "noReactions",
    ]);
  });

  it("un monstruo que recibe la mitad de sus PG en un golpe hace la salvación; si falla, shock", () => {
    const e = scene({ massiveDamage: true }, [monster("a", 20), 5, 5], [monster("t", 20), 6, 5, "players"]);
    let s: State = { encounter: e, turn: startTurn(e, id("a")) };
    s = run(s, { kind: "beginCapability", source: { kind: "standard", action: "attack" } });
    const key = getTurnOptions(s.encounter, s.turn).executionOptions.find((o) => o.choice.kind === "attack" && o.choice.attackId === "scimitar")?.key ?? "";
    // Crítico (20): 2d6 = 6+6, +2 = 14 >= 10 → CON CD 15: 5 + 0 = 5 falla → d10 = 4: Aturdido.
    s = run(s, { kind: "chooseOption", key }, scriptedDice([20, 6, 6, 5, 4]));
    const t = rec(s.encounter, "t");
    expect(t.state.currentHitPoints).toBe(6);
    expect(t.state.conditions).toEqual([{ condition: "stunned", sourceId: null, duration: { kind: "indefinite" }, turnEndsRemaining: 1 }]);
    expect(s.turn.log.at(-1)).toEqual({ kind: "massiveDamage", creatureId: "t", saveTotal: 5, saveSucceeded: false, shockRoll: 4, shock: "stunned" });
    // Termina al final de su siguiente turno.
    const ended = run({ encounter: s.encounter, turn: startTurn(s.encounter, id("t")) }, { kind: "endTurn" });
    expect(rec(ended.encounter, "t").state.conditions).toEqual([]);
  });

  it("un personaje: la salvación queda pendiente; no se puede terminar el turno hasta anotarla", () => {
    const e = scene({ massiveDamage: true }, [monster("a"), 5, 5], [hero("pc", 20), 6, 5]);
    let s: State = { encounter: e, turn: startTurn(e, id("a")) };
    s = run(s, { kind: "beginCapability", source: { kind: "standard", action: "attack" } });
    const key = getTurnOptions(s.encounter, s.turn).executionOptions.find((o) => o.choice.kind === "attack" && o.choice.attackId === "scimitar")?.key ?? "";
    s = run(s, { kind: "chooseOption", key }, scriptedDice([20, 6, 6]));
    expect(s.turn.pendingSaves).toEqual([{ kind: "massiveDamage", creatureId: "pc" }]);
    expect(applyTurnCommand(s.encounter, s.turn, { kind: "endTurn" }, scriptedDice([]))).toEqual({ ok: false, reasonCode: "savesPending" });
    // Falla (12 < 15) → la app tira el shock: 8 → sin reacciones.
    s = run(s, { kind: "resolvePendingSave", creatureId: id("pc"), playerSave: { total: 12 } }, scriptedDice([8]));
    expect(rec(s.encounter, "pc").state.shock).toEqual({ kind: "noReactions", turnEndsRemaining: 1 });
    expect(s.turn.pendingSaves).toEqual([]);
  });

  it("0 PG y estable: el personaje queda Estable; el monstruo muere (reglas 2024)", () => {
    const e = scene({ massiveDamage: true }, [monster("m", 20), 1, 1], [hero("pc", 20), 3, 3]);
    const pc = resolveMassiveDamage(e, id("pc"), scriptedDice([2]), { outcome: "failure" }, false);
    if ("error" in pc) throw new Error(pc.error);
    expect(rec(pc.encounter, "pc").state).toMatchObject({ currentHitPoints: 0, lifeState: "stable" });
    const m = resolveMassiveDamage(e, id("m"), scriptedDice([1, 3]), null, false);
    if ("error" in m) throw new Error(m.error);
    expect(rec(m.encounter, "m").state.lifeState).toBe("dead");
  });
});

describe("Moral (regla casera, guía 2014)", () => {
  it("al bajar de la mitad de PG por primera vez: salvación de SAB 10; si falla, huye", () => {
    let e = scene({ morale: true }, [monster("m", 20), 5, 5], [hero("pc"), 9, 5]);
    e = dealDamage(e, id("m"), 11).encounter;
    const result = runStateMoraleChecks(e, scriptedDice([5])); // 5 - 1 = 4 < 10
    expect(result.checks).toEqual([
      { trigger: "belowHalfHitPoints", saverId: "m", affected: ["m"], d20Rolls: [5], total: 4, success: false },
    ]);
    expect(rec(result.encounter, "m").state.morale.fleeing).toBe(true);
    // Solo la primera vez.
    expect(runStateMoraleChecks(result.encounter, scriptedDice([])).checks).toEqual([]);
  });

  it("quien huye no ataca, solo se aleja (Correr, Destrabarse), y puede rendirse", () => {
    let e = scene({ morale: true }, [monster("m", 20), 5, 5], [hero("pc"), 6, 5]);
    e = dealDamage(e, id("m"), 11).encounter;
    e = runStateMoraleChecks(e, scriptedDice([2])).encounter;
    const s: State = { encounter: e, turn: startTurn(e, id("m")) };
    expect(getTurnOptions(s.encounter, s.turn).capabilities).toEqual([
      { kind: "standard", action: "dash" },
      { kind: "standard", action: "disengage" },
      { kind: "bonusAction", bonusActionId: "nimble-escape" },
    ]);
    // Pasar a la casilla del enemigo (se puede atravesar) lo acercaría: no se permite.
    expect(applyTurnCommand(s.encounter, s.turn, { kind: "move", path: [at(6, 5)] }, scriptedDice([]))).toEqual({
      ok: false,
      reasonCode: "movementTowardFearSource",
    });
    const surrendered = run(s, { kind: "surrender" });
    expect(getTurnOptions(surrendered.encounter, surrendered.turn)).toMatchObject({ canMove: false, capabilities: [] });
    expect(rec(resumeFighting(surrendered.encounter, id("m")), "m").state.morale).toMatchObject({ fleeing: false, surrendered: false });
  });

  it("grupo: si cae el líder, salva el de mayor Carisma por todos", () => {
    let e = scene({ morale: true }, [monster("boss"), 1, 1], [{ ...monster("lieutenant"), abilities: { ...goblin.abilities, cha: 14 } }, 3, 1], [monster("grunt"), 5, 1], [hero("pc"), 9, 9]);
    const started = startCombat(e, { boss: 15, lieutenant: 12, grunt: 10, pc: 8 }, [], { leaders: { monsters: id("boss") } });
    if (!started.ok) throw new Error(started.reason);
    e = dealDamage(started.encounter, id("boss"), 20).encounter;
    const result = runStateMoraleChecks(e, scriptedDice([3]));
    expect(result.checks[0]).toMatchObject({ trigger: "leaderDown", saverId: "lieutenant", affected: ["grunt", "lieutenant"], success: false });
  });

  it("grupo reducido a la mitad sin que caiga ningún rival", () => {
    let e = scene({ morale: true }, [monster("a"), 1, 1], [monster("b"), 3, 1], [hero("pc"), 9, 9]);
    const started = startCombat(e, { a: 15, b: 12, pc: 8 });
    if (!started.ok) throw new Error(started.reason);
    e = dealDamage(started.encounter, id("b"), 20).encounter;
    const result = runStateMoraleChecks(e, scriptedDice([15]));
    expect(result.checks[0]).toMatchObject({ trigger: "groupHalved", saverId: "a", success: true });
    expect(rec(result.encounter, "a").state.morale.fleeing).toBe(false);
  });

  it("sorpresa: individual, o del grupo si todos están sorprendidos; oposición abrumadora = Desventaja", () => {
    let e = scene({ morale: true }, [monster("a"), 1, 1], [monster("b"), 3, 1], [hero("pc"), 9, 9]);
    const started = startCombat(e, { a: 15, b: 12, pc: 8 }, [], { overwhelming: { monsters: "disadvantage" } });
    if (!started.ok) throw new Error(started.reason);
    const all = runSurpriseMoraleChecks(started.encounter, [id("a"), id("b")], scriptedDice([18, 4]));
    expect(all.checks).toEqual([{ trigger: "groupSurprised", saverId: "a", affected: ["a", "b"], d20Rolls: [18, 4], total: 3, success: false }]);
    const one = runSurpriseMoraleChecks(started.encounter, [id("b")], scriptedDice([19, 19]));
    expect(one.checks).toMatchObject([{ trigger: "surprised", saverId: "b", success: true }]);
  });

  it("al inicio de su turno, si no puede dañar a ningún enemigo, hace la salvación", () => {
    // Goblin: arco 320 pies; el enemigo está fuera de 30 + 320 pies.
    const big = { ...emptyEncounter(100, 100), tableRules: { ...CORE_TEST_TABLE_RULES, morale: true } };
    let e = engine.addCombatant(big, monster("m"), { column: 0, row: 0 });
    e = engine.addCombatant(e, hero("pc"), { column: 99, row: 99 });
    const started = startCombat(e, { m: 15, pc: 8 });
    if (!started.ok) throw new Error(started.reason);
    const turn = advanceTurn(started.encounter, null, scriptedDice([2]));
    expect(turn.ok && turn.moraleChecks).toMatchObject([{ trigger: "cannotHarmOpponents", saverId: "m", success: false }]);
  });
});
