import { deserializeEncounter, serializeEncounter } from "../../src/ui-bridge";
import type {
  EncounterId,
  EncounterSnapshot,
  EncounterStore,
  EncounterSummary,
} from "../../src/ui-bridge";

const PREFIX = "dnd-tactical-sim/encounter/";

/**
 * Almacén en el `localStorage` del dispositivo. Se usa cuando Firebase no está
 * configurado o no está disponible. PROVISIONAL (decisión pendiente 16).
 */
export class LocalEncounterStore implements EncounterStore {
  async save(snapshot: EncounterSnapshot): Promise<void> {
    localStorage.setItem(PREFIX + snapshot.encounter.id, serializeEncounter(snapshot.encounter));
  }

  async load(id: EncounterId): Promise<EncounterSnapshot | null> {
    const json = localStorage.getItem(PREFIX + id);
    return json === null ? null : deserializeEncounter(json);
  }

  async list(): Promise<readonly EncounterSummary[]> {
    const summaries: EncounterSummary[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key === null || !key.startsWith(PREFIX)) continue;
      const json = localStorage.getItem(key);
      if (json === null) continue;
      try {
        const { encounter } = deserializeEncounter(json);
        summaries.push({ id: encounter.id, label: encounter.label });
      } catch {
        // Guardado con otro formato: se ignora en la lista.
      }
    }
    return summaries;
  }
}
