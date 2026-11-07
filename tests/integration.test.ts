import { describe, expect, it } from "vitest";
import { asCreatureId, asOptionId, PendingImplementationError } from "../src/models";
import type { LegalActionSet } from "../src/models";
import { createCombatCoreApi } from "../src/ui-bridge";
import {
  InMemoryEncounterStore,
  SNAPSHOT_SCHEMA_VERSION,
  deserializeEncounter,
  serializeEncounter,
} from "../src/persistence";
import {
  assertDecisionIsLegal,
  unimplementedTacticalBrain,
} from "../src/tactical-brain";
import type { TacticalDecisionRequest } from "../src/tactical-brain";
import { PROVISIONAL_SCENARIO } from "../src/scenarios/provisionalScenario";
import { engine } from "./helpers";

function loadScenarioThroughApi() {
  const api = createCombatCoreApi();
  api.createEncounter({
    id: PROVISIONAL_SCENARIO.encounterId,
    label: PROVISIONAL_SCENARIO.label,
    grid: PROVISIONAL_SCENARIO.grid,
    occupancyPolicy: PROVISIONAL_SCENARIO.occupancyPolicy,
    tableRules: PROVISIONAL_SCENARIO.tableRules,
  });
  for (const { definition, position } of PROVISIONAL_SCENARIO.placements) {
    api.registerCombatant(PROVISIONAL_SCENARIO.encounterId, definition, position);
  }
  return api;
}

describe("comunicación interfaz ↔ núcleo", () => {
  it("la interfaz crea y consulta un encuentro solo mediante la fachada", () => {
    const api = loadScenarioThroughApi();
    expect(api.getStatus().ready).toBe(true);
    expect(api.getStatus().encounterCount).toBe(1);
    const encounter = api.getEncounter(PROVISIONAL_SCENARIO.encounterId);
    expect(Object.keys(encounter.combatants)).toHaveLength(3);
  });

  it("las restricciones del motor llegan a la interfaz", () => {
    const api = loadScenarioThroughApi();
    const goblinPlacement = PROVISIONAL_SCENARIO.placements[0]!;
    expect(() =>
      api.registerCombatant(
        PROVISIONAL_SCENARIO.encounterId,
        { ...goblinPlacement.definition, id: asCreatureId("otro") },
        goblinPlacement.position,
      ),
    ).toThrow();
  });
});

describe("persistencia", () => {
  it("ida y vuelta por JSON conserva el encuentro", async () => {
    const encounter = loadScenarioThroughApi().getEncounter(PROVISIONAL_SCENARIO.encounterId);
    expect(deserializeEncounter(serializeEncounter(encounter)).encounter).toEqual(encounter);

    const store = new InMemoryEncounterStore();
    await store.save({ schemaVersion: SNAPSHOT_SCHEMA_VERSION, encounter });
    expect((await store.load(encounter.id))?.encounter).toEqual(encounter);
    expect(await store.list()).toEqual([{ id: encounter.id, label: encounter.label }]);
  });

  it("rechaza guardados de una versión de formato anterior", () => {
    for (const oldVersion of [1, 2]) {
      expect(() =>
        deserializeEncounter(JSON.stringify({ schemaVersion: oldVersion, encounter: {} })),
      ).toThrow();
    }
  });
});

describe("contrato del cerebro táctico", () => {
  const actorId = asCreatureId("goblin-1");
  const legalActions: LegalActionSet = {
    actorId,
    options: [
      { optionId: asOptionId("o1"), option: { slot: "action", actionType: "dodge" } },
    ],
  };
  const request: TacticalDecisionRequest = {
    actorId,
    personality: "pragmatic",
    legalActions,
    knowledge: { observerId: actorId, side: "monsters", round: 0, knownCreatures: [] },
  };

  it("el punto de integración vacío no decide nada", () => {
    expect(unimplementedTacticalBrain.decide(request)).toEqual({ status: "notImplemented" });
  });

  it("rechaza decisiones sobre opciones que el motor no declaró legales", () => {
    expect(() =>
      assertDecisionIsLegal(request, {
        status: "decided",
        chosenOptionId: asOptionId("otra"),
        evaluations: [],
      }),
    ).toThrow();
    expect(() =>
      assertDecisionIsLegal(request, {
        status: "decided",
        chosenOptionId: asOptionId("o1"),
        evaluations: [{ optionId: asOptionId("o1"), factors: {} }],
      }),
    ).not.toThrow();
  });
});

describe("partes reservadas", () => {
  it("la generación de acciones legales sigue pendiente y lo declara explícitamente", () => {
    const encounter = loadScenarioThroughApi().getEncounter(PROVISIONAL_SCENARIO.encounterId);
    expect(() => engine.getLegalActions(encounter, asCreatureId("goblin-1"))).toThrow(
      PendingImplementationError,
    );
  });
});
