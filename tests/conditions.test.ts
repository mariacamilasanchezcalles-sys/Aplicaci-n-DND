import { describe, expect, it } from "vitest";
import { asCreatureId } from "../src/models";
import type { CombatantDefinition, ConditionId, DurationSpec, Encounter } from "../src/models";
import {
  applyCondition,
  applyTurnCommand,
  attackConditions,
  beginCreatureTurn,
  effectiveSpeed,
  getTurnOptions,
  hasCondition,
  removeCondition,
  resolveEffect,
  saveConditions,
  startTurn,
} from "../src/rules";
import type { EffectOperation, TurnState } from "../src/rules";
import { goblin } from "../src/scenarios/provisionalScenario";
import { emptyEncounter, engine, scriptedDice } from "./helpers";

const id = asCreatureId;
const INDEFINITE: DurationSpec = { kind: "indefinite" };
const creature = (name: string, extra: Partial<Pick<CombatantDefinition, "conditionImmunities">> = {}): CombatantDefinition => ({
  ...goblin,
  id: id(name),
  label: name,
  size: "medium",
  stats: { ...goblin.stats, maxHitPoints: 30 },
  ...extra,
});

function scene(...placed: readonly (readonly [string, number, number])[]): Encounter {
  let encounter = emptyEncounter(30, 30);
  for (const [name, column, row] of placed) encounter = engine.addCombatant(encounter, creature(name), { column, row });
  return encounter;
}

function withCondition(encounter: Encounter, target: string, condition: ConditionId, source: string | null = null, duration = INDEFINITE): Encounter {
  const result = applyCondition(encounter, id(target), condition, source === null ? null : id(source), duration);
  if (!result.applied) throw new Error(result.reason);
  return result.encounter;
}

const rec = (encounter: Encounter, name: string) => {
  const record = encounter.combatants[name];
  if (!record) throw new Error(name);
  return record;
};

describe("condiciones: aplicar y quitar (Glosario 2024)", () => {
  it("no se acumula: del mismo origen se sustituye; de otro origen se guarda aparte", () => {
    let e = scene(["a", 1, 1], ["b", 5, 5]);
    e = withCondition(e, "a", "frightened", "b");
    e = withCondition(e, "a", "frightened", "b", { kind: "untilTurnBoundary", boundary: "end", whose: "source" });
    expect(rec(e, "a").state.conditions).toHaveLength(1);
    e = withCondition(e, "a", "frightened", null);
    expect(rec(e, "a").state.conditions).toHaveLength(2);
    expect(hasCondition(rec(removeCondition(e, id("a"), "frightened"), "a"), "frightened")).toBe(false);
  });

  it("Inconsciente incluye Incapacitado y añade Derribado; al quitarlo sigue Derribado", () => {
    let e = withCondition(scene(["a", 1, 1]), "a", "unconscious");
    expect(hasCondition(rec(e, "a"), "incapacitated")).toBe(true);
    expect(hasCondition(rec(e, "a"), "prone")).toBe(true);
    e = removeCondition(e, id("a"), "unconscious");
    expect(hasCondition(rec(e, "a"), "prone")).toBe(true);
    expect(hasCondition(rec(e, "a"), "incapacitated")).toBe(false);
  });

  it("inmunidades: de la ficha y Petrificado → inmune a Envenenado", () => {
    let e = engine.addCombatant(emptyEncounter(10, 10), creature("brave", { conditionImmunities: ["frightened"] }), { column: 1, row: 1 });
    expect(applyCondition(e, id("brave"), "frightened", null, INDEFINITE)).toEqual({ applied: false, reason: "immune" });
    e = withCondition(e, "brave", "petrified");
    expect(applyCondition(e, id("brave"), "poisoned", null, INDEFINITE)).toEqual({ applied: false, reason: "immune" });
  });

  it("Cansancio es acumulativo, reduce la Velocidad 5 por nivel y con 6 niveles muere", () => {
    let e = scene(["a", 1, 1]);
    e = withCondition(withCondition(e, "a", "exhaustion"), "a", "exhaustion");
    expect(rec(e, "a").state.exhaustionLevel).toBe(2);
    expect(effectiveSpeed(rec(e, "a"))).toBe(20);
    for (let i = 0; i < 4; i++) e = withCondition(e, "a", "exhaustion");
    expect(rec(e, "a").state.lifeState).toBe("dead");
  });

  it("Velocidad 0 con Agarrado, Apresado, Paralizado, Petrificado e Inconsciente", () => {
    for (const condition of ["grappled", "restrained", "paralyzed", "petrified", "unconscious"] as const) {
      expect(effectiveSpeed(rec(withCondition(scene(["a", 1, 1]), "a", condition), "a"))).toBe(0);
    }
    expect(effectiveSpeed(rec(withCondition(scene(["a", 1, 1]), "a", "stunned"), "a"))).toBe(30);
  });
});

