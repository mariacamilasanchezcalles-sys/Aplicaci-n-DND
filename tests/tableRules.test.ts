import { describe, expect, it } from "vitest";
import { asCreatureId } from "../src/models";
import type { TableRules } from "../src/models";
import { engine, goblinAlone } from "./helpers";
import { goblin } from "../src/scenarios/provisionalScenario";
import { TABLE_RULES_OF_THE_PLAYERS_TABLE } from "../src/scenarios/provisionalScenario";
import { applyTurnCommand, footprintDistanceSquares, startTurn } from "../src/rules";
import { scriptedDice } from "./helpers";

const OFFICIAL_DIAGONAL: TableRules = { ...TABLE_RULES_OF_THE_PLAYERS_TABLE, diagonal: "standard" };
const GOBLIN = asCreatureId("goblin-1");

/** Cuatro diagonales seguidas desde (10, 5). */
const fourDiagonals = [
  { column: 11, row: 6 },
  { column: 12, row: 7 },
  { column: 13, row: 8 },
  { column: 14, row: 9 },
];

describe("configuración de mesa: interruptor de diagonal", () => {
  it("la mesa de la jugadora usa la diagonal alternada (regla casera)", () => {
    expect(TABLE_RULES_OF_THE_PLAYERS_TABLE.diagonal).toBe("alternating-1-2");
    const encounter = goblinAlone();
    // 1 + 2 + 1 + 2 = 6 casillas = 30 pies.
    const result = engine.validateTurnPlan(encounter, { actorId: GOBLIN, steps: [{ slot: "movement", path: fourDiagonals }] });
    expect(result).toEqual({ legal: true });
    const more = engine.validateTurnPlan(encounter, {
      actorId: GOBLIN,
      steps: [{ slot: "movement", path: [...fourDiagonals, { column: 15, row: 10 }] }],
    });
    expect(more).toMatchObject({ legal: false, reasonCode: "movementExceedsSpeed" });
  });

  it("con la regla oficial 2024 cada diagonal cuesta 1 casilla", () => {
    const encounter = { ...goblinAlone(), tableRules: OFFICIAL_DIAGONAL };
    // 6 diagonales = 6 casillas = 30 pies: legal con la oficial, no con la casera.
    const six = [...fourDiagonals, { column: 15, row: 10 }, { column: 16, row: 11 }];
    expect(engine.validateTurnPlan(encounter, { actorId: GOBLIN, steps: [{ slot: "movement", path: six }] })).toEqual({
      legal: true,
    });
    // El ejecutor paso a paso lee la misma configuración.
    const moved = applyTurnCommand(encounter, startTurn(encounter, GOBLIN), { kind: "move", path: six }, scriptedDice([]));
    expect(moved.ok && moved.turn.movement.spentFeet).toBe(30);
  });

  it("la medición de alcances también sigue el interruptor", () => {
    const a = { column: 0, row: 0 };
    const b = { column: 4, row: 4 };
    expect(footprintDistanceSquares(a, "medium", b, "medium", "standard")).toBe(4);
    expect(footprintDistanceSquares(a, "medium", b, "medium", "alternating-1-2")).toBe(6);
  });

  it("el encuentro guarda su configuración de mesa", () => {
    expect(goblinAlone().tableRules).toEqual({
      diagonal: "alternating-1-2",
      movementThroughCreatures: "houseSmallOrMedium",
      areaTemplate: "halfSquareDmg2014",
    });
    expect(goblin.id).toBe(GOBLIN);
  });
});
