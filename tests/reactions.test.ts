import { describe, expect, it } from "vitest";
import { asAttackId, asCreatureId } from "../src/models";
import type { CombatantDefinition, Encounter, GridPosition } from "../src/models";
import { applyCondition, applyTurnCommand, attackConditions, getTurnOptions, startTurn } from "../src/rules";
import type { TurnCommand, TurnState } from "../src/rules";
import { goblin } from "../src/scenarios/provisionalScenario";
import { emptyEncounter, engine, scriptedDice } from "./helpers";

const id = asCreatureId;
const at = (column: number, row: number): GridPosition => ({ column, row });
const monster = (name: string, hp = 20): CombatantDefinition => ({
  ...goblin,
  id: id(name),
  label: name,
  stats: { ...goblin.stats, maxHitPoints: hp },
});
const fighter = (name: string): CombatantDefinition => ({
  kind: "playerCharacter",
  registration: "simplified",
  testRole: "melee-fighter",
  id: id(name),
  label: name,
  size: "medium",
  stats: { maxHitPoints: 20, armorClass: 16, speedFeet: 30 },
  attacks: [{ id: asAttackId("longsword"), label: "Espada larga", mode: "melee", rangeFeet: { normal: 5 }, toHitBonus: 5, damage: [] }],
  bonusActions: [],
  traits: [],
});

type State = { encounter: Encounter; turn: TurnState };
function run(state: State, command: TurnCommand, dice = scriptedDice([])): State {
  const result = applyTurnCommand(state.encounter, state.turn, command, dice);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return { encounter: result.encounter, turn: result.turn };
}
/** "guard" se coloca en el bando de los jugadores para que sea enemigo de los monstruos. */
function scene(...entries: readonly (readonly [CombatantDefinition, number, number])[]): Encounter {
  return entries.reduce(
    (e, [d, c, r]) => engine.addCombatant(e, d, { column: c, row: r }, d.id === "guard" ? { side: "players" } : {}),
    emptyEncounter(20, 20),
  );
}
const start = (e: Encounter, who: string): State => ({ encounter: e, turn: startTurn(e, id(who)) });

describe("ataques de oportunidad (REGLA OFICIAL VERIFICADA)", () => {
  it("salir del alcance detiene el movimiento justo antes; el monstruo ataca y el movimiento sigue", () => {
    let s = start(scene([monster("mover"), 5, 5], [monster("guard"), 6, 5]), "mover");
    s = run(s, { kind: "move", path: [at(4, 5), at(3, 5)] });
    // Sigue en (5, 5): el paso a (4, 5) le saca del alcance de "guard".
    expect(s.encounter.combatants["mover"]?.state.position).toEqual(at(5, 5));
    expect(s.turn.pendingReactions).toEqual([
      { kind: "opportunityAttack", reactorId: "guard", moverId: "mover", attackIds: ["scimitar"], viaMark: false },
    ]);
    // Mientras tanto no se acepta otra cosa.
    expect(applyTurnCommand(s.encounter, s.turn, { kind: "endTurn" }, scriptedDice([]))).toEqual({ ok: false, reasonCode: "reactionsPending" });

    // Impacta (15 + 4 >= 15): 1d6 = 3 → 5 de daño. Después termina el movimiento.
    s = run(s, { kind: "resolveReaction", reactorId: id("guard"), take: true }, scriptedDice([15, 3]));
    expect(s.encounter.combatants["mover"]?.state).toMatchObject({ currentHitPoints: 15, position: at(3, 5) });
    expect(s.encounter.combatants["guard"]?.state.reactionAvailable).toBe(false);
    expect(s.turn.log.map((x) => x.kind)).toEqual(["opportunityAttack", "moved"]);
    expect(s.turn.movement.spentFeet).toBe(10);
  });

  it("una sola reacción: un segundo alejamiento ya no provoca nada", () => {
    let s = start(scene([monster("mover"), 5, 5], [monster("guard"), 6, 5]), "mover");
    s = run(s, { kind: "move", path: [at(4, 5)] });
    s = run(s, { kind: "resolveReaction", reactorId: id("guard"), take: true }, scriptedDice([2]));
    s = run(s, { kind: "move", path: [at(5, 5)] });
    s = run(s, { kind: "move", path: [at(4, 5)] });
    expect(s.turn.pendingReactions).toEqual([]);
  });

  it("Destrabarse evita los ataques de oportunidad", () => {
    let s = start(scene([monster("mover"), 5, 5], [monster("guard"), 6, 5]), "mover");
    s = run(s, { kind: "beginCapability", source: { kind: "bonusAction", bonusActionId: "nimble-escape" } });
    const key = getTurnOptions(s.encounter, s.turn).executionOptions[0]?.key ?? "";
    s = run(s, { kind: "chooseOption", key });
    s = run(s, { kind: "move", path: [at(4, 5), at(3, 5)] });
    expect(s.turn.pendingReactions).toEqual([]);
  });

  it("quien no ve al que se mueve (Cegado) o está Incapacitado no reacciona", () => {
    const base = scene([monster("mover"), 5, 5], [monster("guard"), 6, 5]);
    for (const condition of ["blinded", "stunned"] as const) {
      const applied = applyCondition(base, id("guard"), condition, null, { kind: "indefinite" });
      if (!applied.applied) throw new Error(applied.reason);
      const s = run(start(applied.encounter, "mover"), { kind: "move", path: [at(4, 5)] });
      expect(s.turn.pendingReactions).toEqual([]);
    }
  });

  it("si el ataque de oportunidad deja al que se mueve a 0 PG, el movimiento se detiene", () => {
    let s = start(scene([monster("mover", 3), 5, 5], [monster("guard"), 6, 5]), "mover");
    s = run(s, { kind: "move", path: [at(4, 5), at(3, 5)] });
    s = run(s, { kind: "resolveReaction", reactorId: id("guard"), take: true }, scriptedDice([15, 6]));
    expect(s.encounter.combatants["mover"]?.state).toMatchObject({ lifeState: "dead", position: at(5, 5) });
    expect(s.turn.log.at(-1)).toEqual({ kind: "movementStopped", remainingPath: [at(4, 5), at(3, 5)] });
  });

  it("un personaje jugador reacciona con su tirada física y el daño que anota", () => {
    let s = start(scene([monster("mover"), 5, 5], [fighter("cata"), 6, 5]), "mover");
    s = run(s, { kind: "move", path: [at(4, 5)] });
    expect(applyTurnCommand(s.encounter, s.turn, { kind: "resolveReaction", reactorId: id("cata"), take: true }, scriptedDice([]))).toEqual({
      ok: false,
      reasonCode: "playerAttackRequired",
    });
    expect(
      applyTurnCommand(s.encounter, s.turn, { kind: "resolveReaction", reactorId: id("cata"), take: true, attackInput: { playerRoll: { natural: 12, total: 17 } } }, scriptedDice([])),
    ).toEqual({ ok: false, reasonCode: "playerDamageRequired" });
    s = run(s, {
      kind: "resolveReaction",
      reactorId: id("cata"),
      take: true,
      attackInput: { playerRoll: { natural: 12, total: 17, damage: [{ type: "slashing", amount: 9 }] } },
    });
    expect(s.encounter.combatants["mover"]?.state.currentHitPoints).toBe(11);
    expect(s.turn.log[0]).toMatchObject({ kind: "opportunityAttack", attack: { resolution: { outcome: "hit", naturalRoll: 12 } } });
  });
});

