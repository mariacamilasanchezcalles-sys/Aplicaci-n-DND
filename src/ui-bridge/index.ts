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
/** Dados reales (la única fuente de azar de la app). */
export { mathRandomSource } from "../rules";
export type {
  CapabilitySource,
  DeathSaveResult,
  ExecutableStandardAction,
  ExecutionChoice,
  IllegalReason,
  LegalityResult,
  MoraleTrigger,
  PlacementReason,
  ReachableSquare,
  ShockResult,
  TurnCommand,
  TurnCommandError,
  TurnLogEntry,
  TurnOptions,
  TurnState,
} from "../rules";
export type {
  CombatantRecord,
  ConditionId,
  CreatureTypeId,
  CustomDifficulty,
  DamageType,
  PersonalityId,
} from "../models";
export type { ControllerEvent, PlayerInput, PlayerInputRequest } from "../combat-controller";
export type { BrainSettings, DifficultyId } from "../models";
export { deserializeEncounter, serializeEncounter, SNAPSHOT_SCHEMA_VERSION } from "../persistence";
export type { EncounterSnapshot, EncounterStore, EncounterSummary } from "../persistence";
export * from "./encounterSetup";
export * from "./combatSession";
