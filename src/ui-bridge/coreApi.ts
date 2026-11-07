import type {
  CombatantDefinition,
  Encounter,
  EncounterId,
  GridPosition,
  TurnPlan,
} from "../models";
import { createRulesEngine, TARGET_RULESET } from "../rules";
import type { CreateEncounterInput, LegalityResult, RulesEngine } from "../rules";
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
}

export function createCombatCoreApi(
  engine: RulesEngine = createRulesEngine(),
): CombatCoreApi {
  const encounters = new Map<string, Encounter>();

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
    registerCombatant(encounterId, definition, position) {
      const updated = engine.addCombatant(require(encounterId), definition, position);
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
  };
}
