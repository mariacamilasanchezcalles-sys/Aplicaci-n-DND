import { describe, expect, it } from "vitest";
import { asAttackId, asCreatureId } from "../src/models";
import type { ActionOption, GridPosition } from "../src/models";
import {
  footprintDistanceSquares,
  squareDistance,
  stepCost,
  validatePlacement,
} from "../src/rules";
import type { LegalityResult } from "../src/rules";
import { cata, goblin } from "../src/scenarios/provisionalScenario";
import {
  buildScenario,
  copyOfGoblin,
  engine,
  goblinAlone,
  move,
  straightRight,
} from "./helpers";

const goblinId = asCreatureId("goblin-1");
const solo = goblinAlone();

const plan = (...steps: ActionOption[]) =>
  engine.validateTurnPlan(solo, { actorId: goblinId, steps });
const reason = (r: LegalityResult) => (r.legal ? null : r.reasonCode);
const dash: ActionOption = { slot: "action", actionType: "dash" };

/** Diagonales hacia abajo-derecha desde (10, 5). */
const diagonals = (n: number) =>
  Array.from({ length: n }, (_, i) => [11 + i, 6 + i] as const);

describe("coste de un paso (diagonal alternada 1, 2, 1, 2)", () => {
  const origin: GridPosition = { column: 5, row: 5 };

  it("los pasos rectos cuestan 1 y no cambian la cuenta de diagonales", () => {
    expect(stepCost(origin, { column: 6, row: 5 }, "alternating-1-2", 0)).toEqual({
      valid: true,
      cost: 1,
      diagonalCount: 0,
    });
    expect(stepCost(origin, { column: 5, row: 4 }, "alternating-1-2", 3)).toEqual({
      valid: true,
      cost: 1,
      diagonalCount: 3,
    });
  });

  it("las diagonales cuestan 1, 2, 1, 2 y acumulan la cuenta", () => {
    const diagonal = { column: 6, row: 6 };
    const costs: number[] = [];
    let count = 0;
    for (let i = 0; i < 4; i++) {
      const r = stepCost(origin, diagonal, "alternating-1-2", count);
      if (!r.valid) throw new Error("paso diagonal debía ser válido");
      costs.push(r.cost);
      count = r.diagonalCount;
    }
    expect(costs).toEqual([1, 2, 1, 2]);
  });

  it("rechaza pasos que no son a una casilla adyacente", () => {
    expect(stepCost(origin, { column: 7, row: 5 }, "alternating-1-2", 0).valid).toBe(false);
    expect(stepCost(origin, { column: 6, row: 7 }, "alternating-1-2", 0).valid).toBe(false);
    expect(stepCost(origin, origin, "alternating-1-2", 0).valid).toBe(false);
  });
});

describe("distancia entre casillas", () => {
  it.each([
    [{ column: 0, row: 0 }, { column: 4, row: 0 }, 4],
    [{ column: 0, row: 0 }, { column: 1, row: 1 }, 1],
    [{ column: 0, row: 0 }, { column: 2, row: 2 }, 3],
    [{ column: 0, row: 0 }, { column: 3, row: 3 }, 4],
    [{ column: 0, row: 0 }, { column: 4, row: 4 }, 6],
    [{ column: 0, row: 0 }, { column: 5, row: 2 }, 6],
    [{ column: 3, row: 3 }, { column: 0, row: 0 }, 4],
  ] as const)("de %j a %j son %i casillas", (a, b, expected) => {
    expect(squareDistance(a, b, "alternating-1-2")).toBe(expected);
  });

  it("coincide con el coste de recorrer la ruta más corta", () => {
    // 4 diagonales cuestan 1+2+1+2 = 6 = distancia (0,0)-(4,4).
    expect(squareDistance({ column: 0, row: 0 }, { column: 4, row: 4 }, "alternating-1-2")).toBe(6);
  });

  it("goblin y Cata del escenario están a 4 casillas (20 pies)", () => {
    expect(
      squareDistance({ column: 10, row: 5 }, { column: 6, row: 5 }, "alternating-1-2") * 5,
    ).toBe(20);
  });
});

