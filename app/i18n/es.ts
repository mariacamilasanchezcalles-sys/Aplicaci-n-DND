import type {
  CreatureSize,
  IllegalReason,
  LegalityResult,
  PlacementReason,
  StandardActionType,
} from "../../src/ui-bridge";

/**
 * Textos en español. Solo PRESENTACIÓN: traduce códigos del núcleo a frases.
 * Los `Record` obligan a traducir todos los códigos; si el núcleo añade uno,
 * la compilación falla aquí.
 */

export const ACTION_LABEL: Readonly<Record<StandardActionType, string>> = {
  attack: "Atacar",
  dash: "Correr",
  disengage: "Destrabarse",
  dodge: "Esquivar",
  help: "Ayudar",
  hide: "Esconderse",
  influence: "Influir",
  magic: "Magia",
  ready: "Preparar",
  search: "Buscar",
  study: "Estudiar",
  utilize: "Utilizar",
};

export const SIZE_LABEL: Readonly<Record<CreatureSize, string>> = {
  tiny: "Diminuta",
  small: "Pequeña",
  medium: "Mediana",
  large: "Grande",
  huge: "Enorme",
  gargantuan: "Gargantuesca",
};

export const ILLEGAL_REASON: Readonly<Record<IllegalReason, string>> = {
  unknownActor: "La criatura no está en el encuentro",
  multipleActions: "Solo se puede hacer una acción por turno",
  multipleBonusActions: "Solo se puede hacer una acción adicional por turno",
  bonusActionNotGranted: "La criatura no tiene esa acción adicional",
  attackCountInvalid: "Número de ataques no válido para una acción de Atacar",
  unknownAttack: "La criatura no tiene ese ataque",
  unknownTarget: "El objetivo no está en el encuentro",
  invalidTarget: "Objetivo no válido",
  targetOutOfRange: "El objetivo está fuera de alcance desde esa posición",
  emptyPath: "El movimiento no tiene casillas",
  notAdjacent: "Cada casilla del recorrido debe ser vecina de la anterior",
  invalidSquare: "Casilla no válida",
  movementExceedsSpeed: "El recorrido supera la Velocidad disponible",
  actionNotYetModeled: "Esta acción todavía no está modelada en el motor",
};

export const PLACEMENT_REASON: Readonly<Record<PlacementReason, string>> = {
  notInteger: "coordenadas no enteras",
  outOfBounds: "fuera del mapa",
  occupied: "el turno no puede terminar en una casilla ocupada",
  blocked: "una criatura Grande o mayor bloquea el paso",
};

export const STEP_KIND_LABEL = {
  movement: "Movimiento",
  action: "Acción",
  bonusAction: "Acción adicional",
} as const;

/** Frase para el resultado de `validateTurnPlan`. */
export function describeLegality(result: LegalityResult): string {
  if (result.legal) return "Turno legal.";
  const where = result.stepIndex === null ? "" : ` (paso ${result.stepIndex + 1})`;
  const detail =
    result.placementReason === undefined ? "" : `: ${PLACEMENT_REASON[result.placementReason]}`;
  return `No es legal${where}. ${ILLEGAL_REASON[result.reasonCode]}${detail}.`;
}

export function formatFeet(feet: number): string {
  return `${feet} pies`;
}
