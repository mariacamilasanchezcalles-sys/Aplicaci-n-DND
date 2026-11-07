import type { AttackId, CreatureId, Encounter } from "../models";
// Solo tipos del motor (diseño aprobado + ajuste técnico: el cerebro nombra
// los tipos de las órdenes, pero no puede ejecutar ninguna regla).
import type {
  AreaPlacementCandidate,
  EffectInput,
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
  /** Empieza el turno de una criatura en un estado creído (sin dados). */
  startTurn(state: Encounter, actorId: CreatureId): TurnState;
  /**
   * Enemigos que podrán atacar a `targetId` en su próximo turno (con su
   * Velocidad conocida o supuesta) y el daño esperado de su mejor ataque.
   */
  incomingThreats(state: Encounter, targetId: CreatureId): readonly IncomingThreat[];
  /** Distancia en pies entre dos criaturas (regla diagonal de la mesa). */
  distanceFeet(state: Encounter, a: CreatureId, b: CreatureId): number | null;
  /** ¿`attackerId` flanquea a `targetId`? (regla casera de la mesa, si está activa). */
  flanks(state: Encounter, attackerId: CreatureId, targetId: CreatureId): boolean;
  /**
   * Probabilidades de una opción de efecto con unos datos (objetivos o
   * colocación): por criatura afectada, probabilidad de fallar la salvación,
   * daño esperado y probabilidad de cada condición. null si no es válida.
   */
  effectOdds(state: Encounter, turn: TurnState, key: string, input: EffectInput): readonly EffectTargetOdds[] | null;
}

export interface EffectTargetOdds {
  readonly targetId: CreatureId;
  /** Del mismo bando que el actor (fuego amigo). */
  readonly ally: boolean;
  readonly saveFailChance: number;
  readonly expectedDamage: number;
  /** Probabilidad de que se le aplique alguna condición. */
  readonly conditionChance: number;
}

export interface IncomingThreat {
  readonly enemyId: CreatureId;
  readonly expectedDamage: number;
  readonly hitChance: number;
}