describe("presupuesto de movimiento (Velocidad 30 pies = 6 casillas)", () => {
  it("permite 6 casillas rectas y rechaza 7", () => {
    expect(plan(straightRight(10, 5, 6)).legal).toBe(true);
    const seven = plan(straightRight(10, 5, 7));
    expect(reason(seven)).toBe("movementExceedsSpeed");
    expect(seven.legal ? null : seven.stepIndex).toBe(0);
  });

  it("4 diagonales cuestan 6 (1+2+1+2): legal; 5 cuestan 7: ilegal", () => {
    expect(plan(move(...diagonals(4))).legal).toBe(true);
    expect(reason(plan(move(...diagonals(5))))).toBe("movementExceedsSpeed");
  });

  it("3 diagonales cuestan 4 (1+2+1): con 2 pasos rectos son 6, con 3 son 7", () => {
    const threeDiagonals = diagonals(3); // termina en (13, 8)
    expect(plan(move(...threeDiagonals, [14, 8], [15, 8])).legal).toBe(true);
    expect(reason(plan(move(...threeDiagonals, [14, 8], [15, 8], [16, 8])))).toBe(
      "movementExceedsSpeed",
    );
  });

  it("la cuenta de diagonales continúa entre pasos de movimiento del mismo turno", () => {
    const single = diagonals(5).map(([column, row]) => move([column, row]));
    expect(plan(...single.slice(0, 4)).legal).toBe(true); // 1+2+1+2 = 6
    expect(reason(plan(...single))).toBe("movementExceedsSpeed"); // 7
  });

  it("el movimiento gastado se suma entre pasos separados por una acción", () => {
    const r = plan(straightRight(10, 5, 4), { slot: "action", actionType: "dodge" }, straightRight(14, 5, 3));
    expect(reason(r)).toBe("movementExceedsSpeed"); // 4 + 3 = 7
    expect(r.legal ? null : r.stepIndex).toBe(2);
    expect(plan(straightRight(10, 5, 4), { slot: "action", actionType: "dodge" }, straightRight(14, 5, 2)).legal).toBe(true);
  });

  it("cada turno (plan) empieza con la cuenta de diagonales y el gasto en cero", () => {
    expect(plan(move(...diagonals(4))).legal).toBe(true);
    expect(plan(move(...diagonals(4))).legal).toBe(true);
  });

  it("sin Velocidad registrada (registro simplificado) no se valida el presupuesto", () => {
    const withCata = goblinAlone([{ definition: cata, position: { column: 6, row: 5 } }]);
    const r = engine.validateTurnPlan(withCata, {
      actorId: cata.id,
      steps: [straightRight(6, 5, 3)],
    });
    expect(r.legal).toBe(true);
    const far = engine.validateTurnPlan(withCata, {
      actorId: cata.id,
      steps: [move(...Array.from({ length: 12 }, (_, i) => [5 - Math.min(i, 5), 5 + Math.max(0, i - 5)] as const))],
    });
    expect(reason(far)).not.toBe("movementExceedsSpeed");
  });
});

describe("Correr (Dash) concede movimiento extra, no es el movimiento normal", () => {
  it("con Correr antes de moverse se pueden recorrer 12 casillas, no 13", () => {
    expect(plan(dash, straightRight(10, 5, 12)).legal).toBe(true);
    expect(reason(plan(dash, straightRight(10, 5, 13)))).toBe("movementExceedsSpeed");
  });

  it("mover 6, Correr y mover 6 más es legal", () => {
    expect(plan(straightRight(10, 5, 6), dash, straightRight(16, 5, 6)).legal).toBe(true);
  });

  it("el extra de Correr no se aplica a movimiento anterior: 7 antes de Correr es ilegal", () => {
    const r = plan(straightRight(10, 5, 7), dash);
    expect(reason(r)).toBe("movementExceedsSpeed");
    expect(r.legal ? null : r.stepIndex).toBe(0);
  });

  it("sin Correr, el movimiento normal no supera la Velocidad", () => {
    expect(reason(plan(straightRight(10, 5, 12)))).toBe("movementExceedsSpeed");
  });
});

