import type {
  CombatantDefinition,
  Encounter,
  EncounterId,
  GridPosition,
} from "../models";
import { createRulesEngine, TARGET_RULESET } from "../rules";
import type { CreateEncounterInput, RulesEngine } from "../rules";

export interface CoreStatus {
  readonly ready: true;
  readonly targetRuleset: typeof TARGET_RULESET;
  readonly encounterCount: number;
}

/**
 * Fachada mínima entre la interfaz y el núcleo. Sin pantallas ni DOM: solo
 * comprueba que una interfaz (web/Capacitor) puede hablar con el núcleo
 * usando datos serializables.
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
  };
}
