import { describe, expect, it } from "vitest";
import { InMemoryEncounterStore } from "../src/persistence";
import {
  STANDARD_ACTION_TYPES,
  asAttackId,
  asBonusActionId,
  asCreatureId,
  asEncounterId,
  createCombatCoreApi,
  createEncounterLibrary,
  createProvisionalEncounter,
} from "../src/ui-bridge";
import { buildScenario, engine } from "./helpers";

const GOBLIN = asCreatureId("goblin-1");

function setup() {
  const api = createCombatCoreApi();
  const encounter = createProvisionalEncounter(api, "enc-a", "Encuentro A");
  return { api, encounter };
}

describe("ui-bridge: escenario provisional", () => {
  it("crea el mismo encuentro que el escenario de prueba, con otro id y etiqueta", () => {
    const { encounter } = setup();
    const reference = buildScenario();
    expect(encounter.id).toBe("enc-a");
    expect(encounter.label).toBe("Encuentro A");
    expect(encounter.grid).toEqual(reference.grid);
    expect(encounter.combatants).toEqual(reference.combatants);
  });
});

describe("ui-bridge: vista del mapa", () => {
  it("expone dimensiones 15 x 21 y las casillas ocupadas según el motor", () => {
    const { api } = setup();
    const view = api.getMapView(asEncounterId("enc-a"));
    expect(view.columns).toBe(15);
    expect(view.rows).toBe(21);
    const goblin = view.creatures.find((c) => c.id === GOBLIN);
    expect(goblin?.position).toEqual({ column: 10, row: 5 });
    expect(goblin?.squares).toEqual([{ column: 10, row: 5 }]);
    expect(goblin?.currentHitPoints).toBe(7);
    expect(new Set(view.creatures.map((c) => c.label))).toEqual(new Set(["Goblin", "Cata", "Caín"]));
  });
});

describe("ui-bridge: menú de turno", () => {
  it("lista los datos de la criatura sin decidir legalidad", () => {
    const { api } = setup();
    const menu = api.getTurnMenu(asEncounterId("enc-a"), GOBLIN);
    expect(menu.attacks.map((a) => a.id)).toEqual(["scimitar", "shortbow"]);
    expect(menu.bonusActions).toEqual([
      { id: "nimble-escape", label: "Escapismo Ágil", allowedActions: ["disengage", "hide"] },
    ]);
    expect(menu.targets.map((t) => t.id).sort()).toEqual(["cain", "cata"]);
    expect(menu.standardActions).toEqual(STANDARD_ACTION_TYPES);
    expect(new Set(STANDARD_ACTION_TYPES).size).toBe(12);
  });

  it("falla con una criatura desconocida", () => {
    const { api } = setup();
    expect(() => api.getTurnMenu(asEncounterId("enc-a"), "nadie")).toThrow();
  });
});

describe("ui-bridge: validación de turno", () => {
  it("devuelve exactamente lo mismo que el motor de reglas", () => {
    const { api, encounter } = setup();
    const plans = [
      {
        actorId: GOBLIN,
        steps: [
          { slot: "movement" as const, path: [{ column: 9, row: 5 }, { column: 8, row: 5 }, { column: 7, row: 5 }] },
          {
            slot: "action" as const,
            actionType: "attack" as const,
            attacks: [{ attackId: asAttackId("scimitar"), targetId: asCreatureId("cata") }],
          },
          {
            slot: "bonusAction" as const,
            bonusActionId: asBonusActionId("nimble-escape"),
            actionType: "disengage" as const,
          },
        ],
      },
      {
        actorId: GOBLIN,
        steps: [
          {
            slot: "action" as const,
            actionType: "attack" as const,
            attacks: [{ attackId: asAttackId("scimitar"), targetId: asCreatureId("cata") }],
          },
        ],
      },
      { actorId: GOBLIN, steps: [{ slot: "action" as const, actionType: "magic" as const }] },
    ];
    const results = plans.map((plan) => api.validateTurnPlan(encounter.id, plan));
    expect(results).toEqual(plans.map((plan) => engine.validateTurnPlan(encounter, plan)));
    expect(results[0]).toEqual({ legal: true });
    expect(results[1]).toMatchObject({ legal: false, reasonCode: "targetOutOfRange" });
    expect(results[2]).toMatchObject({ legal: false, reasonCode: "actionNotYetModeled" });
  });
});

describe("ui-bridge: biblioteca de encuentros", () => {
  it("guarda, lista y abre encuentros con una implementación de EncounterStore", async () => {
    const { api } = setup();
    createProvisionalEncounter(api, "enc-b", "Encuentro B");
    const store = new InMemoryEncounterStore();
    const library = createEncounterLibrary(api, store);

    await library.save(asEncounterId("enc-a"));
    await library.save(asEncounterId("enc-b"));
    expect((await library.list()).map((s) => s.label).sort()).toEqual([
      "Encuentro A",
      "Encuentro B",
    ]);

    // Una fachada nueva (como al reiniciar la app) abre lo guardado.
    const fresh = createCombatCoreApi();
    const opened = await createEncounterLibrary(fresh, store).open(asEncounterId("enc-b"));
    expect(opened).toEqual(api.getEncounter(asEncounterId("enc-b")));
    expect(fresh.getEncounter(asEncounterId("enc-b")).label).toBe("Encuentro B");
  });

  it("devuelve null al abrir un encuentro que no existe", async () => {
    const { api } = setup();
    const library = createEncounterLibrary(api, new InMemoryEncounterStore());
    expect(await library.open(asEncounterId("no-existe"))).toBeNull();
  });
});