describe("condiciones: tiradas de ataque", () => {
  const roll = (e: Encounter, attacker: string, target: string, distance = 5, beyond = false) =>
    attackConditions(e, rec(e, attacker), rec(e, target), distance, beyond);

  it("Cegado ataca con Desventaja; contra Apresado hay Ventaja; ambas se anulan", () => {
    const base = scene(["a", 1, 1], ["t", 2, 1]);
    expect(roll(withCondition(base, "a", "blinded"), "a", "t").mode).toBe("disadvantage");
    expect(roll(withCondition(base, "t", "restrained"), "a", "t").mode).toBe("advantage");
    expect(roll(withCondition(withCondition(base, "a", "blinded"), "t", "restrained"), "a", "t").mode).toBe("normal");
  });

  it("Derribado: Ventaja a 5 pies o menos, Desventaja más lejos; el derribado ataca con Desventaja", () => {
    const e = withCondition(scene(["a", 1, 1], ["t", 2, 1]), "t", "prone");
    expect(roll(e, "a", "t", 5).mode).toBe("advantage");
    expect(roll(e, "a", "t", 30).mode).toBe("disadvantage");
    expect(roll(e, "t", "a").mode).toBe("disadvantage");
  });

  it("Invisible: Ventaja al atacar y Desventaja contra ella, salvo que la vean", () => {
    const e = withCondition(scene(["a", 1, 1], ["t", 2, 1]), "a", "invisible");
    expect(roll(e, "a", "t").mode).toBe("advantage");
    expect(roll(e, "t", "a").mode).toBe("disadvantage");
  });

  it("Agarrado: Desventaja contra cualquiera que no sea quien lo agarra", () => {
    const e = withCondition(scene(["a", 1, 1], ["g", 2, 1], ["o", 1, 2]), "a", "grappled", "g");
    expect(roll(e, "a", "g").mode).toBe("normal");
    expect(roll(e, "a", "o").mode).toBe("disadvantage");
  });

  it("Asustado: Desventaja mientras ve el origen del miedo", () => {
    const e = withCondition(scene(["a", 1, 1], ["s", 9, 9], ["t", 2, 1]), "a", "frightened", "s");
    expect(roll(e, "a", "t").mode).toBe("disadvantage");
    expect(roll(withCondition(e, "a", "blinded"), "a", "t").mode).toBe("disadvantage");
  });

  it("Paralizado o Inconsciente: impacto a 5 pies = crítico; Cansancio resta 2 por nivel", () => {
    const e = withCondition(scene(["a", 1, 1], ["t", 2, 1]), "t", "paralyzed");
    expect(roll(e, "a", "t", 5)).toEqual({ mode: "advantage", d20Penalty: 0, criticalOnHit: true });
    expect(roll(e, "a", "t", 10).criticalOnHit).toBe(false);
    expect(roll(withCondition(e, "a", "exhaustion"), "a", "t").d20Penalty).toBe(2);
  });
});

