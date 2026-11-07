import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { asAttackId, asCreatureId } from "../src/models";
import type { CombatantDefinition, Encounter, TableRules } from "../src/models";
import { createSimulationPort, expectedDice } from "../src/combat-controller";
import { buildBeliefEncounter, buildKnowledgeView, observeLogEntries, observeState, plausibleValues, pointEstimate } from "../src/perception";
import {
  applyCondition,
  applyTurnCommand,
  areaPlacementCandidates,
  attackOdds,
  getTurnOptions,
  reachableSquares,
  saveSuccessChance,
  startTurn,
} from "../src/rules";
import { goblin } from "../src/scenarios/provisionalScenario";
import { combatantFromSheet, loadCreatureSheet } from "../src/sheets";
import { CORE_TEST_TABLE_RULES, emptyEncounter, engine, scriptedDice } from "./helpers";

const id = asCreatureId;
const G = id("goblin-1");
const scimitar = goblin.attacks.find((a) => a.id === "scimitar")!;
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
const key = (s: number, x: number) => `${s},${x}`;

describe("casillas alcanzables (rules/candidates.ts)", () => {
  const alone = (rules: TableRules = CORE_TEST_TABLE_RULES): Encounter => engine.addCombatant({ ...emptyEncounter(30, 30), tableRules: rules }, goblin, { column: 10, row: 5 });

  it("diagonal 1-2-1-2 de la mesa: 4 diagonales (30 pies) sí, 5 no", () => {
    const squares = reachableSquares(alone(), startTurn(alone(), G));
    const at = (c: number, r: number) => squares.find((s) => s.square.column === c && s.square.row === r);
    expect(at(14, 9)?.costFeet).toBe(30);
    expect(at(15, 10)).toBeUndefined();
    expect(at(16, 5)?.costFeet).toBe(30);
  });

  it("con la diagonal oficial 2024, 6 diagonales caben en 30 pies", () => {
    const e = alone({ ...CORE_TEST_TABLE_RULES, diagonal: "standard" });
    const squares = reachableSquares(e, startTurn(e, G));
    expect(squares.some((s) => s.square.column === 16 && s.square.row === 11)).toBe(true);
  });

  it("toda ruta devuelta es aceptada por el ejecutor con el mismo coste", () => {
    let e = alone();
    // Un aliado Grande (no provoca ataques de oportunidad, pero bloquea el paso).
    e = engine.addCombatant(e, { ...goblin, id: id("ogre"), size: "large" }, { column: 12, row: 4 });
    const turn = startTurn(e, G);
    const squares = reachableSquares(e, turn);
    expect(squares.length).toBeGreaterThan(50);
    for (const r of squares) {
      const moved = applyTurnCommand(e, turn, { kind: "move", path: r.path }, scriptedDice([]));
      expect(moved.ok && moved.turn.movement.spentFeet).toBe(r.costFeet);
    }
    // La criatura Grande bloquea su espacio.
    expect(squares.some((s) => s.square.column === 12 && s.square.row === 4)).toBe(false);
  });

  it("Derribado cuesta el doble; Asustado no ofrece casillas más cerca del origen del miedo", () => {
    const prone = applyCondition(alone(), G, "prone", null, { kind: "indefinite" });
    if (!prone.applied) throw new Error(prone.reason);
    const crawl = reachableSquares(prone.encounter, startTurn(prone.encounter, G));
    expect(Math.max(...crawl.map((s) => s.costFeet))).toBeLessThanOrEqual(30);
    expect(crawl.some((s) => s.square.column === 13 && s.square.row === 5)).toBe(true);
    expect(crawl.some((s) => s.square.column === 14 && s.square.row === 5)).toBe(false);

    let e = engine.addCombatant(alone(), cata, { column: 15, row: 5 });
    const scared = applyCondition(e, G, "frightened", id("cata"), { kind: "indefinite" });
    if (!scared.applied) throw new Error(scared.reason);
    e = scared.encounter;
    const free = reachableSquares(e, startTurn(e, G));
    expect(free.some((s) => s.square.column === 11 && s.square.row === 5)).toBe(false);
    expect(free.some((s) => s.square.column === 9 && s.square.row === 5)).toBe(true);
  });

  it("marca dónde puede terminar el turno", () => {
    const e = engine.addCombatant(alone(), cata, { column: 11, row: 5 });
    const squares = reachableSquares(e, startTurn(e, G));
    expect(squares.find((s) => key(s.square.column, s.square.row) === key(11, 5))?.canEndTurnHere).toBe(false);
  });
});

