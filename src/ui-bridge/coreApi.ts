import type {
  BrainSettings,
  CombatantDefinition,
  CreatureId,
  Encounter,
  EncounterId,
  GridPosition,
  TurnPlan,
} from "../models";
import { createRulesEngine, mathRandomSource, TARGET_RULESET } from "../rules";
import type { CreateEncounterInput, LegalityResult, RandomSource, RulesEngine, TurnState } from "../rules";
import { resolveMonsterReactions, runMonsterTurn, startMonsterTurn } from "../combat-controller";
import type { ControllerEvent, MonsterTurnSession, PlayerInput, PlayerInputRequest } from "../combat-controller";
import { buildMapView, buildTurnMenu } from "./views";
import type { MapView, TurnMenu } from "./views";

export interface CoreStatus {
  readonly ready: true;
  readonly targetRuleset: typeof TARGET_RULESET;
  readonly encounterCount: number;
}

/**
 * Fachada entre la interfaz y el núcleo. Sin pantallas ni DOM: la interfaz
 * (web/Capacitor) habla con el núcleo SOLO a través de esta fachada, usando
 * datos serializables. No contiene reglas: delega en `rules`.
 */
export interface CombatCoreApi {
  getStatus(): CoreStatus;
  createEncounter(input: CreateEncounterInput): Encounter;
  registerCombatant(
    encounterId: EncounterId,
    definition: CombatantDefinition,
    position: GridPosition,
    options?: { readonly side?: string },
  ): Encounter;
  getEncounter(encounterId: EncounterId): Encounter;
  /**
   * Pone en memoria un encuentro ya existente (por ejemplo, uno recién
   * cargado de un guardado). Reemplaza el que tenga el mismo id.
   */
  openEncounter(encounter: Encounter): Encounter;
  /** Valida un turno completo con el motor de reglas. No lo ejecuta. */
  validateTurnPlan(encounterId: EncounterId, plan: TurnPlan): LegalityResult;
  /** Datos para dibujar el mapa (casillas que ocupa cada criatura, según el motor). */
  getMapView(encounterId: EncounterId): MapView;
  /** Opciones que la criatura tiene en sus datos, para construir menús. No decide legalidad. */
  getTurnMenu(encounterId: EncounterId, actorId: string): TurnMenu;
  /** Nivel del grupo y dificultad de cada monstruo (ajustes del cerebro en el encuentro). */
  setBrainSettings(encounterId: EncounterId, settings: Partial<BrainSettings>): Encounter;
  /**
   * Turno de un monstruo dirigido por el cerebro. `turn` es el turno ya
   * empezado (p. ej. con `advanceTurn`). Juega hasta terminar o hasta que
   * haga falta un dato del jugador; entonces se llama a `continueMonsterTurn`
   * con la respuesta.
   */
  playMonsterTurn(encounterId: EncounterId, turn: TurnState): MonsterTurnView;
  continueMonsterTurn(encounterId: EncounterId, input: PlayerInput): MonsterTurnView;
  /** Reacciones de monstruos pendientes en el turno de otro (las decide el cerebro). */
  resolveMonsterReactions(encounterId: EncounterId, turn: TurnState): { readonly turn: TurnState; readonly decisions: readonly { reactorId: CreatureId; take: boolean }[] };
}

/** Estado de un turno de monstruo para la interfaz (datos serializables). */
export interface MonsterTurnView {
  readonly status: "awaitingPlayer" | "ended" | "error";
  readonly request: PlayerInputRequest | null;
  readonly error: string | null;
  readonly turn: TurnState;
  readonly events: readonly ControllerEvent[];
}

export function createCombatCoreApi(
  engine: RulesEngine = createRulesEngine(),
  /** Dados reales del combate (inyectables para pruebas). */
  dice: RandomSource = mathRandomSource,
): CombatCoreApi {
  const encounters = new Map<string, Encounter>();
  const sessions = new Map<string, MonsterTurnSession>();

  const runSession = (encounterId: EncounterId, start: MonsterTurnSession, input?: PlayerInput): MonsterTurnView => {
    const status = runMonsterTurn(start, dice, input);
    encounters.set(encounterId, status.session.encounter);
    if (status.status === "awaitingPlayer") sessions.set(encounterId, status.session);
    else sessions.delete(encounterId);
    return {
      status: status.status === "running" ? "ended" : status.status,
      request: status.status === "awaitingPlayer" ? status.request : null,
      error: status.status === "error" ? status.reason : null,
      turn: status.session.turn,
      events: status.session.events,
    };
  };

  const require = (id: EncounterId): Encounter => {
    const found = encounters.get(id);
    if (!found) throw new Error(`Encuentro no encontrado: ${id}`);
    return found;
  };

  return {
    getStatus: () => ({
      ready: true,
      targetRuleset: TARGET_RULESET,
      encounterCount: encounters.size,
    }),
    createEncounter(input) {
      if (encounters.has(input.id)) throw new Error(`Encuentro ya existe: ${input.id}`);
      const encounter = engine.createEncounter(input);
      encounters.set(input.id, encounter);
      return encounter;
    },
    registerCombatant(encounterId, definition, position, options) {
      const updated = engine.addCombatant(require(encounterId), definition, position, options);
      encounters.set(encounterId, updated);
      return updated;
    },
    getEncounter: require,
    openEncounter(encounter) {
      encounters.set(encounter.id, encounter);
      return encounter;
    },
    validateTurnPlan(encounterId, plan) {
      return engine.validateTurnPlan(require(encounterId), plan);
    },
    getMapView(encounterId) {
      return buildMapView(require(encounterId));
    },
    getTurnMenu(encounterId, actorId) {
      return buildTurnMenu(require(encounterId), actorId);
    },
    setBrainSettings(encounterId, settings) {
      const current = require(encounterId);
      const updated = { ...current, brainSettings: { ...current.brainSettings, ...settings } };
      encounters.set(encounterId, updated);
      return updated;
    },
    playMonsterTurn(encounterId, turn) {
      return runSession(encounterId, startMonsterTurn(require(encounterId), turn));
    },
    continueMonsterTurn(encounterId, input) {
      const session = sessions.get(encounterId);
      if (!session) throw new Error(`No hay turno de monstruo en curso: ${encounterId}`);
      return runSession(encounterId, session, input);
    },
    resolveMonsterReactions(encounterId, turn) {
      const resolved = resolveMonsterReactions(require(encounterId), turn, dice);
      encounters.set(encounterId, resolved.encounter);
      return { turn: resolved.turn, decisions: resolved.decisions };
    },
  };
}
