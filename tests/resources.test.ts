import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { asCreatureId } from "../src/models";
import type { CombatantDefinition, Encounter } from "../src/models";
import {
  applyTurnCommand,
  getTurnOptions,
  resourceRemaining,
  rollRechargesAtTurnStart,
  spendResources,
  startTurn,
} from "../src/rules";
import type { TurnState } from "../src/rules";
import { goblin } from "../src/scenarios/provisionalScenario";
import { combatantFromSheet, loadCreatureSheet } from "../src/sheets";
import { emptyEncounter, engine, scriptedDice } from "./helpers";

const SKIRMISHER = asCreatureId("skirmisher");
const VOLLEY = { kind: "sheet", capabilityId: "volley" } as const;

function skirmisher(): CombatantDefinition {
  const loaded = loadCreatureSheet(readFileSync(join(__dirname, "fixtures/sheets/test-skirmisher.json"), "utf8"));
  if (!loaded.valid) throw new Error(JSON.stringify(loaded.errors));
  return combatantFromSheet(loaded.sheet, { creatureId: "skirmisher", personality: "pragmatic" }).definition;
}

function setup(): Encounter {
  let encounter = engine.addCombatant(emptyEncounter(40, 20), skirmisher(), { column: 10, row: 5 });
  const target = { ...goblin, id: asCreatureId("target"), stats: { ...goblin.stats, maxHitPoints: 60 } };
  encounter = engine.addCombatant(encounter, target, { column: 14, row: 5 });
  return encounter;
}

describe("recursos de usos limitados", () => {
  it("empiezan completos al entrar en el encuentro", () => {
    expect(setup().combatants["skirmisher"]?.state.resources).toEqual([{ id: "volley-charge", current: 1, max: 1 }]);
  });

  it("se gastan de forma atómica: si no alcanza, no se gasta nada", () => {
    const encounter = setup();
    expect(spendResources(encounter, SKIRMISHER, [{ resourceRef: "volley-charge", amount: 2 }])).toBeNull();
    const spent = spendResources(encounter, SKIRMISHER, [{ resourceRef: "volley-charge", amount: 1 }]);
    expect(spent && resourceRemaining(spent, SKIRMISHER, "volley-charge")).toBe(0);
    expect(resourceRemaining(encounter, SKIRMISHER, "volley-charge")).toBe(1);
  });
});

describe("capacidad con coste de recurso en el ejecutor", () => {
  it("el recurso se paga al iniciar, una sola vez, y sin él la capacidad no está disponible", () => {
    let state: { encounter: Encounter; turn: TurnState } = { encounter: setup(), turn: startTurn(setup(), SKIRMISHER) };
    const begun = applyTurnCommand(state.encounter, state.turn, { kind: "beginCapability", source: VOLLEY }, scriptedDice([]));
    if (!begun.ok) throw new Error(begun.reasonCode);
    state = begun;
    expect(resourceRemaining(state.encounter, SKIRMISHER, "volley-charge")).toBe(0);
    // Tres jabalinas: el recurso no se vuelve a cobrar en cada ataque.
    for (let i = 0; i < 3; i++) {
      const key = getTurnOptions(state.encounter, state.turn).executionOptions[0]?.key ?? "";
      const step = applyTurnCommand(state.encounter, state.turn, { kind: "chooseOption", key }, scriptedDice([1]));
      if (!step.ok) throw new Error(step.reasonCode);
      state = step;
    }
    expect(state.turn.execution).toBeNull();
    expect(resourceRemaining(state.encounter, SKIRMISHER, "volley-charge")).toBe(0);

    // Turno siguiente, sin recargar: no se puede usar.
    const next = startTurn(state.encounter, SKIRMISHER);
    expect(getTurnOptions(state.encounter, next).capabilities).not.toContainEqual(VOLLEY);
    const again = applyTurnCommand(state.encounter, next, { kind: "beginCapability", source: VOLLEY }, scriptedDice([]));
    // El requisito `resourceAvailable` se evalúa antes que el pago.
    expect(again).toEqual({ ok: false, reasonCode: "requirementsNotMet" });
  });
});

describe("Recarga X–6 al inicio del turno (SRD 5.2.1)", () => {
  const spentEncounter = (): Encounter => {
    const spent = spendResources(setup(), SKIRMISHER, [{ resourceRef: "volley-charge", amount: 1 }]);
    if (!spent) throw new Error("no se pudo gastar");
    return spent;
  };

  it("con 5 o 6 en 1d6 recupera el uso", () => {
    const { encounter, rolls } = rollRechargesAtTurnStart(spentEncounter(), SKIRMISHER, scriptedDice([5]));
    expect(rolls).toEqual([{ resourceId: "volley-charge", roll: 5, recharged: true }]);
    expect(resourceRemaining(encounter, SKIRMISHER, "volley-charge")).toBe(1);
  });

  it("con menos de 5 no lo recupera", () => {
    const { encounter, rolls } = rollRechargesAtTurnStart(spentEncounter(), SKIRMISHER, scriptedDice([4]));
    expect(rolls).toEqual([{ resourceId: "volley-charge", roll: 4, recharged: false }]);
    expect(resourceRemaining(encounter, SKIRMISHER, "volley-charge")).toBe(0);
  });

  it("si el recurso está completo no se tira ningún dado", () => {
    const dice = scriptedDice([]);
    const { rolls } = rollRechargesAtTurnStart(setup(), SKIRMISHER, dice);
    expect(rolls).toEqual([]);
  });
});

describe("defensas del objetivo en un ataque del ejecutor", () => {
  it("el daño aplicado tiene en cuenta la Resistencia del objetivo", () => {
    // El objetivo es el Hostigador (Resistencia a perforante); ataca el Goblin con el arco.
    let encounter = engine.addCombatant(emptyEncounter(40, 20), goblin, { column: 10, row: 5 });
    encounter = engine.addCombatant(encounter, skirmisher(), { column: 14, row: 5 });
    let state = { encounter, turn: startTurn(encounter, asCreatureId("goblin-1")) };
    const begun = applyTurnCommand(state.encounter, state.turn, { kind: "beginCapability", source: { kind: "standard", action: "attack" } }, scriptedDice([]));
    if (!begun.ok) throw new Error(begun.reasonCode);
    state = begun;
    const key = getTurnOptions(state.encounter, state.turn).executionOptions.find((o) => o.choice.kind === "attack" && o.choice.attackId === "shortbow")?.key ?? "";
    // d20 = 15 (impacta CA 14); 1d6 = 5 → 5 + 2 = 7 perforante → Resistencia → 3.
    const hit = applyTurnCommand(state.encounter, state.turn, { kind: "chooseOption", key }, scriptedDice([15, 5]));
    if (!hit.ok) throw new Error(hit.reasonCode);
    expect(hit.encounter.combatants["skirmisher"]?.state.currentHitPoints).toBe(20 - 3);
    expect(hit.turn.log.find((e) => e.kind === "attackResolved")).toMatchObject({
      damageAfterDefenses: [{ type: "piercing", raw: 7, final: 3, defense: "resistant" }],
      damageApplied: 3,
    });
  });
});
