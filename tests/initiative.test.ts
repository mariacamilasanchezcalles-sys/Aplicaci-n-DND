import { describe, expect, it } from "vitest";
import { asCreatureId } from "../src/models";
import type { CombatantDefinition, Encounter } from "../src/models";
import {
  advanceTurn,
  applyCondition,
  applyTurnCommand,
  currentCreature,
  dealDamage,
  hasCondition,
  rollMonsterInitiative,
  startCombat,
} from "../src/rules";
import type { TurnState } from "../src/rules";
import { goblin } from "../src/scenarios/provisionalScenario";
import { emptyEncounter, engine, scriptedDice } from "./helpers";

const id = asCreatureId;
const monster = (name: string): CombatantDefinition => ({ ...goblin, id: id(name), label: name });
const character = (name: string): CombatantDefinition => ({
  kind: "playerCharacter",
  registration: "simplified",
  testRole: "melee-fighter",
  id: id(name),
  label: name,
  size: "medium",
  stats: { maxHitPoints: 20, armorClass: 14, speedFeet: 30 },
  attacks: [],
  bonusActions: [],
  traits: [],
});

function scene(): Encounter {
  let e = emptyEncounter(20, 20);
  e = engine.addCombatant(e, monster("g1"), { column: 1, row: 1 });
  e = engine.addCombatant(e, monster("g2"), { column: 3, row: 1 });
  e = engine.addCombatant(e, character("cata"), { column: 10, row: 10 });
  return e;
}

describe("iniciativa (SRD 5.2.1)", () => {
  it("un grupo de monstruos idénticos comparte una tirada (+2 de iniciativa del Goblin)", () => {
    const result = rollMonsterInitiative(scene(), [[id("g1"), id("g2")]], scriptedDice([13]));
    expect(result).toEqual({
      ok: true,
      totals: { g1: 15, g2: 15 },
      rolls: [{ creatureIds: ["g1", "g2"], d20Rolls: [13], bonus: 2, total: 15 }],
    });
  });

  it("sorprendido: Desventaja (dos d20, el menor)", () => {
    const result = rollMonsterInitiative(scene(), [[id("g1")]], scriptedDice([18, 4]), [id("g1")]);
    expect(result.ok && result.totals).toEqual({ g1: 6 });
  });

  it("los personajes no tiran con dados virtuales", () => {
    expect(rollMonsterInitiative(scene(), [[id("cata")]], scriptedDice([]))).toEqual({
      ok: false,
      reason: "notAMonster",
      creatureIds: ["cata"],
    });
  });

  it("faltan totales o hay empates sin decidir: no empieza el combate", () => {
    expect(startCombat(scene(), { g1: 15, g2: 12 })).toEqual({ ok: false, reason: "missingInitiative", creatureIds: ["cata"] });
    expect(startCombat(scene(), { g1: 15, g2: 15, cata: 12 })).toEqual({ ok: false, reason: "tiesUndecided", ties: [["g1", "g2"]] });
    const started = startCombat(scene(), { g1: 15, g2: 15, cata: 17 }, [id("g2"), id("g1")]);
    expect(started.ok && started.encounter.initiativeOrder).toEqual(["cata", "g2", "g1"]);
  });

  it("los turnos siguen el orden; al dar la vuelta empieza otro asalto; los monstruos muertos se saltan", () => {
    const started = startCombat(scene(), { g1: 10, g2: 5, cata: 17 });
    if (!started.ok) throw new Error(started.reason);
    let encounter = started.encounter;
    let turn: TurnState | null = null;
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      const advanced = advanceTurn(encounter, turn, scriptedDice([]));
      if (!advanced.ok) throw new Error(advanced.reason);
      seen.push(`${advanced.encounter.round}:${currentCreature(advanced.encounter)}`);
      const ended = applyTurnCommand(advanced.encounter, advanced.turn, { kind: "endTurn" }, scriptedDice([]));
      if (!ended.ok) throw new Error(ended.reasonCode);
      encounter = ended.encounter;
      turn = ended.turn;
      if (i === 1) encounter = dealDamage(encounter, id("g2"), 10).encounter; // muere g2
    }
    expect(seen).toEqual(["1:cata", "1:g1", "2:cata", "2:g1"]);
  });

  it("no se pasa de turno sin terminar el actual", () => {
    const started = startCombat(scene(), { g1: 10, g2: 5, cata: 17 });
    if (!started.ok) throw new Error(started.reason);
    const first = advanceTurn(started.encounter, null, scriptedDice([]));
    if (!first.ok) throw new Error(first.reason);
    expect(advanceTurn(first.encounter, first.turn, scriptedDice([]))).toEqual({ ok: false, reason: "turnNotEnded" });
  });

  it("al inicio del turno se recupera la reacción y termina Esquivar; los asaltos de una condición se descuentan", () => {
    const started = startCombat(scene(), { g1: 10, g2: 5, cata: 17 });
    if (!started.ok) throw new Error(started.reason);
    // g1 sin reacción y esquivando; cata Asustada por g1 durante 1 asalto.
    let e = started.encounter;
    const g1 = e.combatants["g1"]!;
    e = { ...e, combatants: { ...e.combatants, g1: { ...g1, state: { ...g1.state, reactionAvailable: false, dodging: true } } } };
    const frightened = applyCondition(e, id("cata"), "frightened", id("g1"), { kind: "rounds", count: 1 });
    if (!frightened.applied) throw new Error(frightened.reason);
    e = frightened.encounter;

    let advanced = advanceTurn(e, null, scriptedDice([])); // turno de cata
    if (!advanced.ok) throw new Error(advanced.reason);
    expect(hasCondition(advanced.encounter.combatants["cata"]!, "frightened")).toBe(true);
    const ended = applyTurnCommand(advanced.encounter, advanced.turn, { kind: "endTurn" }, scriptedDice([]));
    if (!ended.ok) throw new Error(ended.reasonCode);
    advanced = advanceTurn(ended.encounter, ended.turn, scriptedDice([])); // turno de g1
    if (!advanced.ok) throw new Error(advanced.reason);
    expect(advanced.encounter.combatants["g1"]?.state).toMatchObject({ reactionAvailable: true, dodging: false });
    // 1 asalto desde que g1 la asustó: termina al inicio del siguiente turno de g1.
    expect(hasCondition(advanced.encounter.combatants["cata"]!, "frightened")).toBe(false);
  });
});
