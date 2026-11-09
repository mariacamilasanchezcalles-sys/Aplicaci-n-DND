import type { CombatSnapshot, PartyMemberInput } from "../src/ui-bridge";
import type { SetupDraft } from "./state";

/**
 * GUARDADO LOCAL en el dispositivo (offline obligatorio). Cada lectura y
 * escritura va protegida: si el almacenamiento no está disponible, la app
 * funciona igual sin recordar nada.
 */
const KEYS = {
  roster: "dnd.roster.v1",
  draft: "dnd.setupDraft.v1",
  games: "dnd.savedGames.v1",
  settings: "dnd.settings.v1",
} as const;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export interface SavedGame {
  readonly id: string;
  readonly label: string;
  readonly savedAt: string;
  readonly snapshot: CombatSnapshot;
}

export interface Settings {
  readonly reduceMotion: boolean;
}

export const storage = {
  loadRoster: (): PartyMemberInput[] | null => read<PartyMemberInput[] | null>(KEYS.roster, null),
  saveRoster: (roster: readonly PartyMemberInput[]): boolean => write(KEYS.roster, roster),
  loadDraft: (): SetupDraft | null => read<SetupDraft | null>(KEYS.draft, null),
  saveDraft: (draft: SetupDraft): boolean => write(KEYS.draft, draft),
  loadGames: (): SavedGame[] => read<SavedGame[]>(KEYS.games, []),
  saveGame: (game: SavedGame): boolean => {
    const games = storage.loadGames().filter((g) => g.id !== game.id);
    return write(KEYS.games, [game, ...games].slice(0, 20));
  },
  deleteGame: (id: string): boolean => write(KEYS.games, storage.loadGames().filter((g) => g.id !== id)),
  loadSettings: (): Settings => read<Settings>(KEYS.settings, { reduceMotion: false }),
  saveSettings: (settings: Settings): boolean => write(KEYS.settings, settings),
};
