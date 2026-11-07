import type {
  AreaShape,
  CombatantRecord,
  CreatureId,
  Direction8,
  Encounter,
  GridIntersection,
  GridPosition,
} from "../models";
import { squareDistance } from "./distance";
import { FOOTPRINT_SIDE, squaresOf } from "./size";

/**
 * ÁREAS DE EFECTO SOBRE LA CUADRÍCULA.
 *
 * Las formas son REGLA OFICIAL VERIFICADA (Glosario 2024): Cono (anchura en
 * cada punto igual a su distancia al origen), Cubo, Cilindro, Emanación
 * (desde una criatura en todas direcciones), Línea y Esfera (radio).
 *
 * Las reglas 2024 NO dicen qué casillas cubre un área. REGLA CASERA de la
 * mesa (Guía del DM 2014, "Áreas de efecto", DECISIÓN CONFIRMADA
 * 2026-11-07): el origen es una intersección entre casillas y una casilla
 * está afectada si el área cubre al menos la MITAD de ella. Se aplica a todas
 * las formas.
 *
 * Unidades: casillas (pies / 5). La casilla (c, f) ocupa [c, c+1] x [f, f+1].
 * La mitad se mide con un muestreo determinista de SAMPLES x SAMPLES puntos
 * por casilla (PROPUESTA de implementación: exacto para las formas de bordes
 * rectos alineados; aproximado en círculos y diagonales).
 */
const SAMPLES = 16;

export interface AreaSpec {
  readonly shape: AreaShape;
  readonly sizeFeet: number;
  readonly rangeFeet: number;
  readonly widthFeet?: number;
}

/** Dónde se coloca un área. La emanación no se coloca: sale de la criatura. */
export interface AreaPlacement {
  readonly origin?: GridIntersection;
  /** Cono y línea: una de 8 direcciones. Cubo: diagonal (cuadrante hacia el que crece). */
  readonly direction?: Direction8;
}

export type AreaPlacementError =
  | "originRequired"
  | "originNotAllowed"
  | "originOutOfMap"
  | "originOutOfRange"
  | "directionRequired"
  | "directionNotAllowed";

export type AreaResult =
  | { readonly ok: true; readonly squares: readonly GridPosition[] }
  | { readonly ok: false; readonly reason: AreaPlacementError };

const DIRECTION_VECTOR: Readonly<Record<Direction8, readonly [number, number]>> = {
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
  nw: [-1, -1],
};

const isDiagonal = (direction: Direction8): boolean => direction.length === 2;

/** Rectángulo del espacio de una criatura, en coordenadas de intersección. */
function footprintBox(record: CombatantRecord): { x0: number; y0: number; x1: number; y1: number } {
  const side = FOOTPRINT_SIDE[record.definition.size];
  const { column, row } = record.state.position;
  return { x0: column, y0: row, x1: column + side, y1: row + side };
}

/** Distancia (en casillas, con la regla diagonal de la mesa) de una intersección al espacio de la criatura. */
function intersectionDistance(encounter: Encounter, record: CombatantRecord, point: GridIntersection): number {
  const box = footprintBox(record);
  const dx = Math.max(0, box.x0 - point.column, point.column - box.x1);
  const dy = Math.max(0, box.y0 - point.row, point.row - box.y1);
  return squareDistance({ column: 0, row: 0 }, { column: dx, row: dy }, encounter.tableRules.diagonal);
}

/**
 * Casillas afectadas por un área colocada por `actor`. Valida la colocación:
 * con alcance 0 el origen debe estar en el borde del espacio de la criatura;
 * con alcance mayor, a esa distancia o menos.
 */
