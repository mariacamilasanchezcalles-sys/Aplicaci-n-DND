import { describe, expect, it } from "vitest";
import { asCreatureId } from "../src/models";
import type { CombatantDefinition, Encounter } from "../src/models";
import { applyTurnCommand, dealDamage, getTurnOptions, hasCondition, healCreature, recordDeathSave, startTurn } from "../src/rules";
import { goblin } from "../src/scenarios/provisionalScenario";
import { emptyEncounter, engine, scriptedDice } from "./helpers";

const id = asCreatureId;
const monster = (name: string, hp = 10): CombatantDefinition => ({ ...goblin, id: id(name), stats: { ...goblin.stats, maxHitPoints: hp } });
const character = (name: string, hp = 12): CombatantDefinition => ({
  kind: "playerCharacter",
  registration: "simplified",
  testRole: "melee-fighter",
  id: id(name),
  label: name,
  size: "medium",
  stats: { maxHitPoints: hp, armorClass: 10, speedFeet: 30 },
  attacks: [],
  bonusActions: [],
  traits: [],
});

function scene(...defs: readonly CombatantDefinition[]): Encounter {
  return defs.reduce((e, d, i) => engine.addCombatant(e, d, { column: i * 2, row: 0 }), emptyEncounter(20, 20));
}
const state = (e: Encounter, name: string) => e.combatants[name]!.state;

describe("llegar a 0 PG (SRD 5.2.1)", () => {
  it("un monstruo muere al llegar a 0 PG; más daño no cambia nada", () => {
    const hit = dealDamage(scene(monster("m")), id("m"), 15);
    expect(hit).toMatchObject({ hitPointsLost: 10, lifeStateAfter: "dead" });
    expect(state(hit.encounter, "m")).toMatchObject({ currentHitPoints: 0, lifeState: "dead" });
    expect(dealDamage(hit.encounter, id("m"), 5).encounter).toBe(hit.encounter);
  });

  it("un personaje cae Inconsciente (y Derribado) y empieza las salvaciones contra la muerte", () => {
    const hit = dealDamage(scene(character("pc")), id("pc"), 15);
    expect(state(hit.encounter, "pc")).toMatchObject({ currentHitPoints: 0, lifeState: "dying", deathSaves: { successes: 0, failures: 0 } });
    expect(hasCondition(hit.encounter.combatants["pc"]!, "unconscious")).toBe(true);
    expect(hasCondition(hit.encounter.combatants["pc"]!, "prone")).toBe(true);
  });

  it("daño masivo: si lo que sobra iguala o supera el máximo, muere", () => {
    // Ejemplo del SRD: máximo 12, tiene 6 y recibe 18 → sobran 12 → muere.
    const e = dealDamage(scene(character("pc")), id("pc"), 6).encounter;
    expect(dealDamage(e, id("pc"), 18).lifeStateAfter).toBe("dead");
    expect(dealDamage(e, id("pc"), 17).lifeStateAfter).toBe("dying");
  });

  it("daño a 0 PG: un fallo, dos si es crítico; si iguala el máximo, muere", () => {
    const down = dealDamage(scene(character("pc")), id("pc"), 12).encounter;
    const one = dealDamage(down, id("pc"), 1);
    expect(state(one.encounter, "pc").deathSaves.failures).toBe(1);
    const crit = dealDamage(one.encounter, id("pc"), 1, { critical: true });
    expect(state(crit.encounter, "pc")).toMatchObject({ lifeState: "dead", deathSaves: { failures: 3 } });
    expect(dealDamage(down, id("pc"), 12).lifeStateAfter).toBe("dead");
  });
});

