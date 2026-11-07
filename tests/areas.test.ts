import { describe, expect, it } from "vitest";
import { asCreatureId } from "../src/models";
import type { GridPosition } from "../src/models";
import { areaSquares, creaturesInSquares } from "../src/rules";
import type { AreaPlacement, AreaSpec } from "../src/rules";
import { goblin } from "../src/scenarios/provisionalScenario";
import { emptyEncounter, engine } from "./helpers";

/** Criatura Mediana en (5, 5): su espacio es [5,6] x [5,6] en intersecciones. */
function setup() {
  const actor = { ...goblin, id: asCreatureId("actor"), size: "medium" as const };
  const encounter = engine.addCombatant(emptyEncounter(20, 20), actor, { column: 5, row: 5 });
  const record = encounter.combatants["actor"];
  if (!record) throw new Error("sin actor");
  return { encounter, record };
}

const keys = (squares: readonly GridPosition[]): string[] => squares.map((s) => `${s.column},${s.row}`).sort();

function squaresFor(spec: AreaSpec, placement: AreaPlacement): string[] {
  const { encounter, record } = setup();
  const result = areaSquares(encounter, record, spec, placement);
  if (!result.ok) throw new Error(result.reason);
  return keys(result.squares);
}

describe("áreas sobre la cuadrícula (regla casera: mitad de la casilla, guía DM 2014)", () => {
  it("Emanación de 5 pies: las 8 casillas vecinas (y la propia)", () => {
    const squares = squaresFor({ shape: "emanation", sizeFeet: 5, rangeFeet: 0 }, {});
    expect(squares).toHaveLength(9);
    // La diagonal queda cubierta en π/4 ≈ 0,785 de la casilla (≥ 1/2).
    expect(squares).toContain("6,6");
    expect(squares).not.toContain("7,5");
  });

  it("Esfera de 10 pies de radio: 3 casillas por cuadrante (12)", () => {
    // Origen en la intersección (10, 10), a 20 pies del actor.
    const squares = squaresFor({ shape: "sphere", sizeFeet: 10, rangeFeet: 60 }, { origin: { column: 10, row: 10 } });
    expect(squares).toEqual(
      ["8,9", "9,8", "9,9", "10,8", "10,9", "11,9", "8,10", "9,10", "9,11", "10,10", "10,11", "11,10"].sort(),
    );
  });

  it("Cono de 15 pies hacia el este desde el borde: 4 casillas", () => {
    // Anchura = distancia al origen (regla verificada). Cobertura por columna
    // desde el origen: 1.ª → 0,25 (no); 2.ª → 0,75; 3.ª → 1 (centrales) y 0,25 (exteriores).
    const squares = squaresFor({ shape: "cone", sizeFeet: 15, rangeFeet: 0 }, { origin: { column: 6, row: 6 }, direction: "e" });
    expect(squares).toEqual(["7,5", "7,6", "8,5", "8,6"]);
  });

  it("Línea de 30 x 5 pies por una línea de la cuadrícula: cubre media casilla a cada lado", () => {
    const squares = squaresFor({ shape: "line", sizeFeet: 30, rangeFeet: 0 }, { origin: { column: 6, row: 6 }, direction: "e" });
    // 6 columnas x 2 filas, cada casilla cubierta exactamente a la mitad.
    expect(squares).toHaveLength(12);
  });

  it("Cubo de 10 pies: crece en diagonal desde una esquina", () => {
    const squares = squaresFor({ shape: "cube", sizeFeet: 10, rangeFeet: 30 }, { origin: { column: 8, row: 8 }, direction: "se" });
    expect(squares).toEqual(["8,8", "8,9", "9,8", "9,9"]);
  });

  it("validación de la colocación", () => {
    const { encounter, record } = setup();
    const cone: AreaSpec = { shape: "cone", sizeFeet: 15, rangeFeet: 0 };
    expect(areaSquares(encounter, record, cone, { origin: { column: 8, row: 8 }, direction: "e" })).toEqual({
      ok: false,
      reason: "originOutOfRange",
    });
    expect(areaSquares(encounter, record, cone, { origin: { column: 6, row: 6 } })).toEqual({
      ok: false,
      reason: "directionRequired",
    });
    const sphere: AreaSpec = { shape: "sphere", sizeFeet: 10, rangeFeet: 10 };
    // A 20 pies del espacio del actor (alcance 10): fuera de alcance.
    expect(areaSquares(encounter, record, sphere, { origin: { column: 10, row: 10 } })).toMatchObject({ ok: false });
    expect(areaSquares(encounter, record, sphere, { origin: { column: 30, row: 2 } })).toEqual({
      ok: false,
      reason: "originOutOfMap",
    });
    expect(areaSquares(encounter, record, { shape: "emanation", sizeFeet: 5, rangeFeet: 0 }, { origin: { column: 5, row: 5 } })).toEqual({
      ok: false,
      reason: "originNotAllowed",
    });
  });

  it("criaturas en el área: basta con una casilla de su espacio; el creador queda fuera", () => {
    const { encounter } = setup();
    const big = { ...goblin, id: asCreatureId("big"), size: "large" as const };
    const withBig = engine.addCombatant(encounter, big, { column: 8, row: 5 });
    expect(creaturesInSquares(withBig, [{ column: 9, row: 6 }, { column: 5, row: 5 }], asCreatureId("actor"))).toEqual(["big"]);
    expect(creaturesInSquares(withBig, [{ column: 5, row: 5 }], null)).toEqual(["actor"]);
  });
});
