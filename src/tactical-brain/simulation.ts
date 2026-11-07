import type { AttackId, CreatureId, Encounter } from "../models";
// Solo tipos del motor (diseño aprobado + ajuste técnico: el cerebro nombra
// los tipos de las órdenes, pero no puede ejecutar ninguna regla).
import type {
  AreaPlacementCandidate,
  ReachableSquare,
  TurnCommand,
  TurnCommandResult,
  TurnOptions,
  TurnState,
} from "../rules";

/** Probabilidades estimadas de un ataque con lo que sabe el bando (CA estimada, defensas conocidas). */
export interface EstimatedAttackOdds {
  readonly hitChance: number;
  readonly critChance: number;
  readonly expectedDamage: number;
  /** Cuántas CA posibles se promediaron (0 = CA desconocida y sin supuesto: no se puede estimar). */
  readonly armorClassSamples: number;
}

/**
 * PUERTO DE SIMULACIÓN (diseño aprobado, TACTICAL_BRAIN_DESIGN.md §1): lo
 * implementa el controlador con las reglas reales aplicadas al ESTADO CREÍDO.
 * El cerebro nunca recibe el estado real ni tira dados reales.
 */
export interface SimulationPort {
  /** Estado creído inicial del bando del actor. */
  readonly belief: Encounter;
  getOptions(state: Encounter, turn: TurnState): TurnOptions;
  reachable(state: Encounter, turn: TurnState): readonly ReachableSquare[];
  areaPlacements(state: Encounter, turn: TurnState, key: string, limit?: number): readonly AreaPlacementCandidate[];
  effectTargets(state: Encounter, turn: TurnState, key: string): readonly CreatureId[];
  /** Aplica una orden con dados "esperados" (deterministas) sobre un estado creído. */
  apply(state: Encounter, turn: TurnState, command: TurnCommand): TurnCommandResult;
  /** Probabilidades de un ataque con la CA estimada (promediando el intervalo conocido). */
  attackOdds(state: Encounter, attackerId: CreatureId, attackId: AttackId, targetId: CreatureId): EstimatedAttackOdds | null;
}
