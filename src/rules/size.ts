import type { CreatureSize, GridPosition } from "../models";

/**
 * Lado de la huella cuadrada de cada tamaño, en casillas (SRD 5.2.1 /
 * Basic Rules 2024, "Creature Size and Space"): Pequeña y Mediana 1x1,
 * Grande 2x2, Enorme 3x3, Gargantuesca 4x4.
 *
 * PENDIENTE: Diminuta. El manual permite 4 criaturas Diminutas por casilla;
 * aquí ocupa 1 casilla exclusiva.
 */
export const FOOTPRINT_SIDE: Readonly<Record<CreatureSize, number>> = {
  tiny: 1,
  small: 1,
  medium: 1,
  large: 2,
  huge: 3,
  gargantuan: 4,
};

/** Casillas que ocupa una criatura cuya esquina superior izquierda es `position`. */
export function squaresOf(position: GridPosition, size: CreatureSize): GridPosition[] {
  const side = FOOTPRINT_SIDE[size];
  const squares: GridPosition[] = [];
  for (let dRow = 0; dRow < side; dRow++) {
    for (let dColumn = 0; dColumn < side; dColumn++) {
      squares.push({ column: position.column + dColumn, row: position.row + dRow });
    }
  }
  return squares;
}
