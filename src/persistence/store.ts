import type { Encounter, EncounterId } from "../models";

/**
 * v3: criaturas con tamaño y acciones adicionales propias, regla diagonal en
 * el mapa y política de ocupación por espacio.
 * v4: criaturas con capacidades declarativas opcionales (`capabilities`).
 * v5: configuración de mesa (`tableRules`); la regla diagonal sale de `grid`.
 * v6: `tableRules.areaTemplate`; criaturas con `abilities` y `savingThrows`.
 * v7: condiciones activas, Cansancio, estado vital y salvaciones contra la muerte.
 */
export const SNAPSHOT_SCHEMA_VERSION = 7 as const;

export interface EncounterSnapshot {
  readonly schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  readonly encounter: Encounter;
}

export interface EncounterSummary {
  readonly id: EncounterId;
  readonly label: string;
}

/**
 * Interfaz de guardado/carga manual. PENDIENTE: dónde se guarda en Android
 * (archivos, almacenamiento de Capacitor, etc.).
 */
export interface EncounterStore {
  save(snapshot: EncounterSnapshot): Promise<void>;
  load(id: EncounterId): Promise<EncounterSnapshot | null>;
  list(): Promise<readonly EncounterSummary[]>;
}

export function serializeEncounter(encounter: Encounter): string {
  const snapshot: EncounterSnapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    encounter,
  };
  return JSON.stringify(snapshot);
}

export function deserializeEncounter(json: string): EncounterSnapshot {
  const parsed = JSON.parse(json) as Partial<EncounterSnapshot>;
  if (parsed.schemaVersion !== SNAPSHOT_SCHEMA_VERSION || !parsed.encounter) {
    throw new Error("Formato de guardado no reconocido");
  }
  return parsed as EncounterSnapshot;
}

/** Almacén en memoria, solo para validar la arquitectura. No persiste a disco. */
export class InMemoryEncounterStore implements EncounterStore {
  private readonly data = new Map<string, string>();

  async save(snapshot: EncounterSnapshot): Promise<void> {
    this.data.set(snapshot.encounter.id, serializeEncounter(snapshot.encounter));
  }

  async load(id: EncounterId): Promise<EncounterSnapshot | null> {
    const json = this.data.get(id);
    return json === undefined ? null : deserializeEncounter(json);
  }

  async list(): Promise<readonly EncounterSummary[]> {
    return [...this.data.values()].map((json) => {
      const { encounter } = deserializeEncounter(json);
      return { id: encounter.id, label: encounter.label };
    });
  }
}