describe("salvaciones contra la muerte (las tira el jugador)", () => {
  const dying = () => dealDamage(scene(character("pc")), id("pc"), 12).encounter;
  const save = (e: Encounter, d20: number): Encounter => {
    const r = recordDeathSave(e, id("pc"), d20);
    if ("error" in r) throw new Error(r.error);
    return r.encounter;
  };

  it("tres éxitos: Estable (sigue Inconsciente)", () => {
    const e = save(save(save(dying(), 10), 15), 19);
    expect(state(e, "pc")).toMatchObject({ lifeState: "stable", currentHitPoints: 0, deathSaves: { successes: 0, failures: 0 } });
    expect(hasCondition(e.combatants["pc"]!, "unconscious")).toBe(true);
    // Un Estable que recibe daño vuelve a hacer salvaciones (con un fallo).
    expect(state(dealDamage(e, id("pc"), 1).encounter, "pc")).toMatchObject({ lifeState: "dying", deathSaves: { failures: 1 } });
  });

  it("un 1 cuenta como dos fallos; tres fallos: muere", () => {
    expect(state(save(save(dying(), 1), 9), "pc").lifeState).toBe("dead");
  });

  it("un 20 recupera 1 PG y vuelve en sí (sigue Derribado)", () => {
    const e = save(dying(), 20);
    expect(state(e, "pc")).toMatchObject({ lifeState: "alive", currentHitPoints: 1 });
    expect(hasCondition(e.combatants["pc"]!, "unconscious")).toBe(false);
    expect(hasCondition(e.combatants["pc"]!, "prone")).toBe(true);
  });

  it("rechaza tiradas imposibles o de criaturas que no están muriendo", () => {
    expect(recordDeathSave(dying(), id("pc"), 21)).toEqual({ error: "invalidRoll" });
    expect(recordDeathSave(scene(character("pc")), id("pc"), 10)).toEqual({ error: "notDying" });
  });
});

describe("curación", () => {
  it("desde 0 PG vuelve en sí y se reinician las salvaciones; nunca supera el máximo", () => {
    const down = dealDamage(scene(character("pc")), id("pc"), 13).encounter;
    const healed = healCreature(down, id("pc"), 50);
    expect(healed.healed).toBe(12);
    expect(state(healed.encounter, "pc")).toMatchObject({ lifeState: "alive", currentHitPoints: 12 });
  });

  it("los muertos no se curan", () => {
    const dead = dealDamage(scene(monster("m")), id("m"), 10).encounter;
    expect(healCreature(dead, id("m"), 5).healed).toBe(0);
  });
});

describe("0 PG en el ejecutor de turno", () => {
  it("dejar inconsciente con un ataque cuerpo a cuerpo: 1 PG e Inconsciente; a distancia no se permite", () => {
    const e = scene(monster("g"), monster("t", 3));
    // "t" está a 2 casillas: se acerca una para la cimitarra.
    let turn = startTurn(e, id("g"));
    const moved = applyTurnCommand(e, turn, { kind: "move", path: [{ column: 1, row: 0 }] }, scriptedDice([]));
    if (!moved.ok) throw new Error(moved.reasonCode);
    const begun = applyTurnCommand(moved.encounter, moved.turn, { kind: "beginCapability", source: { kind: "standard", action: "attack" } }, scriptedDice([]));
    if (!begun.ok) throw new Error(begun.reasonCode);
    turn = begun.turn;
    const options = getTurnOptions(begun.encounter, turn).executionOptions;
    const bow = options.find((o) => o.choice.kind === "attack" && o.choice.attackId === "shortbow")?.key ?? "";
    const scimitar = options.find((o) => o.choice.kind === "attack" && o.choice.attackId === "scimitar")?.key ?? "";
    expect(applyTurnCommand(begun.encounter, turn, { kind: "chooseOption", key: bow, attackInput: { knockOut: true } }, scriptedDice([]))).toEqual({
      ok: false,
      reasonCode: "knockOutNotAllowed",
    });
    const ko = applyTurnCommand(begun.encounter, turn, { kind: "chooseOption", key: scimitar, attackInput: { knockOut: true } }, scriptedDice([15, 6]));
    if (!ko.ok) throw new Error(ko.reasonCode);
    expect(state(ko.encounter, "t")).toMatchObject({ currentHitPoints: 1, lifeState: "alive" });
    expect(hasCondition(ko.encounter.combatants["t"]!, "unconscious")).toBe(true);
    expect(ko.turn.log.find((x) => x.kind === "attackResolved")).toMatchObject({ knockedOut: true, targetLifeStateAfter: "alive" });
  });

  it("un muerto no se ofrece como objetivo y un moribundo no actúa", () => {
    const e = dealDamage(scene(monster("g"), monster("dead")), id("dead"), 10).encounter;
    const begun = applyTurnCommand(e, startTurn(e, id("g")), { kind: "beginCapability", source: { kind: "standard", action: "attack" } }, scriptedDice([]));
    expect(begun).toEqual({ ok: false, reasonCode: "noLegalOptions" });

    const down = dealDamage(scene(character("pc"), monster("m")), id("pc"), 12).encounter;
    const options = getTurnOptions(down, startTurn(down, id("pc")));
    expect(options).toMatchObject({ canMove: false, capabilities: [] });
  });
});
