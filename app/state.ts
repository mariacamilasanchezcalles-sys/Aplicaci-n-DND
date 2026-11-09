import { loadBestiary } from "../src/ui-bridge";
import type { Bestiary, CombatSnapshot, CustomDifficulty, DifficultyId, MonsterGroupInput, PartyMemberInput } from "../src/ui-bridge";
import goblinWarrior from "../data/sheets/goblin-warrior.json?raw";
import { storage } from "./storage";
import type { Settings } from "./storage";

/**
 * ESTADO DE LA INTERFAZ: pantalla actual, preparación del encuentro (borrador
 * guardado automáticamente), personajes guardados y combate en curso. No
 * contiene reglas: todo lo decide el núcleo a través de `ui-bridge`.
 */
export type ScreenId = "splash" | "bestiary" | "party" | "difficulty" | "combat" | "savedGames";

/** Pasos de la preparación (indicador superior). */
export const SETUP_STEPS = ["bestiary", "party", "difficulty", "combat"] as const satisfies readonly ScreenId[];

export interface SetupDraft {
  readonly monsters: readonly MonsterGroupInput[];
  /** Personajes guardados que van a esta partida (por clave). */
  readonly partyKeys: readonly string[];
  readonly partyLevel: number;
  readonly difficulty: DifficultyId | null;
  readonly customDifficulty: CustomDifficulty;
}

/** Valores iniciales de la dificultad Personalizada: los de Normal. */
export const DEFAULT_CUSTOM: CustomDifficulty = {
  beamWidth: 2,
  maxPhases: 3,
  maxMoveCandidates: 12,
  movesBetweenAttacks: true,
  coordination: "considersAllies",
  replanAfterEachOperation: false,
};

const EMPTY_DRAFT: SetupDraft = { monsters: [], partyKeys: [], partyLevel: 1, difficulty: null, customDifficulty: DEFAULT_CUSTOM };

/**
 * Personajes iniciales: Cata y Caín con sus nombres; sus datos los completa
 * la jugadora (no se inventan estadísticas).
 */
const SEED_ROSTER: PartyMemberInput[] = [
  { key: "cata", label: "Cata", description: "", size: "medium", maxHitPoints: 0, currentHitPoints: 0, armorClass: 0, speedFeet: 30, attacks: [] },
  { key: "cain", label: "Caín", description: "", size: "medium", maxHitPoints: 0, currentHitPoints: 0, armorClass: 0, speedFeet: 30, attacks: [] },
];

type Listener = () => void;

export class AppModel {
  /** Fichas incluidas en la app (sin conexión). */
  readonly bestiary: Bestiary = loadBestiary([goblinWarrior]);
  screen: ScreenId = "splash";
  draft: SetupDraft;
  roster: PartyMemberInput[];
  settings: Settings;
  combat: CombatSnapshot | null = null;
  /** Id de la partida guardada que se está jugando (para sobrescribirla). */
  gameId: string | null = null;
  private readonly listeners = new Set<Listener>();

  constructor() {
    this.draft = { ...EMPTY_DRAFT, ...(storage.loadDraft() ?? {}) };
    this.roster = storage.loadRoster() ?? SEED_ROSTER;
    this.settings = storage.loadSettings();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(): void {
    for (const listener of this.listeners) listener();
  }

  go(screen: ScreenId): void {
    this.screen = screen;
    this.notify();
  }

  setDraft(change: Partial<SetupDraft>): void {
    this.draft = { ...this.draft, ...change };
    storage.saveDraft(this.draft);
    this.notify();
  }

  setRoster(roster: PartyMemberInput[]): void {
    this.roster = roster;
    storage.saveRoster(roster);
    this.notify();
  }

  setSettings(settings: Settings): void {
    this.settings = settings;
    storage.saveSettings(settings);
    document.documentElement.classList.toggle("reduce-motion", settings.reduceMotion);
    this.notify();
  }

  setCombat(snapshot: CombatSnapshot | null): void {
    this.combat = snapshot;
    this.notify();
  }

  /** Aventureros de esta partida (en el orden guardado). */
  party(): PartyMemberInput[] {
    return this.roster.filter((p) => this.draft.partyKeys.includes(p.key));
  }
}