describe("colocaciones de área candidatas", () => {
  it("el aliento del Bruto: todas válidas y una de ellas atrapa a los tres del cono", () => {
    const loaded = loadCreatureSheet(readFileSync(join(__dirname, "fixtures/sheets/test-brute.json"), "utf8"));
    if (!loaded.valid) throw new Error("ficha");
    const brute = combatantFromSheet(loaded.sheet, { creatureId: "brute", personality: "pragmatic" }).definition;
    let e = engine.addCombatant(emptyEncounter(20, 20), brute, { column: 2, row: 2 });
    e = engine.addCombatant(e, { ...cata, id: id("a") }, { column: 5, row: 3 });
    e = engine.addCombatant(e, { ...cata, id: id("b") }, { column: 6, row: 2 });
    const begun = applyTurnCommand(e, startTurn(e, id("brute")), { kind: "beginCapability", source: { kind: "sheet", capabilityId: "breath" } }, scriptedDice([]));
    if (!begun.ok) throw new Error(begun.reasonCode);
    const k = getTurnOptions(begun.encounter, begun.turn).executionOptions[0]!.key;
    const candidates = areaPlacementCandidates(begun.encounter, begun.turn, k);
    // 8 intersecciones en el borde de un espacio 2x2, 8 direcciones.
    expect(candidates).toHaveLength(64);
    expect(candidates.find((c) => c.placement.origin?.column === 4 && c.placement.origin.row === 3 && c.placement.direction === "e")?.affected).toEqual(["a", "b"]);
    expect(areaPlacementCandidates(begun.encounter, begun.turn, k, 5)).toHaveLength(5);
  });
});

describe("probabilidades (rules/odds.ts)", () => {
  it("+4 contra CA 15: impacta con 11 o más", () => {
    expect(attackOdds(scimitar, 15, "normal").hitChance).toBeCloseTo(0.5);
    expect(attackOdds(scimitar, 15, "advantage").hitChance).toBeCloseTo(0.75);
    expect(attackOdds(scimitar, 15, "disadvantage").hitChance).toBeCloseTo(0.25);
    expect(attackOdds(scimitar, 30, "normal").hitChance).toBeCloseTo(0.05); // solo el 20
    expect(attackOdds(scimitar, 1, "normal").hitChance).toBeCloseTo(0.95); // el 1 siempre falla
  });

  it("daño esperado con críticos y el 1d4 de la Ventaja del Goblin", () => {
    // Normal: 0,45 × 5,5 + 0,05 × 9 = 2,925.
    expect(attackOdds(scimitar, 15, "normal").expectedDamage).toBeCloseTo(2.925);
    // Ventaja: impacto 0,75, crítico 0,0975; daño 8 (con 1d4) o 14 en crítico.
    expect(attackOdds(scimitar, 15, "advantage").expectedDamage).toBeCloseTo(0.6525 * 8 + 0.0975 * 14);
    // Crítico automático (Paralizado a 5 pies): todo impacto es crítico.
    expect(attackOdds(scimitar, 15, "normal", { criticalOnHit: true }).expectedDamage).toBeCloseTo(0.5 * 9);
  });

  it("salvación: +2 contra CD 13 tiene éxito con 11 o más (sin reglas del 20 y el 1)", () => {
    expect(saveSuccessChance(2, 13, "normal")).toBeCloseTo(0.5);
    expect(saveSuccessChance(2, 30, "normal")).toBe(0);
    expect(saveSuccessChance(15, 10, "normal")).toBe(1);
  });
});

