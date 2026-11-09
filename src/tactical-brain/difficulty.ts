import type { BrainSettings, CreatureId, DifficultyId, PresetDifficultyId } from "../models";
import type { SearchParameters } from "./planner";

/**
 * NIVELES DE DIFICULTAD (TACTICAL_BRAIN_SPEC.md §5, DECISIÓN CONFIRMADA:
 * calidad de las decisiones, nunca estadísticas ni información). Traducción
 * de la tabla cualitativa de la especificación a parámetros medibles.
 * VALORES: PROPUESTA pendiente de aprobación (decisión 96).
 */
export type { DifficultyId, PresetDifficultyId };

export interface DifficultyProfile {
  /** Opciones evaluadas, profundidad, posicionamiento y calidad de evaluación. */
  readonly search: SearchParameters;
  /** Reevaluación: replanificar tras cada operación o solo al cambiar de fase (etapa 6). */
  readonly replanAfterEachOperation: boolean;
  /** Coordinación (etapa 5): ninguna, conocer las intenciones de los aliados o planificar en equipo. */
  readonly coordination: "limited" | "considersAllies" | "plansCooperation";
}

export const DIFFICULTY_PROFILES: Readonly<Record<PresetDifficultyId, DifficultyProfile>> = {
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

/**
 * Perfil de un monstruo según los ajustes del encuentro: su nivel (por
 * defecto Normal, decisión 112) o la Personalizada. Si se eligió
 * Personalizada sin definirla, se usa Normal.
 */
export function difficultyProfileFor(settings: BrainSettings, creatureId: CreatureId): DifficultyProfile {
  const level = settings.difficultyByCreature[creatureId] ?? "normal";
  if (level !== "custom") return DIFFICULTY_PROFILES[level];
  const custom = settings.customDifficulty;
  if (custom === null) return DIFFICULTY_PROFILES.normal;
  return {
    search: {
      beamWidth: custom.beamWidth,
      maxPhases: custom.maxPhases,
      maxMoveCandidates: custom.maxMoveCandidates,
      // Áreas y objetivos: lo mismo que las casillas (sin límite si son todas).
      maxAreaPlacements: custom.maxMoveCandidates,
      maxTargetCombinations: custom.maxMoveCandidates === null ? null : Math.max(1, Math.ceil(custom.maxMoveCandidates / 2)),
      movesBetweenAttacks: custom.movesBetweenAttacks,
    },
    replanAfterEachOperation: custom.replanAfterEachOperation,
    coordination: custom.coordination,
  };
}
