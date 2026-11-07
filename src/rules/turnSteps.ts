import type {
  AttackDefinition,
  CombatantRecord,
  CreatureId,
  Encounter,
  GridPosition,
} from "../models";
import { footprintDistanceSquares } from "./distance";
import { stepCost } from "./movement";
import { validateGridSquare, validatePassage } from "./placement";
import type { PlacementReason } from "./placement";

/**
 * Comprobaciones de un paso de turno compartidas por `validateTurnPlan`
 * (validación de un plan completo) y el ejecutor paso a paso
 * (`turnExecution.ts`). Una sola implementación de cada regla.
 */

/** Movimiento recorrido en el turno hasta ahora. */
export interface MovementProgress {
  readonly position: GridPosition;
  /** Diagonales recorridas en el turno (regla casera 1-2-1-2). */
  readonly diagonalCount: number;
  readonly spentFeet: number;
}

export type MovementCheck =
  | { readonly ok: true; readonly progress: MovementProgress }
  | {
      readonly ok: false;
      readonly reasonCode: "emptyPath" | "invalidSquare" | "notAdjacent" | "movementExceedsSpeed";
      readonly placementReason?: PlacementReason;
    };

/**
 * Recorre `path` desde `progress`: cada casilla dentro del mapa, adyacente a
 * la anterior, con el coste de la convención diagonal del encuentro, por
 * donde la criatura puede pasar (regla casera: se atraviesan Diminutas,
 * Pequeñas y Medianas; Grandes o mayores bloquean), sin superar
 * `budgetFeet` (null = sin Velocidad registrada, no se valida el presupuesto).
 * No exige que la casilla final esté libre: eso se comprueba al terminar el turno.
 */
export function advanceMovement(
  encounter: Encounter,
  actor: CombatantRecord,
  progress: MovementProgress,
  path: readonly GridPosition[],
  budgetFeet: number | null,
): MovementCheck {
  if (path.length === 0) return { ok: false, reasonCode: "emptyPath" };
  const { feetPerSquare, diagonalRule } = encounter.grid;

  let from = progress.position;
  let squares = 0;
  let count = progress.diagonalCount;
  for (const square of path) {
    const bounds = validateGridSquare(encounter, square);
    if (!bounds.valid) return { ok: false, reasonCode: "invalidSquare", placementReason: bounds.reason };

    const move = stepCost(from, square, diagonalRule, count);
    if (!move.valid) return { ok: false, reasonCode: "notAdjacent" };

    const passage = validatePassage(encounter, square, actor.definition.size, {
      ignoreCreatureId: actor.definition.id,
    });
    if (!passage.valid) return { ok: false, reasonCode: "invalidSquare", placementReason: passage.reason };

    squares += move.cost;
    count = move.diagonalCount;
    from = square;
  }

  const spentFeet = progress.spentFeet + squares * feetPerSquare;
  if (budgetFeet !== null && spentFeet > budgetFeet) {
    return { ok: false, reasonCode: "movementExceedsSpeed" };
  }
  return { ok: true, progress: { position: from, diagonalCount: count, spentFeet } };
}

export type AttackTargetCheck =
  | {
      readonly ok: true;
      readonly attack: AttackDefinition;
      readonly target: CombatantRecord;
      readonly distanceFeet: number;
      /**
       * A distancia y más allá del alcance normal (REGLA OFICIAL VERIFICADA,
       * Basic Rules 2024 "Ranged Attacks"): la tirada tiene Desventaja.
       */
      readonly beyondNormalRange: boolean;
    }
  | {
      readonly ok: false;
      readonly reasonCode: "unknownAttack" | "unknownTarget" | "invalidTarget" | "targetOutOfRange";
    };

/**
 * Un ataque concreto contra un objetivo desde `position`: el ataque existe en
 * la criatura, el objetivo existe y no es el atacante, y está dentro del
 * alcance (cuerpo a cuerpo) o del alcance largo (a distancia).
 */
export function checkAttackTarget(
  encounter: Encounter,
  actor: CombatantRecord,
  position: GridPosition,
  attackId: string,
  targetId: CreatureId,
): AttackTargetCheck {
  const { definition } = actor;
  const attack = definition.attacks.find((a) => a.id === attackId);
  if (!attack) return { ok: false, reasonCode: "unknownAttack" };

  const target = encounter.combatants[targetId];
  if (!target) return { ok: false, reasonCode: "unknownTarget" };
  if (targetId === definition.id) return { ok: false, reasonCode: "invalidTarget" };

  const distanceFeet =
    footprintDistanceSquares(
      position,
      definition.size,
      target.state.position,
      target.definition.size,
      encounter.grid.diagonalRule,
    ) * encounter.grid.feetPerSquare;
  const maxFeet =
    attack.mode === "melee" ? attack.rangeFeet.normal : (attack.rangeFeet.long ?? attack.rangeFeet.normal);
  if (distanceFeet > maxFeet) return { ok: false, reasonCode: "targetOutOfRange" };

  return {
    ok: true,
    attack,
    target,
    distanceFeet,
    beyondNormalRange: attack.mode === "ranged" && distanceFeet > attack.rangeFeet.normal,
  };
}
