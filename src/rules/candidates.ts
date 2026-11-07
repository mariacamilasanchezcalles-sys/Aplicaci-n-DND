import type { CreatureId, Direction8, Encounter, GridIntersection, GridPosition } from "../models";
import { areaSquares, creaturesInSquares } from "./areas";
import type { AreaPlacement } from "./areas";
import { hasCondition } from "./conditions";
import { stepCost } from "./movement";
import { validateGridSquare, validatePassage, validatePlacement } from "./placement";
import { FOOTPRINT_SIDE } from "./size";
import {
  approachesFearSource,
  canMoveNow,
  creatureCandidates,
  effectOperationOf,
} from "./turnExecution";
import type { TurnState } from "./turnExecution";

/**
 * GENERADORES DE CANDIDATOS LEGALES para las opciones con parámetros
 * (diseño aprobado, TACTICAL_BRAIN_DESIGN.md §4). Todo lo que devuelven es
 * legal por construcción con las mismas comprobaciones del ejecutor; aun así,
 * el ejecutor lo revalida al aplicarlo.
 */

export interface ReachableSquare {
  /** Posición final (esquina superior izquierda del espacio). */
  readonly square: GridPosition;
  /** Ruta de menor coste (sin la casilla de origen). */
  readonly path: readonly GridPosition[];
  /** Pies que costaría (incluye arrastrarse si está Derribado). */
  readonly costFeet: number;
  /** Si el turno puede terminar ahí (no es un espacio ocupado). */
  readonly canEndTurnHere: boolean;
}

/**
 * Casillas alcanzables con el movimiento que le queda, por la ruta de menor
 * coste, respetando la regla diagonal de la mesa, el paso entre criaturas,
 * arrastrarse, Asustado y huir. No incluye la casilla actual. No tiene en
 * cuenta los ataques de oportunidad (eso es riesgo, lo evalúa el cerebro).
 */
export function reachableSquares(encounter: Encounter, turn: TurnState): ReachableSquare[] {
  const actor = encounter.combatants[turn.actorId];
  if (!actor || !canMoveNow(turn, actor)) return [];
  const { feetPerSquare } = encounter.grid;
  const rule = encounter.tableRules.diagonal;
  const multiplier = hasCondition(actor, "prone") ? 2 : 1;
  const budget = turn.budgetFeet;
  const start = turn.movement;

  interface Node {
    readonly square: GridPosition;
    readonly diagonalCount: number;
    readonly cost: number;
    readonly path: readonly GridPosition[];
  }
  const keyOf = (s: GridPosition, diagonals: number): string => `${s.column},${s.row},${diagonals % 2}`;
  const best = new Map<string, number>();
  const frontier: Node[] = [{ square: start.position, diagonalCount: start.diagonalCount, cost: start.spentFeet, path: [] }];
  best.set(keyOf(start.position, start.diagonalCount), start.spentFeet);
  const results = new Map<string, ReachableSquare>();

  while (frontier.length > 0) {
    // Cola de prioridad simple y determinista: menor coste, luego fila, luego columna.
    frontier.sort((a, b) => a.cost - b.cost || a.square.row - b.square.row || a.square.column - b.square.column);
    const node = frontier.shift()!;
    if ((best.get(keyOf(node.square, node.diagonalCount)) ?? Infinity) < node.cost) continue;
    for (let dRow = -1; dRow <= 1; dRow++) {
      for (let dColumn = -1; dColumn <= 1; dColumn++) {
        if (dRow === 0 && dColumn === 0) continue;
        const next = { column: node.square.column + dColumn, row: node.square.row + dRow };
        if (!validateGridSquare(encounter, next).valid) continue;
        const step = stepCost(node.square, next, rule, node.diagonalCount);
        if (!step.valid) continue;
        if (!validatePassage(encounter, next, actor.definition.size, { ignoreCreatureId: actor.definition.id }).valid) continue;
        if (approachesFearSource(encounter, actor, [next], node.square)) continue;
        const cost = node.cost + step.cost * feetPerSquare * multiplier;
        if (budget !== null && cost > budget) continue;
        const key = keyOf(next, step.diagonalCount);
        if ((best.get(key) ?? Infinity) <= cost) continue;
        best.set(key, cost);
        const path = [...node.path, next];
        frontier.push({ square: next, diagonalCount: step.diagonalCount, cost, path });
        const squareKey = `${next.column},${next.row}`;
        const previous = results.get(squareKey);
        if (!previous || previous.costFeet > cost - start.spentFeet) {
          results.set(squareKey, {
            square: next,
            path,
            costFeet: cost - start.spentFeet,
            canEndTurnHere: validatePlacement(encounter, next, actor.definition.size, { ignoreCreatureId: actor.definition.id }).valid,
          });
        }
      }
    }
  }
  return [...results.values()].sort((a, b) => a.square.row - b.square.row || a.square.column - b.square.column);
}

