export * from "./coreApi";
export * from "./views";
export * from "./encounterLibrary";

// Tipos y utilidades del núcleo que la interfaz necesita. La interfaz importa
// SOLO de `ui-bridge`; estas reexportaciones son la única puerta.
export { asCreatureId, asAttackId, asBonusActionId, asEncounterId } from "../models";
export type {
  ActionOption,
  AttackId,
  AttackUse,
  BonusActionActionType,
  BonusActionId,
  CreatureId,
  CreatureSize,
  Encounter,
  EncounterId,
  GridPosition,
  StandardActionType,
  TurnPlan,
} from "../models";
export type { IllegalReason, LegalityResult, PlacementReason } from "../rules";
export { deserializeEncounter, serializeEncounter, SNAPSHOT_SCHEMA_VERSION } from "../persistence";
export type { EncounterSnapshot, EncounterStore, EncounterSummary } from "../persistence";
