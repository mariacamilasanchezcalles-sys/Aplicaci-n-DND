import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { asCreatureId } from "../src/models";
import type { CombatantDefinition, Encounter } from "../src/models";
import {
  applyTurnCommand,
  getTurnOptions,
  previewEffect,
  resolveEffect,
  resourceRemaining,
  saveBonusOf,
  startTurn,
} from "../src/rules";
import type { EffectOperation, TurnState } from "../src/rules";
import { goblin } from "../src/scenarios/provisionalScenario";
import { combatantFromSheet, loadCreatureSheet } from "../src/sheets";
import { emptyEncounter, engine, scriptedDice } from "./helpers";

const BRUTE = asCreatureId("brute");

function fromFixture(file: string, id: string): CombatantDefinition {
  const loaded = loadCreatureSheet(readFileSync(join(__dirname, "fixtures/sheets", file), "utf8"));
  if (!loaded.valid) throw new Error(JSON.stringify(loaded.errors));
  return combatantFromSheet(loaded.sheet, { creatureId: id, personality: "pragmatic" }).definition;
}

/** Goblin con otro id y 30 PG (DES 15 → salvación de Destreza +2). */
const goblinCopy = (id: string): CombatantDefinition => ({
  ...goblin,
  id: asCreatureId(id),
  stats: { ...goblin.stats, maxHitPoints: 30 },
});

/** Personaje jugador con PG registrados (sus salvaciones las tira el jugador). */
const playerCharacter = (id: string): CombatantDefinition => ({
  kind: "playerCharacter",
  registration: "simplified",
  testRole: "melee-fighter",
  id: asCreatureId(id),
  label: id,
  size: "medium",
  stats: { maxHitPoints: 30, armorClass: 16 },
  attacks: [],
  bonusActions: [],
  traits: [],
});

/**
 * El Bruto (Grande) ocupa [2,4] x [2,4]. Su aliento es un Cono de 15 pies; desde
 * el punto medio del borde este (4, 3) hacia el este cubre (5,2), (5,3), (6,2) y (6,3).
 */
function breathScene(): Encounter {
  let encounter = engine.addCombatant(emptyEncounter(20, 20), fromFixture("test-brute.json", "brute"), { column: 2, row: 2 });
  encounter = engine.addCombatant(encounter, goblinCopy("g1"), { column: 5, row: 3 });
  encounter = engine.addCombatant(encounter, goblinCopy("g2"), { column: 6, row: 2 });
  encounter = engine.addCombatant(encounter, playerCharacter("pc"), { column: 6, row: 3 });
  encounter = engine.addCombatant(encounter, goblinCopy("far"), { column: 12, row: 12 });
  return encounter;
}

const conePlacement = { origin: { column: 4, row: 3 }, direction: "e" as const };

function beginBreath(encounter: Encounter): { encounter: Encounter; turn: TurnState; key: string } {
  const begun = applyTurnCommand(
    encounter,
    startTurn(encounter, BRUTE),
    { kind: "beginCapability", source: { kind: "sheet", capabilityId: "breath" } },
    scriptedDice([]),
  );
  if (!begun.ok) throw new Error(begun.reasonCode);
  const options = getTurnOptions(begun.encounter, begun.turn).executionOptions;
  expect(options.map((o) => o.choice.kind)).toEqual(["effect"]);
  return { encounter: begun.encounter, turn: begun.turn, key: options[0]?.key ?? "" };
}