describe("estado creído y puerto de simulación", () => {
  /** El Goblin falla con 15 e impacta con 18: CA de Cata en [16, 18]. */
  function learned(): Encounter {
    let e = emptyEncounter(20, 20);
    e = engine.addCombatant(e, goblin, { column: 5, row: 5 });
    e = engine.addCombatant(e, cata, { column: 6, row: 5 });
    e = observeState(e);
    for (const dice of [[11], [14, 3]]) {
      const turn = startTurn(e, G);
      const begun = applyTurnCommand(e, turn, { kind: "beginCapability", source: { kind: "standard", action: "attack" } }, scriptedDice([]));
      if (!begun.ok) throw new Error(begun.reasonCode);
      const k = getTurnOptions(begun.encounter, begun.turn).executionOptions.find((o) => o.choice.kind === "attack" && o.choice.attackId === "scimitar")!.key;
      const hit = applyTurnCommand(begun.encounter, begun.turn, { kind: "chooseOption", key: k }, scriptedDice(dice));
      if (!hit.ok) throw new Error(hit.reasonCode);
      e = observeLogEntries(hit.encounter, G, hit.turn.log);
    }
    return e;
  }

  it("estimaciones: punto medio del intervalo y valores plausibles", () => {
    expect(pointEstimate({ atLeast: 16, atMost: 18, prior: 15 })).toBe(17);
    expect(pointEstimate({ atLeast: 16, atMost: null, prior: 15 })).toBe(16);
    expect(pointEstimate({ atLeast: null, atMost: null, prior: 14 })).toBe(14);
    expect(plausibleValues({ atLeast: 16, atMost: 18, prior: null })).toEqual([16, 17, 18]);
  });

  it("el estado creído no contiene la CA ni los PG reales de Cata", () => {
    const e = learned();
    const belief = buildBeliefEncounter(e, buildKnowledgeView(e, G));
    const believedCata = belief.combatants["cata"]!;
    expect(believedCata.definition.stats.armorClass).toBe(17); // estimada; la real es 16
    expect(believedCata.definition.attacks).toEqual([]); // sus ataques reales no se conocen
    expect(belief.combatants["goblin-1"]).toEqual(e.combatants["goblin-1"]); // se conoce a sí mismo
  });

  it("probabilidad estimada: promedia las CA posibles del intervalo [16, 18]", () => {
    const e = learned();
    const port = createSimulationPort(e, buildKnowledgeView(e, G));
    const odds = port.attackOdds(port.belief, G, asAttackId("scimitar"), id("cata"));
    // +4: contra 16 → 0,45; 17 → 0,40; 18 → 0,35.
    expect(odds?.hitChance).toBeCloseTo(0.4);
    expect(odds?.armorClassSamples).toBe(3);
  });

  it("aplicar en la simulación no toca el encuentro real y usa dados esperados", () => {
    const e = learned();
    const port = createSimulationPort(e, buildKnowledgeView(e, G));
    const turn = startTurn(port.belief, G);
    const begun = port.apply(port.belief, turn, { kind: "beginCapability", source: { kind: "standard", action: "attack" } });
    if (!begun.ok) throw new Error(begun.reasonCode);
    const k = port.getOptions(begun.encounter, begun.turn).executionOptions.find((o) => o.choice.kind === "attack" && o.choice.attackId === "scimitar")!.key;
    const after = port.apply(begun.encounter, begun.turn, { kind: "chooseOption", key: k });
    expect(after.ok).toBe(true);
    expect(e.combatants["cata"]?.state.currentHitPoints).toBe(15); // el real no cambia (20 − 5 del impacto real)
    expect([20, 6, 4, 8, 10, 12].map((sides) => expectedDice.nextInt(1, sides))).toEqual([10, 4, 2, 4, 6, 6]);
  });
});
