import type { DifficultyId } from "../models";
import type { SearchParameters } from "./planner";

/**
 * NIVELES DE DIFICULTAD (TACTICAL_BRAIN_SPEC.md §5, DECISIÓN CONFIRMADA:
 * calidad de las decisiones, nunca estadísticas ni información). Traducción
 * de la tabla cualitativa de la especificación a parámetros medibles.
 * VALORES: PROPUESTA pendiente de aprobación (decisión 96).
 */
export type { DifficultyId };

export interface DifficultyProfile {
  /** Opciones evaluadas, profundidad, posicionamiento y calidad de evaluación. */
  readonly search: SearchParameters;
  /** Reevaluación: replanificar tras cada operación o solo al cambiar de fase (etapa 6). */
  readonly replanAfterEachOperation: boolean;
  /** Coordinación (etapa 5): ninguna, conocer las intenciones de los aliados o planificar en equipo. */
  readonly coordination: "limited" | "considersAllies" | "plansCooperation";
}

export const DIFFICULTY_PROFILES: Readonly<Record<DifficultyId, DifficultyProfile>> = {
  // Pocas opciones, profundidad limitada, posicionamiento básico, coordinación limitada.
  easy: {
    search: {
      beamWidth: 1,
      maxPhases: 2,
      maxMoveCandidates: 4,
      maxAreaPlacements: 4,
      maxTargetCombinations: 2,
      movesBetweenAttacks: false,
      ignoredFeatures: ["flankingPairs"],
    },
    replanAfterEachOperation: false,
    coordination: "limited",
  },
  // Varias opciones, profundidad intermedia, busca ventajas, considera aliados.
  normal: {
    search: {
      beamWidth: 2,
      maxPhases: 3,
      maxMoveCandidates: 12,
      maxAreaPlacements: 12,
      maxTargetCombinations: 6,
      movesBetweenAttacks: true,
    },
    replanAfterEachOperation: false,
    coordination: "considersAllies",
  },
  // Muchas opciones, más profundidad, evalúa todas las posiciones, replanifica tras cada operación.
  hard: {
    search: {
      beamWidth: 4,
      maxPhases: 3,
      maxMoveCandidates: null,
      maxAreaPlacements: null,
      maxTargetCombinations: null,
      movesBetweenAttacks: true,
    },
    replanAfterEachOperation: true,
    coordination: "plansCooperation",
  },
};
