import type { EncounterStore } from "../../src/ui-bridge";
import { LocalEncounterStore } from "./localStore";
import type { FirebaseEncounterStore, FirebaseWebConfig } from "./firebaseStore";

export type StoreKind = "firebase" | "local";

export interface ChosenStore {
  readonly kind: StoreKind;
  readonly store: EncounterStore;
  /** Presente si se usa Firebase (para mostrar el estado de sincronización). */
  readonly firebase: FirebaseEncounterStore | null;
  /** Por qué no se usa Firebase, si es el caso (texto para la persona). */
  readonly notice: string | null;
}

function readFirebaseConfig(): FirebaseWebConfig | null {
  const env = import.meta.env;
  const apiKey = env.VITE_FIREBASE_API_KEY;
  const authDomain = env.VITE_FIREBASE_AUTH_DOMAIN;
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  const appId = env.VITE_FIREBASE_APP_ID;
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  return { apiKey, authDomain, projectId, appId };
}

/**
 * Elige dónde se guardan los encuentros: Firebase si está configurado (ver
 * `.env.example`); si no, el almacenamiento local del dispositivo.
 * Firebase se carga bajo demanda para no pesar cuando no se usa.
 */
export async function chooseStore(): Promise<ChosenStore> {
  const config = readFirebaseConfig();
  if (config === null) {
    return {
      kind: "local",
      store: new LocalEncounterStore(),
      firebase: null,
      notice: "Firebase no está configurado: se guarda solo en este dispositivo.",
    };
  }
  try {
    const { FirebaseEncounterStore } = await import("./firebaseStore");
    const firebase = await FirebaseEncounterStore.connect(config);
    return { kind: "firebase", store: firebase, firebase, notice: null };
  } catch (error) {
    console.error("No se pudo conectar con Firebase", error);
    return {
      kind: "local",
      store: new LocalEncounterStore(),
      firebase: null,
      notice:
        "No se pudo conectar con Firebase (¿sin conexión la primera vez o inicio anónimo desactivado?). Se guarda solo en este dispositivo.",
    };
  }
}