describe("condiciones: salvaciones", () => {
  it("fallo automático de FUE y DES; Apresado con Desventaja en DES", () => {
    const stunned = rec(withCondition(scene(["a", 1, 1]), "a", "stunned"), "a");
    expect(saveConditions(stunned, "dex").autoFail).toBe(true);
    expect(saveConditions(stunned, "wis").autoFail).toBe(false);
    expect(saveConditions(rec(withCondition(scene(["a", 1, 1]), "a", "restrained"), "a"), "dex").mode).toBe("disadvantage");
  });

  it("en un efecto, el fallo automático no tira dados ni pide la tirada al jugador", () => {
    const e = withCondition(scene(["a", 1, 1]), "a", "paralyzed");
    const op: EffectOperation = {
      op: "effect",
      targeting: { kind: "self" },
      save: { ability: "dex", dc: 10, onSuccess: "halfDamage" },
      effects: [{ kind: "damage", bonus: 5, damageType: "fire" }],
    };
    const result = resolveEffect(e, op, [id("a")], scriptedDice([]));
    expect(result.ok && result.targets[0]).toMatchObject({ save: { source: "automaticFailure" }, damageApplied: 5 });
  });

  it("un efecto que aplica una condición si se falla la salvación, con su origen", () => {
    const e = scene(["caster", 1, 1], ["a", 2, 1], ["b", 3, 1]);
    const op: EffectOperation = {
      op: "effect",
      targeting: { kind: "creatures", count: 2, rangeFeet: 30 },
      save: { ability: "wis", dc: 12, onSuccess: "negates" },
      effects: [{ kind: "applyCondition", condition: "frightened", duration: { kind: "untilTurnBoundary", boundary: "end", whose: "source" } }],
    };
    // a: 5 - 1 = 4 falla; b: 15 - 1 = 14 supera.
    const result = resolveEffect(e, op, [id("a"), id("b")], scriptedDice([5, 15]), {}, id("caster"));
    if (!result.ok) throw new Error(result.reason);
    expect(result.targets.map((t) => t.conditionsApplied)).toEqual([["frightened"], []]);
    expect(rec(result.encounter, "a").state.conditions).toEqual([
      { condition: "frightened", sourceId: "caster", duration: { kind: "untilTurnBoundary", boundary: "end", whose: "source" } },
    ]);
  });
});