describe("validez de los pasos", () => {
  it("rechaza saltar casillas y quedarse en la misma", () => {
    expect(reason(plan(move([12, 5])))).toBe("notAdjacent");
    expect(reason(plan(move([10, 5])))).toBe("notAdjacent");
    expect(reason(plan(move([11, 5], [13, 5])))).toBe("notAdjacent");
  });

  it("rechaza casillas fuera del mapa o no enteras", () => {
    const outside = plan(move([-1, 5]));
    expect(outside.legal ? null : outside.placementReason).toBe("outOfBounds");
    const fractional = plan(move([10.5, 5]));
    expect(fractional.legal ? null : fractional.placementReason).toBe("notInteger");
  });

  it("rechaza terminar el movimiento en una casilla ocupada", () => {
    const e = goblinAlone([{ definition: copyOfGoblin("otro"), position: { column: 11, row: 5 } }]);
    const r = engine.validateTurnPlan(e, { actorId: goblinId, steps: [move([11, 5])] });
    expect(reason(r)).toBe("invalidSquare");
    expect(r.legal ? null : r.placementReason).toBe("occupied");
  });

  it("se puede pasar por una casilla ocupada si el paso termina en una libre", () => {
    const e = goblinAlone([{ definition: copyOfGoblin("otro"), position: { column: 11, row: 5 } }]);
    const r = engine.validateTurnPlan(e, {
      actorId: goblinId,
      steps: [move([11, 5], [12, 5])],
    });
    expect(r.legal).toBe(true);
  });

  it("atravesar una casilla ocupada cuesta movimiento como cualquier otra", () => {
    const e = goblinAlone([{ definition: copyOfGoblin("otro"), position: { column: 11, row: 5 } }]);
    const sixThrough = engine.validateTurnPlan(e, { actorId: goblinId, steps: [straightRight(10, 5, 6)] });
    expect(sixThrough.legal).toBe(true);
    const sevenThrough = engine.validateTurnPlan(e, { actorId: goblinId, steps: [straightRight(10, 5, 7)] });
    expect(reason(sevenThrough)).toBe("movementExceedsSpeed");
  });

  it("se puede detenerse y actuar en una casilla ocupada, pero no terminar el turno ahí", () => {
    const e = goblinAlone([{ definition: copyOfGoblin("otro"), position: { column: 12, row: 5 } }]);
    const dodge: ActionOption = { slot: "action", actionType: "dodge" };
    const actsInside = engine.validateTurnPlan(e, {
      actorId: goblinId,
      steps: [move([11, 5], [12, 5]), dodge, move([13, 5])],
    });
    expect(actsInside.legal).toBe(true);

    const endsInside = engine.validateTurnPlan(e, {
      actorId: goblinId,
      steps: [move([11, 5], [12, 5]), dodge],
    });
    expect(reason(endsInside)).toBe("invalidSquare");
    expect(endsInside.legal ? null : endsInside.placementReason).toBe("occupied");
    expect(endsInside.legal ? null : endsInside.stepIndex).toBe(0); // el último movimiento
  });

  it("puede atacar desde una casilla ocupada a mitad de turno", () => {
    const e = goblinAlone([
      { definition: copyOfGoblin("otro"), position: { column: 12, row: 5 } },
      { definition: copyOfGoblin("objetivo"), position: { column: 12, row: 6 } },
    ]);
    const r = engine.validateTurnPlan(e, {
      actorId: goblinId,
      steps: [
        move([11, 5], [12, 5]),
        {
          slot: "action",
          actionType: "attack",
          attacks: [{ attackId: asAttackId("scimitar"), targetId: asCreatureId("objetivo") }],
        },
        move([13, 5]),
      ],
    });
    expect(r.legal).toBe(true);
  });

  it("puede rodear a otra criatura", () => {
    const e = goblinAlone([{ definition: copyOfGoblin("otro"), position: { column: 11, row: 5 } }]);
    const r = engine.validateTurnPlan(e, {
      actorId: goblinId,
      steps: [move([11, 4], [12, 5])],
    });
    expect(r.legal).toBe(true);
  });

  it("en el escenario, el goblin no puede detenerse en la casilla de Cata pero sí atravesarla", () => {
    const e = buildScenario();
    const stopsOnCata = engine.validateTurnPlan(e, {
      actorId: goblinId,
      steps: [move([9, 5], [8, 5], [7, 5], [6, 5])],
    });
    expect(stopsOnCata.legal ? null : stopsOnCata.placementReason).toBe("occupied");
    const passesCata = engine.validateTurnPlan(e, {
      actorId: goblinId,
      steps: [move([9, 5], [8, 5], [7, 5], [6, 5], [5, 5])],
    });
    expect(passesCata.legal).toBe(true); // 5 casillas <= 6
  });
});

