import type {
  AttackId,
  BonusActionActionType,
  BonusActionId,
  CombatantDefinition,
  CreatureId,
  CreatureSize,
  Encounter,
  GridPosition,
  StandardActionType,
} from "../models";
import { squaresOf } from "../rules";

/**
 * Vistas de solo lectura para la interfaz. Son datos copiados del encuentro
 * o calculados por el motor (`squaresOf`); aquí no se decide ninguna regla.
 */

export interface CreatureView {
  readonly id: CreatureId;
  readonly label: string;
  readonly kind: CombatantDefinition["kind"];
  /** Bando en combate (aliados = mismo bando). */
  readonly side: string;
  readonly size: CreatureSize;
  /** Esquina superior izquierda de su espacio (coordenadas desde 0). */
  readonly position: GridPosition;
  /** Casillas que ocupa según el motor de reglas. */
  readonly squares: readonly GridPosition[];
  readonly currentHitPoints: number | null;
  readonly maxHitPoints: number | null;
  readonly armorClass: number | null;
  readonly speedFeet: number | null;
}

export interface MapView {
  readonly encounterId: Encounter["id"];
  readonly encounterLabel: string;
  readonly columns: number;
  readonly rows: number;
  readonly feetPerSquare: number;
  readonly creatures: readonly CreatureView[];
}

export function buildMapView(encounter: Encounter): MapView {
  return {
    encounterId: encounter.id,
    encounterLabel: encounter.label,
    columns: encounter.grid.dimensions.columns,
    rows: encounter.grid.dimensions.rows,
    feetPerSquare: encounter.grid.feetPerSquare,
    creatures: Object.values(encounter.combatants).map(({ definition, side, state }) => ({
      id: definition.id,
      label: definition.label,
      kind: definition.kind,
      side,
      size: definition.size,
      position: state.position,
      squares: squaresOf(state.position, definition.size),
      currentHitPoints: state.currentHitPoints,
      maxHitPoints: definition.stats.maxHitPoints ?? null,
      armorClass: definition.stats.armorClass ?? null,
      speedFeet: definition.stats.speedFeet ?? null,
    })),
  };
}

/**
 * Todas las acciones estándar del modelo, en orden de presentación. Es una
 * lista de nombres (datos), no una regla: la legalidad de cada una la decide
 * `validateTurnPlan` (p. ej. `actionNotYetModeled`). El `Record` obliga a que
 * la lista cubra el tipo completo.
 */
const STANDARD_ACTION_ORDER: Readonly<Record<StandardActionType, number>> = {
  attack: 0,
  dash: 1,
  disengage: 2,
  dodge: 3,
  hide: 4,
  help: 5,
  influence: 6,
  magic: 7,
  ready: 8,
  search: 9,
  study: 10,
  utilize: 11,
};

export const STANDARD_ACTION_TYPES: readonly StandardActionType[] = (
  Object.keys(STANDARD_ACTION_ORDER) as StandardActionType[]
).sort((a, b) => STANDARD_ACTION_ORDER[a] - STANDARD_ACTION_ORDER[b]);

export interface AttackMenuItem {
  readonly id: AttackId;
  readonly label: string;
  readonly mode: "melee" | "ranged";
  readonly rangeNormalFeet: number;
  readonly rangeLongFeet: number | null;
}

export interface BonusActionMenuItem {
  readonly id: BonusActionId;
  readonly label: string;
  readonly allowedActions: readonly BonusActionActionType[];
}

export interface TargetMenuItem {
  readonly id: CreatureId;
  readonly label: string;
}

/** Opciones que la criatura tiene en sus datos. Elegirlas no las hace legales. */
export interface TurnMenu {
  readonly actorId: CreatureId;
  readonly actorLabel: string;
  readonly standardActions: readonly StandardActionType[];
  readonly attacks: readonly AttackMenuItem[];
  readonly bonusActions: readonly BonusActionMenuItem[];
  readonly targets: readonly TargetMenuItem[];
}

export function buildTurnMenu(encounter: Encounter, actorId: string): TurnMenu {
  const actor = encounter.combatants[actorId];
  if (!actor) throw new Error(`Criatura no encontrada: ${actorId}`);
  const { definition } = actor;
  return {
    actorId: definition.id,
    actorLabel: definition.label,
    standardActions: STANDARD_ACTION_TYPES,
    attacks: definition.attacks.map((attack) => ({
      id: attack.id,
      label: attack.label,
      mode: attack.mode,
      rangeNormalFeet: attack.rangeFeet.normal,
      rangeLongFeet: attack.rangeFeet.long ?? null,
    })),
    bonusActions: definition.bonusActions.map((bonus) => ({
      id: bonus.id,
      label: bonus.label,
      allowedActions: bonus.allowedActions,
    })),
    // Todas las demás criaturas; si el objetivo es válido lo decide el motor.
    targets: Object.values(encounter.combatants)
      .filter((record) => record.definition.id !== definition.id)
      .map((record) => ({ id: record.definition.id, label: record.definition.label })),
  };
}
