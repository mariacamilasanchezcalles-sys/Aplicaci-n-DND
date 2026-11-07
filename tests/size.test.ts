import { describe, expect, it } from "vitest";
import { asCreatureId } from "../src/models";
import type { CombatantDefinition, CreatureSize } from "../src/models";
import { FOOTPRINT_SIDE, PlacementError, squaresOf } from "../src/rules";
import { goblin } from "../src/scenarios/provisionalScenario";
import { emptyEncounter, engine, move } from "./helpers";

const sized = (id: string, size: CreatureSize): CombatantDefinition => ({
  ...goblin,
  id: asCreatureId(id),
  size,
});

describe("huella según el tamaño (SRD / Basic Rules 2024)", () => {
  it.each([
    ["small", 1],
    ["medium", 1],
    ["large", 2],
    ["huge", 3],
    ["gargantuan", 4],
  ] as const)("%s ocupa %i x %i casillas", (size, side) => {
    expect(FOOTPRINT_SIDE[size]).toBe(side);
    expect(squaresOf({ column: 2, row: 3 }, size)).toHaveLength(side * side);
  });

  it("la huella parte de la esquina superior izquierda", () => {
    expect(squaresOf({ column: 2, row: 3 }, "large")).toEqual([
      { column: 2, row: 3 },
      { column: 3, row: 3 },
      { column: 2, row: 4 },
      { column: 3, row: 4 },
    ]);
  });

  it("una criatura Mediana ocupa una sola casilla", () => {
    const e = engine.addCombatant(emptyEncounter(), sized("elfo", "medium"), { column: 4, row: 4 });
    expect(() => engine.addCombatant(e, sized("humano", "medium"), { column: 5, row: 4 })).not.toThrow();
    expect(() => engine.addCombatant(e, sized("tiefling", "medium"), { column: 4, row: 4 })).toThrow(
      PlacementError,
    );
  });
});

describe("ocupación con criaturas de varias casillas", () => {
  it("una criatura Grande bloquea las 4 casillas de su huella", () => {
    const e = engine.addCombatant(emptyEncounter(), sized("ogro", "large"), { column: 0, row: 0 });
    for (const [column, row] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
      expect(() => engine.addCombatant(e, sized(`x${column}${row}`, "small"), { column, row })).toThrow(
        PlacementError,
      );
    }
    expect(() => engine.addCombatant(e, sized("libre", "small"), { column: 2, row: 0 })).not.toThrow();
  });

  it("una criatura Grande no puede solaparse con otra al colocarse", () => {
    const e = engine.addCombatant(emptyEncounter(), sized("pequeño", "small"), { column: 1, row: 1 });
    expect(() => engine.addCombatant(e, sized("ogro", "large"), { column: 0, row: 0 })).toThrow(
      PlacementError,
    );
    expect(() => engine.addCombatant(e, sized("ogro", "large"), { column: 2, row: 0 })).not.toThrow();
  });

  it("toda la huella debe caber en el mapa", () => {
    const e = emptyEncounter(16, 16);
    expect(() => engine.addCombatant(e, sized("a", "large"), { column: 15, row: 0 })).toThrow(
      PlacementError,
    );
    expect(() => engine.addCombatant(e, sized("b", "large"), { column: 14, row: 14 })).not.toThrow();
    expect(() => engine.addCombatant(e, sized("c", "huge"), { column: 14, row: 0 })).toThrow(
      PlacementError,
    );
  });

  it("al moverse, la huella completa no puede solaparse con otra criatura", () => {
    let e = engine.addCombatant(emptyEncounter(), sized("ogro", "large"), { column: 0, row: 0 });
    e = engine.addCombatant(e, sized("goblin", "small"), { column: 3, row: 0 });
    const ogroId = asCreatureId("ogro");

    const free = engine.validateTurnPlan(e, { actorId: ogroId, steps: [move([1, 0])] });
    expect(free.legal).toBe(true);

    const blocked = engine.validateTurnPlan(e, { actorId: ogroId, steps: [move([1, 0], [2, 0])] });
    expect(blocked.legal).toBe(false);
    expect(blocked.legal ? null : blocked.placementReason).toBe("occupied");
  });

  it("una criatura Grande puede atravesar a otra y detenerse donde su huella queda libre", () => {
    let e = engine.addCombatant(emptyEncounter(), sized("ogro", "large"), { column: 0, row: 0 });
    e = engine.addCombatant(e, sized("goblin", "small"), { column: 3, row: 0 });
    const ogroId = asCreatureId("ogro");
    // En (4, 0) su huella ocupa columnas 4-5: libre. Pasó por (2, 0) y (3, 0).
    const through = engine.validateTurnPlan(e, {
      actorId: ogroId,
      steps: [move([1, 0], [2, 0], [3, 0], [4, 0])],
    });
    expect(through.legal).toBe(true);
    // En (3, 0) su huella (columnas 3-4) cubre al goblin: no puede detenerse.
    const stops = engine.validateTurnPlan(e, {
      actorId: ogroId,
      steps: [move([1, 0], [2, 0], [3, 0])],
    });
    expect(stops.legal ? null : stops.placementReason).toBe("occupied");
  });

  it("una criatura Grande no puede atravesar a otra Grande", () => {
    let e = engine.addCombatant(emptyEncounter(), sized("ogro-1", "large"), { column: 0, row: 0 });
    e = engine.addCombatant(e, sized("ogro-2", "large"), { column: 3, row: 0 });
    const r = engine.validateTurnPlan(e, {
      actorId: asCreatureId("ogro-1"),
      steps: [move([1, 0], [2, 0])], // su huella pasaría a cubrir las columnas 2-3
    });
    expect(r.legal).toBe(false);
    expect(r.legal ? null : r.placementReason).toBe("blocked");
  });

  it("al moverse, una criatura Grande no puede salirse del mapa por su huella", () => {
    // En un mapa de 4 columnas, un ogro en la columna 2 ocupa las columnas 2 y 3 (el borde).
    const e = engine.addCombatant(emptyEncounter(4, 4), sized("ogro", "large"), { column: 2, row: 0 });
    const outside = engine.validateTurnPlan(e, { actorId: asCreatureId("ogro"), steps: [move([3, 0])] });
    expect(outside.legal).toBe(false);
    expect(outside.legal ? null : outside.placementReason).toBe("outOfBounds");
    const inside = engine.validateTurnPlan(e, { actorId: asCreatureId("ogro"), steps: [move([1, 0])] });
    expect(inside.legal).toBe(true);
  });
});