describe("a quién se puede atravesar (por el tamaño de la criatura atravesada)", () => {
  const throughRow = (size: Parameters<typeof copyOfGoblin>[1]) => {
    const e = goblinAlone([{ definition: copyOfGoblin("x", size), position: { column: 11, row: 5 } }]);
    return engine.validateTurnPlan(e, { actorId: goblinId, steps: [straightRight(10, 5, 5)] });
  };

  it.each(["tiny", "small", "medium"] as const)("se puede atravesar a una criatura %s", (size) => {
    expect(throughRow(size).legal).toBe(true);
  });

  it.each(["large", "huge", "gargantuan"] as const)(
    "no se puede atravesar a una criatura %s",
    (size) => {
      const r = throughRow(size);
      expect(reason(r)).toBe("invalidSquare");
      expect(r.legal ? null : r.placementReason).toBe("blocked");
      expect(r.legal ? null : r.stepIndex).toBe(0);
    },
  );

  it("se puede rodear a una criatura que bloquea", () => {
    const e = goblinAlone([{ definition: copyOfGoblin("x", "large"), position: { column: 11, row: 5 } }]);
    const r = engine.validateTurnPlan(e, {
      actorId: goblinId,
      steps: [move([11, 4], [12, 4], [13, 4], [14, 5])],
    });
    expect(r.legal).toBe(true);
  });
});

describe("alcance de los ataques (depende de la posición en ese punto del turno)", () => {
  const e = buildScenario();
  const cataId = asCreatureId("cata");
  const attackWith = (attackId: string): ActionOption => ({
    slot: "action",
    actionType: "attack",
    attacks: [{ attackId: asAttackId(attackId), targetId: cataId }],
  });
  const run = (...steps: ActionOption[]) =>
    engine.validateTurnPlan(e, { actorId: goblinId, steps });

  it("la cimitarra (alcance 5 pies) no llega a Cata a 20 pies", () => {
    expect(reason(run(attackWith("scimitar")))).toBe("targetOutOfRange");
  });

  it("el arco corto sí llega a 20 pies", () => {
    expect(run(attackWith("shortbow")).legal).toBe(true);
  });

  it("tras moverse junto a Cata, la cimitarra es legal", () => {
    expect(run(move([9, 5], [8, 5], [7, 5]), attackWith("scimitar")).legal).toBe(true);
  });

  it("moverse a 10 pies no basta para la cimitarra", () => {
    expect(reason(run(move([9, 5], [8, 5]), attackWith("scimitar")))).toBe("targetOutOfRange");
  });

  it("el orden importa: atacar antes de acercarse sigue fuera de alcance", () => {
    expect(
      reason(run(attackWith("scimitar"), move([9, 5], [8, 5], [7, 5]))),
    ).toBe("targetOutOfRange");
  });

  it("el alcance en diagonal usa la misma convención: 1 diagonal = 5 pies", () => {
    const diagonalTarget = goblinAlone([
      { definition: copyOfGoblin("t"), position: { column: 11, row: 6 } },
    ]);
    const r = engine.validateTurnPlan(diagonalTarget, {
      actorId: goblinId,
      steps: [
        {
          slot: "action",
          actionType: "attack",
          attacks: [{ attackId: asAttackId("scimitar"), targetId: asCreatureId("t") }],
        },
      ],
    });
    expect(r.legal).toBe(true);
  });

  it("el alcance largo del arco llega a 320 pies pero no más", () => {
    const wide = (column: number) =>
      goblinAlone([{ definition: copyOfGoblin("t"), position: { column, row: 5 } }], 100, 10);
    const shoot = (target: ReturnType<typeof wide>) =>
      engine.validateTurnPlan(target, {
        actorId: goblinId,
        steps: [
          {
            slot: "action",
            actionType: "attack",
            attacks: [{ attackId: asAttackId("shortbow"), targetId: asCreatureId("t") }],
          },
        ],
      });
    expect(shoot(wide(74)).legal).toBe(true); // 64 casillas = 320 pies
    expect(reason(shoot(wide(75)))).toBe("targetOutOfRange"); // 325 pies
  });
});

describe("posición válida según tamaño y ocupación (helper de reglas)", () => {
  it("expresa la restricción como función: ocupada, libre e ignorando a la propia criatura", () => {
    const e = buildScenario();
    expect(validatePlacement(e, { column: 6, row: 5 }, "medium")).toEqual({
      valid: false,
      reason: "occupied",
    });
    expect(
      validatePlacement(e, { column: 6, row: 5 }, "medium", { ignoreCreatureId: cata.id }),
    ).toEqual({ valid: true });
    expect(validatePlacement(e, { column: 7, row: 5 }, "medium")).toEqual({ valid: true });
  });

  it("la distancia entre espacios mide desde la casilla más cercana", () => {
    expect(
      footprintDistanceSquares(
        { column: 0, row: 0 },
        "large",
        { column: 3, row: 0 },
        "small",
        "alternating-1-2",
      ),
    ).toBe(2);
    expect(goblin.size).toBe("small");
  });
});
