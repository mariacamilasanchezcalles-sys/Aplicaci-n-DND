import { describe, expect, it } from "vitest";
import { asAttackId, asCreatureId } from "../src/models";
import type { CombatantDefinition, Encounter } from "../src/models";
import { buildKnowledgeView, observeLogEntries, observeState } from "../src/perception";
import type { KnownOther } from "../src/perception";
import { applyCondition, applyTurnCommand, getTurnOptions, startTurn } from "../src/rules";
import type { TurnCommand, TurnState } from "../src/rules";
import { goblin } from "../src/scenarios/provisionalScenario";
import { emptyEncounter, engine, scriptedDice } from "./helpers";

const id = asCreatureId;
const monster = (name: string): CombatantDefinition => ({ ...goblin, id: id(name), label: name, stats: { ...goblin.stats, maxHitPoints: 10 } });
const cata: CombatantDefinition = {
  kind: "playerCharacter",
  registration: "simplified",
  testRole: "melee-fighter",
  id: id("cata"),
  label: "Cata",
  size: "medium",
  stats: { maxHitPoints: 20, armorClass: 16, speedFeet: 30 },
  attacks: [{ id: asAttackId("longsword"), label: "Espada larga", mode: "melee", rangeFeet: { normal: 5 }, toHitBonus: 5, damage: [] }],
  bonusActions: [],
  traits: [],
};

function scene(): Encounter {
  let e = emptyEncounter(20, 20);
  e = engine.addCombatant(e, monster("g1"), { column: 5, row: 5 });
  e = engine.addCombatant(e, monster("g2"), { column: 1, row: 1 });
  e = engine.addCombatant(e, cata, { column: 6, row: 5 });
  return observeState(e);
}

type State = { encounter: Encounter; turn: TurnState };
/** Ejecuta una orden y deja que los bandos perciban lo ocurrido (como hará el controlador). */
function act(s: State, command: TurnCommand, dice = scriptedDice([])): State {
  const result = applyTurnCommand(s.encounter, s.turn, command, dice);
  if (!result.ok) throw new Error(JSON.stringify(result));
  const encounter = observeLogEntries(result.encounter, s.turn.actorId, result.turn.log.slice(s.turn.log.length));
  return { encounter, turn: result.turn };
}
const enemy = (e: Encounter, observer: string, target: string): KnownOther => {
  const k = buildKnowledgeView(e, id(observer)).knownCreatures.find((c) => c.creatureId === target);
  if (!k || k.relation !== "enemy") throw new Error(`sin memoria de ${target}`);
  return k;
};
/** g1 ataca a Cata con la cimitarra con los dados indicados. */
function goblinAttacks(e: Encounter, dice: number[]): State {
  let s: State = { encounter: e, turn: startTurn(e, id("g1")) };
  s = act(s, { kind: "beginCapability", source: { kind: "standard", action: "attack" } });
  const key = getTurnOptions(s.encounter, s.turn).executionOptions.find((o) => o.choice.kind === "attack" && o.choice.attackId === "scimitar")?.key ?? "";
  return act(s, { kind: "chooseOption", key }, scriptedDice(dice));
}

describe("percepción: lo que el bando sabe de un enemigo", () => {
  it("nunca recibe la CA ni los PG exactos; sí la posición visible", () => {
    const k = enemy(scene(), "g1", "cata");
    expect(k).toMatchObject({ visibleNow: true, position: { column: 6, row: 5 }, armorClass: { atLeast: null, atMost: null }, maxHitPoints: { atLeast: 1, atMost: null } });
    expect(JSON.stringify(k)).not.toContain("armorClass\":16");
    expect("record" in k).toBe(false);
  });

  it("sí mismo y aliados: conocimiento completo (el bando comparte mente)", () => {
    const view = buildKnowledgeView(scene(), id("g1"));
    expect(view.knownCreatures.filter((c) => c.relation !== "enemy").map((c) => [c.creatureId, c.relation])).toEqual([
      ["g1", "self"],
      ["g2", "ally"],
    ]);
  });

  it("supuesto inicial por nivel (aún sin tabla): se pasa como dato aparte", () => {
    const k = buildKnowledgeView(scene(), id("g1"), { armorClass: 15, maxHitPoints: 25 }).knownCreatures.find((c) => c.creatureId === "cata");
    expect(k?.relation === "enemy" && k.armorClass).toEqual({ atLeast: null, atMost: null, prior: 15 });
  });
});