describe("efecto en área con salvación: el aliento del Bruto (ficha de prueba)", () => {
  it("vista previa: afectados y a qué jugadores hay que pedir la salvación", () => {
    const state = beginBreath(breathScene());
    expect(resourceRemaining(state.encounter, BRUTE, "fire-breath")).toBe(0);
    expect(previewEffect(state.encounter, state.turn, state.key, { placement: conePlacement })).toEqual({
      ok: true,
      affected: ["g1", "g2", "pc"],
      playerSavesNeeded: ["pc"],
    });
  });

  it("sin la tirada del jugador no se resuelve ni se tira ningún dado", () => {
    const state = beginBreath(breathScene());
    const result = applyTurnCommand(state.encounter, state.turn, { kind: "chooseOption", key: state.key, effectInput: { placement: conePlacement } }, scriptedDice([]));
    expect(result).toEqual({ ok: false, reasonCode: "playerSavesRequired", creatureIds: ["pc"] });
  });

  it("salvaciones de los monstruos con dados virtuales, la del jugador anotada, daño tirado una vez", () => {
    const state = beginBreath(breathScene());
    // g1: 10 + 2 = 12 < 13 falla; g2: 11 + 2 = 13 supera. Daño 4d6 = 6+6+6+6 = 24 una sola vez.
    const dice = scriptedDice([10, 11, 6, 6, 6, 6]);
    const result = applyTurnCommand(
      state.encounter,
      state.turn,
      { kind: "chooseOption", key: state.key, effectInput: { placement: conePlacement, playerSaves: { pc: { total: 15 } } } },
      dice,
    );
    if (!result.ok) throw new Error(result.reasonCode);
    expect(dice.remaining()).toBe(0);
    const hp = (id: string) => result.encounter.combatants[id]?.state.currentHitPoints;
    expect(hp("g1")).toBe(30 - 24); // falla: daño completo
    expect(hp("g2")).toBe(30 - 12); // supera: la mitad
    expect(hp("pc")).toBe(30 - 12); // el jugador sacó 15 >= 13: la mitad
    expect(hp("far")).toBe(30); // fuera del cono
    const entry = result.turn.log.find((e) => e.kind === "effectResolved");
    expect(entry).toMatchObject({
      affected: ["g1", "g2", "pc"],
      rolls: [{ kind: "damage", damageType: "fire", dice: [6, 6, 6, 6], bonus: 0, total: 24 }],
      targets: [
        { targetId: "g1", save: { source: "virtual", d20: 10, bonus: 2, total: 12, dc: 13, success: false } },
        { targetId: "g2", save: { source: "virtual", d20: 11, bonus: 2, total: 13, dc: 13, success: true } },
        { targetId: "pc", save: { source: "player", total: 15, dc: 13, success: true } },
      ],
    });
    expect(result.turn.execution).toBeNull();
  });

  it("colocación no válida: el origen tiene que estar en el borde del Bruto", () => {
    const state = beginBreath(breathScene());
    const result = applyTurnCommand(
      state.encounter,
      state.turn,
      { kind: "chooseOption", key: state.key, effectInput: { placement: { origin: { column: 8, row: 8 }, direction: "e" } } },
      scriptedDice([]),
    );
    expect(result).toEqual({ ok: false, reasonCode: "invalidAreaPlacement", areaReason: "originOutOfRange" });
  });

  it("un monstruo sin características registradas no puede hacer la salvación: no se consume nada", () => {
    const noAbilities: CombatantDefinition = { ...goblinCopy("g1"), abilities: undefined };
    let encounter = engine.addCombatant(emptyEncounter(20, 20), fromFixture("test-brute.json", "brute"), { column: 2, row: 2 });
    encounter = engine.addCombatant(encounter, noAbilities, { column: 5, row: 3 });
    const state = beginBreath(encounter);
    const result = applyTurnCommand(state.encounter, state.turn, { kind: "chooseOption", key: state.key, effectInput: { placement: conePlacement } }, scriptedDice([]));
    expect(result).toEqual({ ok: false, reasonCode: "saveBonusUnknown", creatureIds: ["g1"] });
  });
});