describe("ataques de personajes jugadores en su turno (dados físicos)", () => {
  it("el jugador dice su tirada; la app decide (20 crítico, 1 falla, total >= CA)", () => {
    const e = scene([fighter("cata"), 5, 5], [monster("goblin", 30), 6, 5]);
    const begun = run(start(e, "cata"), { kind: "beginCapability", source: { kind: "standard", action: "attack" } });
    const key = getTurnOptions(begun.encounter, begun.turn).executionOptions[0]?.key ?? "";
    const attack = (natural: number, total: number) =>
      applyTurnCommand(begun.encounter, begun.turn, {
        kind: "chooseOption",
        key,
        attackInput: { playerRoll: { natural, total, damage: [{ type: "slashing", amount: 8 }] } },
      }, scriptedDice([]));
    const miss = attack(1, 30);
    const crit = attack(20, 5);
    const lowHit = attack(10, 15);
    expect(miss.ok && miss.turn.log.find((x) => x.kind === "attackResolved")).toMatchObject({ resolution: { outcome: "miss" }, damageApplied: 0 });
    expect(crit.ok && crit.turn.log.find((x) => x.kind === "attackResolved")).toMatchObject({ resolution: { outcome: "criticalHit" }, damageApplied: 8 });
    expect(lowHit.ok && lowHit.turn.log.find((x) => x.kind === "attackResolved")).toMatchObject({ resolution: { outcome: "hit" } });
  });
});

describe("bandos", () => {
  it("un aliado que sale del alcance no provoca ataque de oportunidad", () => {
    const e = [monster("mover"), monster("friend")].reduce((acc, d, i) => engine.addCombatant(acc, d, { column: 5 + i, row: 5 }), emptyEncounter(20, 20));
    const s = run(start(e, "mover"), { kind: "move", path: [at(4, 5)] });
    expect(s.turn.pendingReactions).toEqual([]);
  });

  it("ataque a distancia con un enemigo a 5 pies que lo ve: Desventaja (regla verificada)", () => {
    const e = scene([monster("archer"), 5, 5], [monster("guard"), 6, 5], [monster("far"), 15, 5]);
    const a = e.combatants["archer"]!;
    expect(attackConditions(e, a, e.combatants["far"]!, 50, false, "ranged").mode).toBe("disadvantage");
    // Un aliado al lado no molesta.
    const allies = [monster("archer"), monster("friend"), monster("far")].reduce(
      (acc, d, i) => engine.addCombatant(acc, d, { column: [5, 6, 15][i]!, row: 5 }),
      emptyEncounter(20, 20),
    );
    expect(attackConditions(allies, allies.combatants["archer"]!, allies.combatants["far"]!, 50, false, "ranged").mode).toBe("normal");
    // Si el enemigo adyacente está Incapacitado, tampoco.
    const stunned = applyCondition(e, id("guard"), "stunned", null, { kind: "indefinite" });
    if (!stunned.applied) throw new Error(stunned.reason);
    expect(attackConditions(stunned.encounter, stunned.encounter.combatants["archer"]!, stunned.encounter.combatants["far"]!, 50, false, "ranged").mode).toBe("normal");
  });
});

describe("Esquivar persiste hasta el inicio del siguiente turno", () => {
  it("los ataques contra quien esquiva tienen Desventaja si ve al atacante", () => {
    let s = start(scene([monster("dodger"), 5, 5], [monster("attacker"), 6, 5]), "dodger");
    s = run(s, { kind: "beginCapability", source: { kind: "standard", action: "dodge" } });
    const key = getTurnOptions(s.encounter, s.turn).executionOptions[0]?.key ?? "";
    s = run(s, { kind: "chooseOption", key });
    s = run(s, { kind: "endTurn" });
    const e = s.encounter;
    expect(e.combatants["dodger"]?.state.dodging).toBe(true);
    expect(attackConditions(e, e.combatants["attacker"]!, e.combatants["dodger"]!, 5, false).mode).toBe("disadvantage");
  });
});
