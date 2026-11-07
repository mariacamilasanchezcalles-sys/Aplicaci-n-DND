import type {
  CreatureId,
  LegalActionSet,
  OptionId,
  PersonalityId,
} from "../models";
import type { KnowledgeView } from "../perception";

/** Los cuatro factores definidos. La legalidad NO es un factor: es un filtro previo. */
export type TacticalFactor =
  | "personalityPriority"
  | "targetSuitability"
  | "actionEffectiveness"
  | "risk";

/** PENDIENTE: rangos, escalas y pesos. Los valores aquí son solo números opacos. */
export type FactorScores = Partial<Record<TacticalFactor, number>>;

export interface OptionEvaluation {
  readonly optionId: OptionId;
  readonly factors: FactorScores;
  /** PENDIENTE: cómo se combinan los factores. */
  readonly total?: number;
}

export interface TacticalDecisionRequest {
  readonly actorId: CreatureId;
  readonly personality: PersonalityId;
  /** Solo acciones que el motor de reglas ya declaró legales. */
  readonly legalActions: LegalActionSet;
  /** Solo lo que el actor conoce, nunca el estado real completo. */
  readonly knowledge: KnowledgeView;
}

export type TacticalDecisionResult =
  | {
      readonly status: "decided";
      readonly chosenOptionId: OptionId;
      readonly evaluations: readonly OptionEvaluation[];
    }
  | { readonly status: "notImplemented" };

/** Punto de integración del cerebro táctico. */
export interface TacticalBrain {
  decide(request: TacticalDecisionRequest): TacticalDecisionResult;
}

/** Punto de integración vacío: no decide nada hasta aprobar el diseño. */
export const unimplementedTacticalBrain: TacticalBrain = {
  decide() {
    return { status: "notImplemented" };
  },
};

/**
 * Garantiza que el cerebro solo eligió opciones legales. Aplica la decisión
 * de diseño "el cerebro solo puede evaluar acciones legales"; no puntúa nada.
 */
export function assertDecisionIsLegal(
  request: TacticalDecisionRequest,
  result: TacticalDecisionResult,
): void {
  if (result.status !== "decided") return;
  const legalIds = new Set<string>(
    request.legalActions.options.map((o) => o.optionId),
  );
  if (!legalIds.has(result.chosenOptionId)) {
    throw new Error(`Opción elegida no legal: ${result.chosenOptionId}`);
  }
  for (const ev of result.evaluations) {
    if (!legalIds.has(ev.optionId)) {
      throw new Error(`Se evaluó una opción no legal: ${ev.optionId}`);
    }
  }
}
