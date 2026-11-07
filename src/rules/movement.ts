import type { DiagonalRule, GridPosition } from "../models";

export type StepCostResult =
  | {
      readonly valid: true;
      /** Casillas de movimiento que cuesta este paso. */
      readonly cost: number;
      /** Diagonales acumuladas en el turno tras este paso. */
      readonly diagonalCount: number;
    }
  | { readonly valid: false };

/**
 * Coste de un paso a una casilla adyacente (ortogonal o diagonal).
 *
 * `alternating-1-2`: los pasos rectos cuestan 1 y no afectan a la cuenta;
 * las diagonales cuestan 1, 2, 1, 2... según cuántas se llevan en el turno.
 * `diagonalCountBefore` es el número de diagonales ya recorridas ese turno.
 */
export function stepCost(
  from: GridPosition,
  to: GridPosition,
  rule: DiagonalRule,
  diagonalCountBefore: number,
): StepCostResult {
  const dx = Math.abs(to.column - from.column);
  const dy = Math.abs(to.row - from.row);
  if (dx > 1 || dy > 1 || (dx === 0 && dy === 0)) return { valid: false };

  const diagonal = dx === 1 && dy === 1;
  if (!diagonal) return { valid: true, cost: 1, diagonalCount: diagonalCountBefore };

  switch (rule) {
    case "alternating-1-2":
      return {
        valid: true,
        cost: diagonalCountBefore % 2 === 0 ? 1 : 2,
        diagonalCount: diagonalCountBefore + 1,
      };
  }
}
