import { createCombatCoreApi, createEncounterLibrary, createProvisionalEncounter } from "../src/ui-bridge";
import type {
  ActionOption,
  CombatCoreApi,
  CreatureId,
  EncounterId,
  EncounterLibrary,
  GridPosition,
  LegalityResult,
} from "../src/ui-bridge";
import type { ChosenStore } from "./storage/chooseStore";

export type ScreenId = "map" | "turn" | "encounters";

/**
 * Estado de la INTERFAZ (pantalla actual, criatura elegida, borrador del
 * turno). No contiene reglas: la legalidad siempre la pide al núcleo.
 */
export interface UiState {
  screen: ScreenId;
  encounterId: EncounterId;
  selectedActorId: CreatureId | null;
  /** Pasos del turno en preparación (se validan, no se ejecutan). */
  draft: ActionOption[];
  /** Índice del paso de movimiento que se está trazando en el mapa, o null. */
  tracingStep: number | null;
  /** Mensaje breve para la persona (guardado, errores…). */
  toast: string | null;
}

type Listener = () => void;

export class AppModel {
  readonly api: CombatCoreApi = createCombatCoreApi();
  readonly library: EncounterLibrary;
  readonly state: UiState;
  private readonly listeners = new Set<Listener>();

  constructor(readonly storage: ChosenStore) {
    this.library = createEncounterLibrary(this.api, storage.store);
    const first = createProvisionalEncounter(this.api, newEncounterId(), newEncounterLabel());
    this.state = {
      screen: "map",
      encounterId: first.id,
      selectedActorId: null,
      draft: [],
      tracingStep: null,
      toast: null,
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Cambia el estado y avisa a las pantallas. */
  update(change: (state: UiState) => void): void {
    change(this.state);
    for (const listener of this.listeners) listener();
  }

  /** Resultado del motor de reglas para el borrador actual (null sin criatura). */
  validateDraft(): LegalityResult | null {
    const { selectedActorId, draft, encounterId } = this.state;
    if (selectedActorId === null) return null;
    return this.api.validateTurnPlan(encounterId, { actorId: selectedActorId, steps: draft });
  }

  selectActor(actorId: CreatureId | null): void {
    this.update((s) => {
      if (s.selectedActorId === actorId) return;
      s.selectedActorId = actorId;
      s.draft = [];
      s.tracingStep = null;
    });
  }

  /** Añade una casilla al recorrido del paso de movimiento que se está trazando. */
  addSquareToTrace(square: GridPosition): void {
    this.update((s) => {
      const step = s.tracingStep === null ? undefined : s.draft[s.tracingStep];
      if (step?.slot !== "movement" || s.tracingStep === null) return;
      s.draft[s.tracingStep] = { slot: "movement", path: [...step.path, square] };
    });
  }

  removeLastSquareFromTrace(): void {
    this.update((s) => {
      const step = s.tracingStep === null ? undefined : s.draft[s.tracingStep];
      if (step?.slot !== "movement" || s.tracingStep === null) return;
      s.draft[s.tracingStep] = { slot: "movement", path: step.path.slice(0, -1) };
    });
  }

  newProvisionalEncounter(): void {
    const encounter = createProvisionalEncounter(this.api, newEncounterId(), newEncounterLabel());
    this.update((s) => {
      s.encounterId = encounter.id;
      s.selectedActorId = null;
      s.draft = [];
      s.tracingStep = null;
      s.screen = "map";
      s.toast = `Nuevo: ${encounter.label}`;
    });
  }

  async openEncounter(id: EncounterId): Promise<void> {
    const encounter = await this.library.open(id);
    this.update((s) => {
      if (encounter === null) {
        s.toast = "No se encontró ese encuentro.";
        return;
      }
      s.encounterId = encounter.id;
      s.selectedActorId = null;
      s.draft = [];
      s.tracingStep = null;
      s.screen = "map";
      s.toast = `Abierto: ${encounter.label}`;
    });
  }
}

let idCounter = 0;

/** Id único por dispositivo a partir de la hora (sin azar: el azar es solo de los dados). */
function newEncounterId(): string {
  idCounter += 1;
  return `enc-${Date.now().toString(36)}-${idCounter}`;
}

/** Etiqueta generada (sin texto libre): escenario + fecha y hora. */
function newEncounterLabel(): string {
  const when = new Date().toLocaleString("es", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `Escenario provisional · ${when}`;
}