describe("aprendizaje de la CA con sus propias tiradas", () => {
  it("falla con 15 → CA ≥ 16; impacta con 18 → CA ≤ 18; el bando entero lo sabe", () => {
    let s = goblinAttacks(scene(), [11]); // 11 + 4 = 15 falla contra 16
    expect(enemy(s.encounter, "g1", "cata").armorClass).toMatchObject({ atLeast: 16, atMost: null });
    s = goblinAttacks(s.encounter, [14, 3]); // 18 impacta
    expect(enemy(s.encounter, "g2", "cata").armorClass).toMatchObject({ atLeast: 16, atMost: 18 });
  });

  it("el 20 y el 1 naturales no informan", () => {
    const s = goblinAttacks(goblinAttacks(scene(), [1]).encounter, [20, 1, 1]);
    expect(enemy(s.encounter, "g1", "cata").armorClass).toMatchObject({ atLeast: null, atMost: null });
  });
});

describe("estimación de PG con Maltrecho y el daño visto", () => {
  it("6 de daño sin Maltrecho → máximo > 12; 11 en total y Maltrecha → máximo ≤ 22", () => {
    let s = goblinAttacks(scene(), [15, 4]); // 4 + 2 = 6
    let k = enemy(s.encounter, "g1", "cata");
    expect(k).toMatchObject({ damageSeen: 6, maxHitPoints: { atLeast: 13, atMost: null } });
    s = goblinAttacks(s.encounter, [15, 3]); // 3 + 2 = 5 → 11, quedan 9 de 20: Maltrecha
    k = enemy(s.encounter, "g1", "cata");
    expect(k).toMatchObject({ damageSeen: 11, maxHitPoints: { atLeast: 13, atMost: 22 } });
  });
});

describe("lo que se ve hacer y lo que no se ve", () => {
  it("recuerda los ataques que le ha visto usar a un enemigo y el daño que causó", () => {
    const e = scene();
    let s: State = { encounter: e, turn: startTurn(e, id("cata")) };
    s = act(s, { kind: "beginCapability", source: { kind: "standard", action: "attack" } });
    const key = getTurnOptions(s.encounter, s.turn).executionOptions.find((o) => o.choice.kind === "attack" && o.choice.targetId === "g1")?.key ?? "";
    s = act(s, { kind: "chooseOption", key, attackInput: { playerRoll: { natural: 15, total: 20, damage: [{ type: "slashing", amount: 7 }] } } });
    expect(enemy(s.encounter, "g2", "cata")).toMatchObject({ attacksSeen: ["longsword"], capabilitiesSeen: ["standard:attack"], damageDealtSeen: 7 });
  });

  it("si nadie del bando la ve (Invisible), conserva la última posición y no aprende de lo que hace", () => {
    const invisible = applyCondition(scene(), id("cata"), "invisible", null, { kind: "indefinite" });
    if (!invisible.applied) throw new Error(invisible.reason);
    let s: State = { encounter: invisible.encounter, turn: startTurn(invisible.encounter, id("cata")) };
    s = act(s, { kind: "move", path: [{ column: 7, row: 5 }, { column: 8, row: 5 }] });
    const k = enemy(s.encounter, "g1", "cata");
    expect(k).toMatchObject({ visibleNow: false, position: { column: 6, row: 5 } });
  });

  it("un enemigo que el bando nunca ha percibido no existe para el cerebro", () => {
    let e = emptyEncounter(20, 20);
    e = engine.addCombatant(e, monster("g1"), { column: 5, row: 5 });
    e = engine.addCombatant(e, cata, { column: 15, row: 15 });
    const hidden = applyCondition(e, id("cata"), "invisible", null, { kind: "indefinite" });
    if (!hidden.applied) throw new Error(hidden.reason);
    const view = buildKnowledgeView(observeState(hidden.encounter), id("g1"));
    expect(view.knownCreatures.map((c) => c.creatureId)).toEqual(["g1"]);
  });
});