export function areaSquares(
  encounter: Encounter,
  actor: CombatantRecord,
  spec: AreaSpec,
  placement: AreaPlacement,
): AreaResult {
  const size = spec.sizeFeet / encounter.grid.feetPerSquare;
  const box = footprintBox(actor);
  let inside: (x: number, y: number) => boolean;
  let reach: { x0: number; y0: number; x1: number; y1: number };

  if (spec.shape === "emanation") {
    if (placement.origin !== undefined) return { ok: false, reason: "originNotAllowed" };
    if (placement.direction !== undefined) return { ok: false, reason: "directionNotAllowed" };
    inside = (x, y) => {
      const dx = Math.max(0, box.x0 - x, x - box.x1);
      const dy = Math.max(0, box.y0 - y, y - box.y1);
      return dx * dx + dy * dy <= size * size;
    };
    reach = { x0: box.x0 - size, y0: box.y0 - size, x1: box.x1 + size, y1: box.y1 + size };
  } else {
    const origin = placement.origin;
    if (origin === undefined) return { ok: false, reason: "originRequired" };
    const { columns, rows } = encounter.grid.dimensions;
    if (
      !Number.isInteger(origin.column) ||
      !Number.isInteger(origin.row) ||
      origin.column < 0 ||
      origin.row < 0 ||
      origin.column > columns ||
      origin.row > rows
    ) {
      return { ok: false, reason: "originOutOfMap" };
    }
    if (spec.rangeFeet === 0) {
      // Desde la propia criatura: el origen está en el borde de su espacio.
      const onEdge =
        origin.column >= box.x0 &&
        origin.column <= box.x1 &&
        origin.row >= box.y0 &&
        origin.row <= box.y1 &&
        (origin.column === box.x0 || origin.column === box.x1 || origin.row === box.y0 || origin.row === box.y1);
      if (!onEdge) return { ok: false, reason: "originOutOfRange" };
    } else if (intersectionDistance(encounter, actor, origin) * encounter.grid.feetPerSquare > spec.rangeFeet) {
      return { ok: false, reason: "originOutOfRange" };
    }

    const ox = origin.column;
    const oy = origin.row;
    switch (spec.shape) {
      case "sphere":
      case "cylinder": {
        if (placement.direction !== undefined) return { ok: false, reason: "directionNotAllowed" };
        inside = (x, y) => (x - ox) ** 2 + (y - oy) ** 2 <= size * size;
        reach = { x0: ox - size, y0: oy - size, x1: ox + size, y1: oy + size };
        break;
      }
      case "cube": {
        const direction = placement.direction;
        if (direction === undefined) return { ok: false, reason: "directionRequired" };
        // PROPUESTA: el origen es una esquina de una cara y el cubo crece en diagonal.
        if (!isDiagonal(direction)) return { ok: false, reason: "directionNotAllowed" };
        const [sx, sy] = DIRECTION_VECTOR[direction];
        const xa = Math.min(ox, ox + sx * size);
        const xb = Math.max(ox, ox + sx * size);
        const ya = Math.min(oy, oy + sy * size);
        const yb = Math.max(oy, oy + sy * size);
        inside = (x, y) => x >= xa && x <= xb && y >= ya && y <= yb;
        reach = { x0: xa, y0: ya, x1: xb, y1: yb };
        break;
      }
      case "cone":
      case "line": {
        const direction = placement.direction;
        if (direction === undefined) return { ok: false, reason: "directionRequired" };
        const [vx, vy] = DIRECTION_VECTOR[direction];
        const norm = Math.hypot(vx, vy);
        const ux = vx / norm;
        const uy = vy / norm;
        const halfWidth = spec.shape === "line" ? (spec.widthFeet ?? 5) / encounter.grid.feetPerSquare / 2 : 0;
        inside = (x, y) => {
          const px = x - ox;
          const py = y - oy;
          const along = px * ux + py * uy;
          const across = Math.abs(px * uy - py * ux);
          if (along < 0 || along > size) return false;
          // Cono: anchura igual a la distancia al origen (regla verificada).
          return spec.shape === "cone" ? across <= along / 2 : across <= halfWidth;
        };
        const extent = size + halfWidth;
        reach = { x0: ox - extent, y0: oy - extent, x1: ox + extent, y1: oy + extent };
        break;
      }
    }
  }

  const { columns, rows } = encounter.grid.dimensions;
  const squares: GridPosition[] = [];
  for (let row = Math.max(0, Math.floor(reach.y0)); row < Math.min(rows, Math.ceil(reach.y1)); row++) {
    for (let column = Math.max(0, Math.floor(reach.x0)); column < Math.min(columns, Math.ceil(reach.x1)); column++) {
      let covered = 0;
      for (let i = 0; i < SAMPLES; i++) {
        for (let j = 0; j < SAMPLES; j++) {
          if (inside(column + (i + 0.5) / SAMPLES, row + (j + 0.5) / SAMPLES)) covered++;
        }
      }
      switch (encounter.tableRules.areaTemplate) {
        case "halfSquareDmg2014":
          if (covered * 2 >= SAMPLES * SAMPLES) squares.push({ column, row });
          break;
      }
    }
  }
  return { ok: true, squares };
}

/**
 * Criaturas dentro del área: las que tienen al menos una casilla de su
 * espacio afectada (PROPUESTA). La criatura que crea el área queda fuera
 * salvo `includesSelf`. Orden determinista por id.
 */
export function creaturesInSquares(
  encounter: Encounter,
  squares: readonly GridPosition[],
  excludeId: CreatureId | null,
): CreatureId[] {
  const keys = new Set(squares.map((s) => `${s.column},${s.row}`));
  return Object.values(encounter.combatants)
    .filter((record) => record.definition.id !== excludeId)
    .filter((record) =>
      squaresOf(record.state.position, record.definition.size).some((s) => keys.has(`${s.column},${s.row}`)),
    )
    .map((record) => record.definition.id)
    .sort();
}
