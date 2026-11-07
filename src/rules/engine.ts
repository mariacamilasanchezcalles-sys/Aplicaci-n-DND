import type {
  CombatantDefinition,
  CreatureId,
  Encounter,
  EncounterId,
  GridConfig,
  GridPosition,
  LegalActionSet,
  OccupancyPolicy,
  TurnPlan,
} from "../models";
import { PendingImplementationError } from "../models";
import { PlacementError, validatePlacement } from "./placement";
import { validateTurnPlan } from "./turnPlan";
import type { LegalityResult } from "./turnPlan";

/** Edición objetivo. Las mecánicas implementadas están en docs/RULES_VERIFICATION.md. */
export const TARGET_RULESET = "DND_5E_2024" as const;

/** Verificado en SRD 5.2.1 ("Playing on a Grid"): cada casilla son 5 pies. */
export const STANDARD_FEET_PER_SQUARE = 5;

export interface CreateEncounterInput {
  readonly id: EncounterId;
  readonly label: string;
  /** Obligatorio: el mapa tiene dimensiones explícitas (columnas y filas). */
  readonly grid: GridConfig;
  readonly occupancyPolicy: OccupancyPolicy;
}

/**
 * Contrato del motor de reglas. Es la ÚNICA fuente de verdad sobre qué es
 * legal. El cerebro táctico solo recibe lo que `getLegalActions` devuelva.
 */
export interface RulesEngine {
  createEncounter(input: CreateEncounterInput): Encounter;
  addCombatant(
    encounter: Encounter,
    definition: CombatantDefinition,
    position: GridPosition,
  ): Encounter;
  /**
   * PENDIENTE de diseño: ¿el cerebro elige pasos sueltos o turnos completos?
   * Hasta decidirlo no se genera el conjunto de opciones legales.
   */
  getLegalActions(encounter: Encounter, actorId: CreatureId): LegalActionSet;
  /** Valida la economía de acciones del turno; ver `validateTurnPlan` para el alcance. */
  validateTurnPlan(encounter: Encounter, plan: TurnPlan): LegalityResult;
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} debe ser un entero positivo (recibido: ${value})`);
  }
}

export function createRulesEngine(): RulesEngine {
  return {
    createEncounter(input) {
      assertPositiveInteger(input.grid.dimensions.columns, "columns");
      assertPositiveInteger(input.grid.dimensions.rows, "rows");
      assertPositiveInteger(input.grid.feetPerSquare, "feetPerSquare");
      return {
        id: input.id,
        label: input.label,
        grid: input.grid,
        occupancyPolicy: input.occupancyPolicy,
        combatants: {},
        initiativeOrder: [],
        round: 0,
      };
    },

    addCombatant(encounter, definition, position) {
      if (Object.hasOwn(encounter.combatants, definition.id)) {
        throw new Error(`La criatura ya está registrada: ${definition.id}`);
      }
      const placement = validatePlacement(encounter, position, definition.size);
      if (!placement.valid) throw new PlacementError(placement.reason);

      return {
        ...encounter,
        combatants: {
          ...encounter.combatants,
          [definition.id]: {
            definition,
            state: {
              position,
              currentHitPoints: definition.stats.maxHitPoints ?? null,
              resources: [],
            },
          },
        },
      };
    },

    getLegalActions() {
      throw new PendingImplementationError(
        "generación de acciones legales (falta decidir si el cerebro elige pasos sueltos o turnos completos)",
      );
    },

    validateTurnPlan,
  };
}
