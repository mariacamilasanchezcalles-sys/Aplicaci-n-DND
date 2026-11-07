/**
 * Posición en la cuadrícula. Las coordenadas empiezan en CERO: la primera
 * columna es 0 y la primera fila es 0. Para criaturas de más de una casilla,
 * la posición es la casilla de la esquina superior izquierda (columna y fila
 * menores) de su espacio. PENDIENTE de confirmar esa convención de ancla.
 */
export interface GridPosition {
  readonly column: number;
  readonly row: number;
}

/**
 * Dimensiones explícitas del mapa, en columnas y filas.
 * PENDIENTE: elegir las dimensiones definitivas. El área VISIBLE en pantalla
 * (5 x 9 casillas, con desplazamiento y zoom) es un requisito de interfaz y
 * no forma parte de estas dimensiones (ver docs/UI_REQUIREMENTS.md).
 */
export interface GridDimensions {
  readonly columns: number;
  readonly rows: number;
}

export type TerrainKind = "open";

/**
 * Convención de coste de las casillas en diagonal.
 *
 * - `alternating-1-2`: decisión de diseño del proyecto. La primera diagonal
 *   del turno cuenta 1 casilla, la segunda 2, la tercera 1, la cuarta 2, etc.
 *   Los movimientos ortogonales cuestan 1 y no afectan a la cuenta. NO es la
 *   regla base del SRD 5.2.1 / Basic Rules 2024 (allí la diagonal cuesta 1).
 */
export type DiagonalRule = "alternating-1-2";

export interface GridConfig {
  /** Pies por casilla (5 en el escenario inicial). */
  readonly feetPerSquare: number;
  readonly terrain: TerrainKind;
  readonly dimensions: GridDimensions;
  readonly diagonalRule: DiagonalRule;
}