describe("resolveEffect: reglas de salvación y daño", () => {
  const encounter = (): Encounter => {
    let e = engine.addCombatant(emptyEncounter(20, 20), goblinCopy("a"), { column: 1, row: 1 });
    e = engine.addCombatant(e, { ...goblinCopy("b"), damageResistances: ["fire"] }, { column: 3, row: 1 });
    return e;
  };
  const fireball = (onSuccess: "negates" | "halfDamage"): EffectOperation => ({
    op: "effect",
    targeting: { kind: "area", shape: "sphere", sizeFeet: 20, rangeFeet: 150 },
    save: { ability: "dex", dc: 15, onSuccess },
    effects: [{ kind: "damage", dice: { count: 2, sides: 6 }, bonus: 1, damageType: "fire" }],
  });

  it("el 20 natural no supera automáticamente una salvación (solo en ataques)", () => {
    // a: 20 + 2 = 22 supera; b: 1 + 2 = 3 falla (no es fallo automático: simplemente no llega).
    const result = resolveEffect(encounter(), fireball("negates"), [asCreatureId("a"), asCreatureId("b")], scriptedDice([20, 1, 3, 4]));
    if (!result.ok) throw new Error(result.reason);
    // negates: "a" no recibe nada; "b" recibe 3 + 4 + 1 = 8, con Resistencia → 4.
    expect(result.targets.map((t) => t.damageApplied)).toEqual([0, 4]);
  });

  it("mitad antes que Resistencia (orden oficial)", () => {
    // Ambos superan; 2d6+1 = 6+6+1 = 13 → mitad 6; "b" con Resistencia → 3.
    const result = resolveEffect(encounter(), fireball("halfDamage"), [asCreatureId("a"), asCreatureId("b")], scriptedDice([19, 19, 6, 6]));
    if (!result.ok) throw new Error(result.reason);
    expect(result.targets.map((t) => t.damageApplied)).toEqual([6, 3]);
  });

  it("si todos anulan el efecto no se tiran los dados de daño", () => {
    const dice = scriptedDice([19, 19]);
    const result = resolveEffect(encounter(), fireball("negates"), [asCreatureId("a"), asCreatureId("b")], dice);
    expect(result.ok && result.rolls).toEqual([]);
    expect(dice.remaining()).toBe(0);
  });

  it("modificador de salvación: explícito o floor((puntuación - 10) / 2)", () => {
    expect(saveBonusOf(goblin, "dex")).toBe(2);
    expect(saveBonusOf(goblin, "str")).toBe(-1);
    expect(saveBonusOf({ ...goblin, savingThrows: { dex: 5 } }, "dex")).toBe(5);
    expect(saveBonusOf({ ...goblin, abilities: undefined }, "dex")).toBeNull();
  });
});

describe("efecto con objetivos elegidos: curación", () => {
  it("cura sin superar los PG máximos y exige un objetivo válido al alcance", () => {
    const skirmisher = fromFixture("test-skirmisher.json", "skirmisher");
    let encounter = engine.addCombatant(emptyEncounter(20, 20), skirmisher, { column: 1, row: 1 });
    encounter = engine.addCombatant(encounter, goblinCopy("ally"), { column: 3, row: 1 });
    encounter = engine.addCombatant(encounter, goblinCopy("distant"), { column: 19, row: 19 });
    const hurt = { ...encounter.combatants["ally"]!, state: { ...encounter.combatants["ally"]!.state, currentHitPoints: 27 } };
    encounter = { ...encounter, combatants: { ...encounter.combatants, ally: hurt } };

    const begun = applyTurnCommand(encounter, startTurn(encounter, asCreatureId("skirmisher")), { kind: "beginCapability", source: { kind: "sheet", capabilityId: "mend" } }, scriptedDice([]));
    if (!begun.ok) throw new Error(begun.reasonCode);
    expect(begun.turn.bonusActionUsed).toBe(true);
    const key = getTurnOptions(begun.encounter, begun.turn).executionOptions[0]?.key ?? "";

    const tooFar = applyTurnCommand(begun.encounter, begun.turn, { kind: "chooseOption", key, effectInput: { targetIds: [asCreatureId("distant")] } }, scriptedDice([]));
    expect(tooFar).toEqual({ ok: false, reasonCode: "invalidEffectTargets" });

    // 1d4 + 2 = 4 + 2 = 6, pero solo le faltan 3 PG.
    const healed = applyTurnCommand(begun.encounter, begun.turn, { kind: "chooseOption", key, effectInput: { targetIds: [asCreatureId("ally")] } }, scriptedDice([4]));
    if (!healed.ok) throw new Error(healed.reasonCode);
    expect(healed.encounter.combatants["ally"]?.state.currentHitPoints).toBe(30);
    expect(healed.turn.log.find((e) => e.kind === "effectResolved")).toMatchObject({ targets: [{ targetId: "ally", healed: 3 }] });
  });
});