export interface AreaPlacementCandidate {
  readonly placement: AreaPlacement;
  /** Criaturas que quedarían dentro (ya sin las muertas ni quien la crea, salvo `includesSelf`). */
  readonly affected: readonly CreatureId[];
}

const ALL_DIRECTIONS: readonly Direction8[] = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
const DIAGONALS: readonly Direction8[] = ["ne", "se", "sw", "nw"];

/**
 * Todas las colocaciones válidas del área de una opción de efecto, con
 * quién quedaría dentro. Orden determinista. `limit` acota cuántas se
 * devuelven (lo fija la dificultad).
 */
export function areaPlacementCandidates(
  encounter: Encounter,
  turn: TurnState,
  key: string,
  limit = Number.MAX_SAFE_INTEGER,
): AreaPlacementCandidate[] {
  const operation = effectOperationOf(encounter, turn, key);
  const actor = encounter.combatants[turn.actorId];
  if (!operation || !actor || operation.targeting.kind !== "area") return [];
  const targeting = operation.targeting;
  const excludeId = targeting.includesSelf ? null : actor.definition.id;
  const affectedOf = (placement: AreaPlacement): CreatureId[] | null => {
    const area = areaSquares(encounter, actor, targeting, placement);
    if (!area.ok) return null;
    return creaturesInSquares(encounter, area.squares, excludeId).filter((id) => encounter.combatants[id]?.state.lifeState !== "dead");
  };

  if (targeting.shape === "emanation") {
    const affected = affectedOf({});
    return affected ? [{ placement: {}, affected }] : [];
  }

  const directions: readonly (Direction8 | undefined)[] =
    targeting.shape === "cone" || targeting.shape === "line"
      ? ALL_DIRECTIONS
      : targeting.shape === "cube"
        ? DIAGONALS
        : [undefined];
  const origins: GridIntersection[] = [];
  const { columns, rows } = encounter.grid.dimensions;
  if (targeting.rangeFeet === 0) {
    const side = FOOTPRINT_SIDE[actor.definition.size];
    const { column, row } = actor.state.position;
    for (let r = row; r <= row + side; r++) {
      for (let c = column; c <= column + side; c++) {
        if (r === row || r === row + side || c === column || c === column + side) origins.push({ column: c, row: r });
      }
    }
  } else {
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= columns; c++) origins.push({ column: c, row: r });
  }

  const result: AreaPlacementCandidate[] = [];
  for (const origin of origins) {
    for (const direction of directions) {
      const placement: AreaPlacement = direction === undefined ? { origin } : { origin, direction };
      const affected = affectedOf(placement);
      if (affected === null) continue;
      result.push({ placement, affected });
      if (result.length >= limit) return result;
    }
  }
  return result;
}

/** Objetivos válidos de una opción de efecto con objetivos elegidos. */
export function effectTargetCandidates(encounter: Encounter, turn: TurnState, key: string): CreatureId[] {
  const operation = effectOperationOf(encounter, turn, key);
  const actor = encounter.combatants[turn.actorId];
  if (!operation || !actor || operation.targeting.kind !== "creatures") return [];
  return creatureCandidates(encounter, actor, operation);
}
