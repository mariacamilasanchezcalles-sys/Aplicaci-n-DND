import { describe, expect, it } from "vitest";
import { asCreatureId } from "../src/models";
import { PlacementError } from "../src/rules";
import {
  PROVISIONAL_FIELDS,
  PROVISIONAL_SCENARIO,
  goblin,
} from "../src/scenarios/provisionalScenario";
import { buildScenario, emptyEncounter, engine } from "./helpers";

describe("creación de un encuentro", () => {
  it("crea un encuentro vacío con casillas de 5 pies, terreno abierto, dimensiones y regla diagonal explícitas", () => {
    const encounter = emptyEncounter(12, 9);
    expect(encounter.grid.feetPerSquare).toBe(5);
    expect(encounter.grid.terrain).toBe("open");
    expect(encounter.grid.dimensions).toEqual({ columns: 12, rows: 9 });
    expect(encounter.tableRules).toEqual({
      diagonal: "alternating-1-2",
      movementThroughCreatures: "houseSmallOrMedium",
      areaTemplate: "halfSquareDmg2014",
    });
    expect(encounter.occupancyPolicy).toBe("one-creature-per-space");
    expect(Object.keys(encounter.combatants)).toHaveLength(0);
  });

  it("rechaza dimensiones no válidas", () => {
    expect(() => emptyEncounter(0, 5)).toThrow(RangeError);
    expect(() => emptyEncounter(5, -1)).toThrow(RangeError);
    expect(() => emptyEncounter(5.5, 5)).toThrow(RangeError);
  });
});

describe("registro de criaturas y posiciones", () => {
  it("conserva las posiciones del escenario", () => {
    const encounter = buildScenario();
    const pos = (id: string) => encounter.combatants[id]?.state.position;
    expect(Object.keys(encounter.combatants)).toHaveLength(3);
    expect(pos("goblin-1")).toEqual({ column: 10, row: 5 });
    expect(pos("cata")).toEqual({ column: 6, row: 5 });
    expect(pos("cain")).toEqual({ column: 10, row: 11 });
  });

  it("no muta el encuentro original", () => {
    const empty = emptyEncounter();
    engine.addCombatant(empty, goblin, { column: 1, row: 1 });
    expect(Object.keys(empty.combatants)).toHaveLength(0);
  });

  it("rechaza ids duplicados", () => {
    const encounter = buildScenario();
    expect(() => engine.addCombatant(encounter, goblin, { column: 0, row: 0 })).toThrow(
      /ya está registrada/,
    );
  });

  it("admite registro simplificado sin hoja de personaje completa", () => {
    const encounter = buildScenario();
    expect(encounter.combatants["cata"]?.definition.stats).toEqual({});
    expect(encounter.combatants["cata"]?.state.currentHitPoints).toBeNull();
  });

  it("usa el id funcional, no el nombre visible, como clave", () => {
    const encounter = buildScenario();
    expect(encounter.combatants[asCreatureId("goblin-1")]?.definition.label).toBe("Goblin");
    expect(encounter.combatants["Goblin"]).toBeUndefined();
  });
});

describe("coordenadas desde cero y límites del mapa", () => {
  it("acepta la primera y la última casilla", () => {
    const e = emptyEncounter(4, 3);
    expect(() => engine.addCombatant(e, goblin, { column: 0, row: 0 })).not.toThrow();
    expect(() => engine.addCombatant(e, goblin, { column: 3, row: 2 })).not.toThrow();
  });

  it.each([
    [{ column: 4, row: 0 }, "outOfBounds"],
    [{ column: 0, row: 3 }, "outOfBounds"],
    [{ column: -1, row: 0 }, "outOfBounds"],
    [{ column: 0, row: -1 }, "outOfBounds"],
    [{ column: 1.5, row: 1 }, "notInteger"],
  ] as const)("rechaza %j (%s)", (position, reason) => {
    const e = emptyEncounter(4, 3);
    try {
      engine.addCombatant(e, goblin, position);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(PlacementError);
      expect((error as PlacementError).reason).toBe(reason);
    }
  });

  it("el mapa del escenario es de 15 columnas x 21 filas", () => {
    expect(PROVISIONAL_SCENARIO.grid.dimensions).toEqual({ columns: 15, rows: 21 });
    expect(buildScenario().grid.dimensions).toEqual({ columns: 15, rows: 21 });
  });

  it("las posiciones del escenario caben en el mapa del escenario", () => {
    const { columns, rows } = PROVISIONAL_SCENARIO.grid.dimensions;
    for (const { position } of PROVISIONAL_SCENARIO.placements) {
      expect(position.column).toBeLessThan(columns);
      expect(position.row).toBeLessThan(rows);
    }
  });
});

describe("datos provisionales", () => {
  it("los 7 PG del goblin están declarados como provisionales", () => {
    expect(goblin.stats.maxHitPoints).toBe(7);
    expect(PROVISIONAL_FIELDS["goblin-1"]).toContain("stats.maxHitPoints");
  });

  it("Cata y Caín son criaturas Medianas de prueba", () => {
    const encounter = buildScenario();
    expect(encounter.combatants["cata"]?.definition.size).toBe("medium");
    expect(encounter.combatants["cain"]?.definition.size).toBe("medium");
    expect(PROVISIONAL_FIELDS["cata"]).toContain("size");
  });
});
