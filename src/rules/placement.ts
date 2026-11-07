import type { CreatureId, CreatureSize, Encounter, GridPosition } from "../models";
import { FOOTPRINT_SIDE, squaresOf } from "./size";

/** Motivos por los que una posición no es válida. Son códigos, no texto libre. */
export type PlacementReason = "notInteger" | "outOfBounds" | "occupied" | "blocked";

/**
 * Tamaños de criatura que se pueden atravesar (regla de mesa del proyecto):
 * Diminuta, Pequeña y Mediana. Las Grandes, Enormes y Gargantuescas bloquean
 * el paso. Cuenta el tamaño de la criatura atravesada.
 */
export const PASSABLE_SIZES: ReadonlySet<CreatureSize> = new Set<CreatureSize>([
  "tiny",
  "small",
  "medium",
]);

export type PlacementResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: PlacementReason };

export interface PlacementOptions {
  /** Criatura que se ignora al comprobar ocupación (p. ej. la que se mueve). */
  readonly ignoreCreatureId?: CreatureId;
}

/** Criatura cuyo espacio contiene la casilla, o null. */
export function findCreatureAt(
  encounter: Encounter,
  square: GridPosition,
  ignoreCreatureId?: CreatureId,
): CreatureId | null {
  for (const record of Object.values(encounter.combatants)) {
    if (record.definition.id === ignoreCreatureId) continue;
    const origin = record.state.position;
    const side = FOOTPRINT_SIDE[record.definition.size];
    if (
      square.column >= origin.column &&
      square.column < origin.column + side &&
      square.row >= origin.row &&
      square.row < origin.row + side
    ) {
      return record.definition.id;
    }
  }
  return null;
}

/** Comprueba que una casilla es entera y está dentro del mapa (coordenadas desde 0). */
export function validateGridSquare(
  encounter: Encounter,
  square: GridPosition,
): PlacementResult {
  if (!Number.isInteger(square.column) || !Number.isInteger(square.row)) {
    return { valid: false, reason: "notInteger" };
  }
  const { columns, rows } = encounter.grid.dimensions;
  if (
    square.column < 0 ||
    square.row < 0 ||
    square.column >= columns ||
    square.row >= rows
  ) {
    return { valid: false, reason: "outOfBounds" };
  }
  return { valid: true };
}

/**
 * Todo el espacio de una criatura de cierto tamaño está dentro del mapa y en
 * casillas enteras. No mira ocupación (se puede pasar por casillas ocupadas).
 */
export function validateFootprintInBounds(
  encounter: Encounter,
  position: GridPosition,
  size: CreatureSize,
): PlacementResult {
  for (const square of squaresOf(position, size)) {
    const check = validateGridSquare(encounter, square);
    if (!check.valid) return check;
  }
  return { valid: true };
}

/**
 * Posición por la que una criatura puede PASAR (o detenerse a mitad de turno):
 * todo su espacio dentro del mapa y sin cubrir a ninguna criatura que bloquee
 * el paso (Grande o mayor). Cubrir a una criatura Diminuta, Pequeña o Mediana
 * está permitido.
 */
export function validatePassage(
  encounter: Encounter,
  position: GridPosition,
  size: CreatureSize,
  options: PlacementOptions = {},
): PlacementResult {
  const inBounds = validateFootprintInBounds(encounter, position, size);
  if (!inBounds.valid) return inBounds;

  for (const square of squaresOf(position, size)) {
    const blockerId = findCreatureAt(encounter, square, options.ignoreCreatureId);
    if (blockerId === null) continue;
    const blocker = encounter.combatants[blockerId];
    if (!blocker) continue;
    switch (encounter.tableRules.movementThroughCreatures) {
      case "houseSmallOrMedium":
        if (!PASSABLE_SIZES.has(blocker.definition.size)) return { valid: false, reason: "blocked" };
        break;
    }
  }
  return { valid: true };
}

/**
 * Posición donde una criatura puede TERMINAR EL TURNO: todo su espacio dentro del
 * mapa y sin solaparse con otra criatura (política de ocupación del
 * encuentro). `position` es la esquina superior izquierda de su espacio.
 */
export function validatePlacement(
  encounter: Encounter,
  position: GridPosition,
  size: CreatureSize,
  options: PlacementOptions = {},
): PlacementResult {
  const inBounds = validateFootprintInBounds(encounter, position, size);
  if (!inBounds.valid) return inBounds;
  const squares = squaresOf(position, size);

  switch (encounter.occupancyPolicy) {
    case "one-creature-per-space":
      for (const square of squares) {
        if (findCreatureAt(encounter, square, options.ignoreCreatureId) !== null) {
          return { valid: false, reason: "occupied" };
        }
      }
      return { valid: true };
  }
}

export class PlacementError extends Error {
  readonly reason: PlacementReason;

  constructor(reason: PlacementReason) {
    super(`Posición no válida: ${reason}`);
    this.name = "PlacementError";
    this.reason = reason;
  }
}
