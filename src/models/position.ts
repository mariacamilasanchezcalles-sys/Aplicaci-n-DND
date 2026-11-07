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
 * Intersección entre casillas (esquina). La intersección (c, f) es la esquina
 * superior izquierda de la casilla (c, f); van de 0 a columnas/filas incluidos.
 * Las áreas de efecto se originan en intersecciones (regla casera, Guía del
 * DM 2014, "Áreas de efecto").
 */
export interface GridIntersection {
  readonly column: number;
  readonly row: number;
}

/** Ocho direcciones de la cuadrícula; las filas crecen hacia el sur. */
export type Direction8 = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

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
 * Convención de coste de las casillas en diagonal (interruptor de la
 * configuración de mesa, `TableRules.diagonal`).
 *
 * - `standard`: REGLA OFICIAL VERIFICADA (SRD 5.2.1 / Basic Rules 2024,
 *   "Playing on a Grid"): entrar en una casilla adyacente, también en
 *   diagonal, cuesta 1 casilla.
 * - `alternating-1-2`: REGLA CASERA de la mesa ("Regla opcional: Diagonales",
 *   Guía del DM 2014). La primera diagonal del turno cuenta 1 casilla, la
 *   segunda 2, la tercera 1… Los pasos rectos cuestan 1 y no reinician la cuenta.
 */
export type DiagonalRule = "standard" | "alternating-1-2";

export interface GridConfig {
  /** Pies por casilla (5 en el escenario inicial). */
  readonly feetPerSquare: number;
  readonly terrain: TerrainKind;
  readonly dimensions: GridDimensions;
}
