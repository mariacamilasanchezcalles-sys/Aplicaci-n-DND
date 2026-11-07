import type { AttackId, BonusActionId, CreatureId, OptionId } from "./ids";
import type { GridPosition } from "./position";

/**
 * Ranuras de la economía de acciones. Se modelan por separado: el movimiento
 * NO es la acción de Correr (Dash), y un ataque concreto NO es por sí mismo
 * una acción.
 *
 * PENDIENTE: verificar contra las reglas de D&D 5e (2024) la lista exacta de
 * acciones estándar y la legalidad de cada combinación (ver docs/PENDING_DECISIONS.md).
 */
export type ActionSlot = "action" | "bonusAction" | "movement" | "reaction";

/** Acciones estándar (nombres funcionales, no texto libre). Lista por verificar. */
export type StandardActionType =
  | "attack"
  | "dash"
  | "disengage"
  | "dodge"
  | "help"
  | "hide"
  | "influence"
  | "magic"
  | "ready"
  | "search"
  | "study"
  | "utilize";

/** Un ataque concreto elegido contra un objetivo concreto. */
export interface AttackUse {
  readonly attackId: AttackId;
  readonly targetId: CreatureId;
}

/** Movimiento normal: consume velocidad, no consume acción. */
export interface MovementOption {
  readonly slot: "movement";
  /** Casillas recorridas en orden, sin incluir la casilla de origen. */
  readonly path: readonly GridPosition[];
}

/**
 * Acción de Atacar. Contiene uno o varios ataques concretos: cuántos ataques
 * permite una sola acción lo decide el motor de reglas, no este tipo.
 */
export interface AttackActionOption {
  readonly slot: "action";
  readonly actionType: "attack";
  readonly attacks: readonly AttackUse[];
}

/** Resto de acciones estándar (Correr, Destrabarse, Esconderse, ...). */
export interface GenericActionOption {
  readonly slot: "action";
  readonly actionType: Exclude<StandardActionType, "attack">;
}

export type MainActionOption = AttackActionOption | GenericActionOption;

/**
 * Acciones estándar que una acción adicional puede ejecutar. Excluye "attack":
 * un ataque como acción adicional necesitaría sus propios datos de ataque y
 * no está modelado.
 */
export type BonusActionActionType = Exclude<StandardActionType, "attack">;

/**
 * Acción adicional propia de la criatura (p. ej. Escapismo Ágil / Nimble
 * Escape), definida en `CombatantDefinition.bonusActions`. No es un rasgo.
 */
export interface BonusActionOption {
  readonly slot: "bonusAction";
  readonly bonusActionId: BonusActionId;
  readonly actionType: BonusActionActionType;
}

export type ActionOption = MovementOption | MainActionOption | BonusActionOption;

/** Un paso de un turno. El orden de los pasos importa (p. ej. mover, luego atacar). */
export interface TurnPlan {
  readonly actorId: CreatureId;
  readonly steps: readonly ActionOption[];
}

/** Opción que el motor de reglas declara legal y que el cerebro puede evaluar. */
export interface LegalOption {
  readonly optionId: OptionId;
  readonly option: ActionOption;
}

export interface LegalActionSet {
  readonly actorId: CreatureId;
  readonly options: readonly LegalOption[];
}
