import { asEncounterId } from "../models";
import type { Encounter, EncounterId } from "../models";
import { SNAPSHOT_SCHEMA_VERSION } from "../persistence";
import type { EncounterStore, EncounterSummary } from "../persistence";
import { PROVISIONAL_SCENARIO } from "../scenarios/provisionalScenario";
import type { CombatCoreApi } from "./coreApi";

/**
 * Crea en la fachada un encuentro nuevo con el escenario provisional (Goblin,
 * Cata, Caín). `id` y `label` los genera la interfaz; el programa nunca
 * interpreta el `label`.
 */
export function createProvisionalEncounter(
  api: CombatCoreApi,
  id: string,
  label: string,
): Encounter {
  const encounterId = asEncounterId(id);
  api.createEncounter({
    id: encounterId,
    label,
    grid: PROVISIONAL_SCENARIO.grid,
    occupancyPolicy: PROVISIONAL_SCENARIO.occupancyPolicy,
  });
  for (const { definition, position } of PROVISIONAL_SCENARIO.placements) {
    api.registerCombatant(encounterId, definition, position);
  }
  return api.getEncounter(encounterId);
}

/**
 * Guardar y abrir encuentros manualmente. Solo conecta la fachada con una
 * implementación de `EncounterStore` (la elige la interfaz: Firebase, local…).
 */
export interface EncounterLibrary {
  save(encounterId: EncounterId): Promise<void>;
  /** Carga el encuentro y lo deja abierto en la fachada; null si no existe. */
  open(encounterId: EncounterId): Promise<Encounter | null>;
  list(): Promise<readonly EncounterSummary[]>;
}

export function createEncounterLibrary(
  api: CombatCoreApi,
  store: EncounterStore,
): EncounterLibrary {
  return {
    save: (encounterId) =>
      store.save({
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        encounter: api.getEncounter(encounterId),
      }),
    async open(encounterId) {
      const snapshot = await store.load(encounterId);
      return snapshot === null ? null : api.openEncounter(snapshot.encounter);
    },
    list: () => store.list(),
  };
}
