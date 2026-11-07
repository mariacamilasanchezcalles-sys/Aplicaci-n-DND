import type { CreatureSize, DiagonalRule, GridPosition } from "../models";
import { squaresOf } from "./size";

/**
 * Distancia en casillas entre dos casillas por la ruta más corta, según la
 * convención diagonal del encuentro.
 *
 * `standard`: cada paso, recto o diagonal, cuesta 1: la distancia es max(dx, dy).
 * `alternating-1-2`: con dx >= dy, el camino más corto usa dy diagonales
 * (costes 1,2,1,2,...) y (dx - dy) pasos rectos. Coste = dx + floor(dy / 2).
 */
export function squareDistance(
  a: GridPosition,
  b: GridPosition,
  rule: DiagonalRule,
): number {
  const dx = Math.abs(a.column - b.column);
  const dy = Math.abs(a.row - b.row);
  const major = Math.max(dx, dy);
  const minor = Math.min(dx, dy);
  switch (rule) {
    case "standard":
      return major;
    case "alternating-1-2":
      return major + Math.floor(minor / 2);
  }
}

/**
 * Distancia mínima entre los espacios de dos criaturas (casilla más cercana
 * de cada una). PENDIENTE: confirmar esta forma de medir con criaturas de
 * más de una casilla.
 */
export function footprintDistanceSquares(
  positionA: GridPosition,
  sizeA: CreatureSize,
  positionB: GridPosition,
  sizeB: CreatureSize,
  rule: DiagonalRule,
): number {
  let best = Number.POSITIVE_INFINITY;
  for (const a of squaresOf(positionA, sizeA)) {
    for (const b of squaresOf(positionB, sizeB)) {
      best = Math.min(best, squareDistance(a, b, rule));
    }
  }
  return best;
}
