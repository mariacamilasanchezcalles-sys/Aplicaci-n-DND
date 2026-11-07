import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  persistentLocalCache,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import { SNAPSHOT_SCHEMA_VERSION, asEncounterId, deserializeEncounter, serializeEncounter } from "../../src/ui-bridge";
import type {
  EncounterId,
  EncounterSnapshot,
  EncounterStore,
  EncounterSummary,
} from "../../src/ui-bridge";

/** Configuración web de Firebase (no es secreta; la seguridad la dan Auth y las reglas). */
export interface FirebaseWebConfig {
  readonly apiKey: string;
  readonly authDomain: string;
  readonly projectId: string;
  readonly appId: string;
}

/** Tiempo máximo que se espera la confirmación del servidor al guardar. */
const SERVER_ACK_TIMEOUT_MS = 4000;

export type SyncState = "synced" | "pendingSync" | "failed";

/**
 * Almacén en Cloud Firestore. PROVISIONAL (decisión pendiente 16).
 *
 * - Cada usuario solo ve sus encuentros: `users/{uid}/encounters/{encounterId}`
 *   (ver `firestore.rules`). El usuario es anónimo por ahora.
 * - Caché local persistente: sin conexión se lee de la caché y las escrituras
 *   quedan en cola hasta que vuelva la conexión.
 * - El documento guarda el JSON de `serializeEncounter` (con su versión de
 *   formato), así el núcleo sigue siendo quien define el formato.
 */
export class FirebaseEncounterStore implements EncounterStore {
  /** Estado de la última escritura: confirmada por el servidor o en cola. */
  lastSaveState: SyncState = "synced";

  private constructor(
    private readonly db: Firestore,
    private readonly uid: string,
  ) {}

  static async connect(config: FirebaseWebConfig): Promise<FirebaseEncounterStore> {
    const app = initializeApp(config);
    const db = initializeFirestore(app, { localCache: persistentLocalCache() });
    const auth = getAuth(app);
    await auth.authStateReady();
    // La sesión anónima se recuerda en el dispositivo; solo la primera vez
    // hace falta conexión para crearla.
    const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
    return new FirebaseEncounterStore(db, user.uid);
  }

  private encounters() {
    return collection(this.db, "users", this.uid, "encounters");
  }

  async save(snapshot: EncounterSnapshot): Promise<void> {
    const write = setDoc(doc(this.encounters(), snapshot.encounter.id), {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      label: snapshot.encounter.label,
      snapshot: serializeEncounter(snapshot.encounter),
      updatedAt: serverTimestamp(),
    });
    // Sin conexión, `setDoc` no se resuelve hasta sincronizar; la escritura
    // ya está en la caché local, así que no se bloquea la interfaz.
    const timeout = new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), SERVER_ACK_TIMEOUT_MS),
    );
    const outcome = await Promise.race([write.then(() => "ack" as const), timeout]);
    this.lastSaveState = outcome === "ack" ? "synced" : "pendingSync";
    if (outcome === "timeout") {
      write.then(
        () => (this.lastSaveState = "synced"),
        () => (this.lastSaveState = "failed"),
      );
    }
  }

  async load(id: EncounterId): Promise<EncounterSnapshot | null> {
    const found = await getDoc(doc(this.encounters(), id));
    if (!found.exists()) return null;
    const data = found.data();
    return typeof data["snapshot"] === "string" ? deserializeEncounter(data["snapshot"]) : null;
  }

  async list(): Promise<readonly EncounterSummary[]> {
    const result = await getDocs(this.encounters());
    return result.docs.map((entry) => {
      const label = entry.data()["label"];
      return { id: asEncounterId(entry.id), label: typeof label === "string" ? label : entry.id };
    });
  }
}