describe("condiciones en el ejecutor de turno", () => {
  const turnOf = (e: Encounter, name: string): { encounter: Encounter; turn: TurnState } => ({ encounter: e, turn: startTurn(e, id(name)) });
  const command = (s: { encounter: Encounter; turn: TurnState }, c: Parameters<typeof applyTurnCommand>[2]) =>
    applyTurnCommand(s.encounter, s.turn, c, scriptedDice([]));

  it("Aturdido (Incapacitado) no puede actuar pero sí moverse; Paralizado ni lo uno ni lo otro", () => {
    const stunned = turnOf(withCondition(scene(["a", 1, 1], ["t", 2, 1]), "a", "stunned"), "a");
    expect(command(stunned, { kind: "beginCapability", source: { kind: "standard", action: "dash" } })).toEqual({ ok: false, reasonCode: "cannotAct" });
    expect(getTurnOptions(stunned.encounter, stunned.turn)).toMatchObject({ canMove: true, capabilities: [] });
    const paralyzed = turnOf(withCondition(scene(["a", 1, 1]), "a", "paralyzed"), "a");
    expect(getTurnOptions(paralyzed.encounter, paralyzed.turn).canMove).toBe(false);
  });

  it("Derribado: arrastrarse cuesta el doble y levantarse la mitad de la Velocidad", () => {
    const s = turnOf(withCondition(scene(["a", 1, 1]), "a", "prone"), "a");
    const crawl = command(s, { kind: "move", path: [{ column: 2, row: 1 }] });
    expect(crawl.ok && crawl.turn.movement.spentFeet).toBe(10);
    const up = command(s, { kind: "standUp" });
    if (!up.ok) throw new Error(up.reasonCode);
    expect(up.turn.movement.spentFeet).toBe(15);
    expect(hasCondition(rec(up.encounter, "a"), "prone")).toBe(false);
    // Tras levantarse le quedan 15 pies: 3 casillas a coste normal.
    const walk = applyTurnCommand(up.encounter, up.turn, { kind: "move", path: [{ column: 2, row: 1 }, { column: 3, row: 1 }, { column: 4, row: 1 }] }, scriptedDice([]));
    expect(walk.ok).toBe(true);
  });

  it("Derribado y con Velocidad 0 no puede levantarse", () => {
    const s = turnOf(withCondition(withCondition(scene(["a", 1, 1]), "a", "prone"), "a", "grappled"), "a");
    expect(command(s, { kind: "standUp" })).toEqual({ ok: false, reasonCode: "cannotStandUp" });
  });

  it("Asustado no puede acercarse al origen del miedo", () => {
    const s = turnOf(withCondition(scene(["a", 5, 5], ["s", 10, 5]), "a", "frightened", "s"), "a");
    expect(command(s, { kind: "move", path: [{ column: 6, row: 5 }] })).toEqual({ ok: false, reasonCode: "movementTowardFearSource" });
    expect(command(s, { kind: "move", path: [{ column: 4, row: 5 }] }).ok).toBe(true);
  });

  it("Encantado no puede atacar a quien lo encantó", () => {
    const e = withCondition(scene(["a", 1, 1], ["charmer", 2, 1], ["other", 1, 2]), "a", "charmed", "charmer");
    const begun = command(turnOf(e, "a"), { kind: "beginCapability", source: { kind: "standard", action: "attack" } });
    if (!begun.ok) throw new Error(begun.reasonCode);
    const targets = getTurnOptions(begun.encounter, begun.turn).executionOptions.map((o) => o.choice.kind === "attack" && o.choice.targetId);
    expect(targets).not.toContain("charmer");
    expect(targets).toContain("other");
  });

  it("crítico automático contra un Paralizado a 5 pies: se doblan los dados", () => {
    const e = withCondition(scene(["a", 1, 1], ["t", 2, 1]), "t", "paralyzed");
    const begun = command(turnOf(e, "a"), { kind: "beginCapability", source: { kind: "standard", action: "attack" } });
    if (!begun.ok) throw new Error(begun.reasonCode);
    const key = getTurnOptions(begun.encounter, begun.turn).executionOptions.find((o) => o.choice.kind === "attack" && o.choice.attackId === "scimitar")?.key ?? "";
    // Ventaja (12 y 3): 12 + 4 = 16 >= 15 impacta → crítico: 2d6 + 2d4 (el d4 por la Ventaja), todos a 1 → 4 + 2 = 6.
    const dice = scriptedDice([12, 3, 1, 1, 1, 1]);
    const hit = applyTurnCommand(begun.encounter, begun.turn, { kind: "chooseOption", key }, dice);
    if (!hit.ok) throw new Error(hit.reasonCode);
    expect(dice.remaining()).toBe(0);
    expect(hit.turn.log.find((x) => x.kind === "attackResolved")).toMatchObject({ resolution: { outcome: "criticalHit" }, damageApplied: 6 });
  });

  it("las duraciones hasta el inicio o el fin de un turno caducan en ese momento", () => {
    let e = scene(["a", 1, 1], ["caster", 5, 5]);
    e = withCondition(e, "a", "frightened", "caster", { kind: "untilTurnBoundary", boundary: "end", whose: "source" });
    e = withCondition(e, "a", "poisoned", "caster", { kind: "untilTurnBoundary", boundary: "start", whose: "target" });
    // Inicio del turno de "a": caduca Envenenado (hasta el inicio de SU turno).
    const started = beginCreatureTurn(e, id("a"), scriptedDice([]));
    expect(hasCondition(rec(started.encounter, "a"), "poisoned")).toBe(false);
    expect(hasCondition(rec(started.encounter, "a"), "frightened")).toBe(true);
    // Fin del turno del lanzador: caduca Asustado.
    const casterTurn = startTurn(started.encounter, id("caster"));
    const ended = applyTurnCommand(started.encounter, casterTurn, { kind: "endTurn" }, scriptedDice([]));
    expect(ended.ok && hasCondition(rec(ended.encounter, "a"), "frightened")).toBe(false);
  });
});

