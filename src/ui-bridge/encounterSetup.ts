import { asAttackId, asCreatureId, asEncounterId } from "../models";
import type {
  AttackDefinition,
  CombatantDefinition,
  CreatureSheet,
  CreatureSize,
  CreatureTypeId,
  CustomDifficulty,
  DamageType,
  DifficultyId,
  Encounter,
  GridPosition,
  PersonalityId,
  PlayerCharacterDefinition,
} from "../models";
import { createRulesEngine, validatePlacement } from "../rules";
import { TABLE_RULES_OF_THE_PLAYERS_TABLE } from "../scenarios/provisionalScenario";
import { combatantFromSheet, loadCreatureSheet } from "../sheets";

/**
 * PREPARACIÓN DEL ENCUENTRO para las pantallas (bestiario, personajes y
 * dificultad). Solo datos y validación con códigos; las reglas las aplica el
 * motor.
 */

// ---------------------------------------------------------------------------
// Bestiario
// ---------------------------------------------------------------------------

export interface BestiaryAttackSummary {
  readonly label: string;
  readonly mode: "melee" | "ranged";
  readonly normalFeet: number;
  readonly longFeet: number | null;
  readonly toHitBonus: number;
}

/** Resumen de una ficha para su tarjeta del bestiario. */
export interface BestiaryEntry {
  readonly sheetId: string;
  readonly label: string;
  readonly size: CreatureSize;
  readonly creatureType: CreatureTypeId | null;
  readonly challengeRating: string | null;
  readonly armorClass: number;
  readonly hitPoints: number;
  readonly speedFeet: number;
  readonly attacks: readonly BestiaryAttackSummary[];
  readonly sourceKind: CreatureSheet["source"]["kind"];
  /** Mecánicas de la ficha que el motor aún no ejecuta (huecos). */
  readonly gapCount: number;
}

export interface Bestiary {
  readonly entries: readonly BestiaryEntry[];
  readonly sheets: Readonly<Record<string, CreatureSheet>>;
  /** Fichas que no se pudieron cargar (por posición en la lista). */
  readonly invalid: readonly number[];
}

/** Carga el bestiario a partir de los JSON de las fichas (las lee la interfaz). */
export function loadBestiary(sheetJsonTexts: readonly string[]): Bestiary {
  const entries: BestiaryEntry[] = [];
  const sheets: Record<string, CreatureSheet> = {};
  const invalid: number[] = [];
  sheetJsonTexts.forEach((text, index) => {
    const loaded = loadCreatureSheet(text);
    if (!loaded.valid) {
      invalid.push(index);
      return;
    }
    const sheet = loaded.sheet;
    sheets[sheet.id] = sheet;
    const { gaps } = combatantFromSheet(sheet, { creatureId: sheet.id, personality: "pragmatic" });
    entries.push({
      sheetId: sheet.id,
      label: sheet.label,
      size: sheet.size,
      creatureType: sheet.creatureType ?? null,
      challengeRating: sheet.challengeRating ?? null,
      armorClass: sheet.armorClass,
      hitPoints: sheet.hitPoints.average,
      speedFeet: sheet.speed.walk,
      attacks: (sheet.attacks ?? []).map((a) => ({
        label: a.label,
        mode: a.mode,
        normalFeet: a.rangeFeet.normal,
        longFeet: a.rangeFeet.long ?? null,
        toHitBonus: a.toHitBonus,
      })),
      sourceKind: sheet.source.kind,
      gapCount: gaps.length,
    });
  });
  entries.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  return { entries, sheets, invalid };
}

// ---------------------------------------------------------------------------
// Personajes jugadores (registro simplificado, DECISIÓN CONFIRMADA)
// ---------------------------------------------------------------------------

export interface PartyAttackInput {
  readonly label: string;
  readonly mode: "melee" | "ranged";
  /** Alcance (cuerpo a cuerpo) o distancia normal (a distancia), en pies. */
  readonly normalFeet: number;
  /** Distancia larga (solo a distancia). */
  readonly longFeet: number | null;
  /** Tipo de daño (para resistencias e inmunidades al anotar el daño). */
  readonly damageType: DamageType;
}

/**
 * Lo que la tarjeta del personaje pide: solo lo que usa el motor (decisión de
 * la jugadora 2026-11-09). Sus tiradas son con dados físicos.
 */
export interface PartyMemberInput {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly size: CreatureSize;
  readonly maxHitPoints: number;
  readonly currentHitPoints: number;
  readonly armorClass: number;
  readonly speedFeet: number;
  readonly attacks: readonly PartyAttackInput[];
}

export type PartyMemberIssue =
  | "labelRequired"
  | "maxHitPointsInvalid"
  | "currentHitPointsInvalid"
  | "armorClassInvalid"
  | "speedInvalid"
  | "attackLabelRequired"
  | "attackRangeInvalid";

const isWhole = (n: number, min: number, max: number): boolean => Number.isInteger(n) && n >= min && n <= max;

/** Problemas de una tarjeta (vacío si se puede usar). */
export function partyMemberIssues(input: PartyMemberInput): PartyMemberIssue[] {
  const issues: PartyMemberIssue[] = [];
  if (input.label.trim() === "") issues.push("labelRequired");
  if (!isWhole(input.maxHitPoints, 1, 999)) issues.push("maxHitPointsInvalid");
  if (!isWhole(input.currentHitPoints, 0, 999) || input.currentHitPoints > input.maxHitPoints) issues.push("currentHitPointsInvalid");
  if (!isWhole(input.armorClass, 1, 40)) issues.push("armorClassInvalid");
  if (!isWhole(input.speedFeet, 0, 240) || input.speedFeet % 5 !== 0) issues.push("speedInvalid");
  for (const attack of input.attacks) {
    if (attack.label.trim() === "") issues.push("attackLabelRequired");
    const longOk = attack.longFeet === null || (attack.mode === "ranged" && attack.longFeet >= attack.normalFeet);
    if (!isWhole(attack.normalFeet, 5, 1000) || attack.normalFeet % 5 !== 0 || !longOk) issues.push("attackRangeInvalid");
  }
  return [...new Set(issues)];
}

/**
 * Definición del motor para un personaje. Los ataques solo necesitan su
 * alcance (ataques de oportunidad) y su tipo de daño: la tirada y el daño los
 * anota el jugador, así que no llevan bonificador ni dados (PROPUESTA,
 * decisión 116).
 */
export function playerCharacterDefinition(input: PartyMemberInput, creatureId: string): PlayerCharacterDefinition {
  const attacks: AttackDefinition[] = input.attacks.map((a, i) => ({
    id: asAttackId(`attack-${i + 1}`),
    label: a.label.trim(),
    mode: a.mode,
    rangeFeet: a.longFeet === null ? { normal: a.normalFeet } : { normal: a.normalFeet, long: a.longFeet },
    toHitBonus: 0,
    damage: [{ dice: { count: 0, sides: 1 }, bonus: 0, type: a.damageType }],
  }));
  return {
    kind: "playerCharacter",
    registration: "simplified",
    testRole: input.attacks.some((a) => a.mode === "melee") ? "melee-fighter" : "ranged-spellcaster",
    id: asCreatureId(creatureId),
    label: input.label.trim(),
    size: input.size,
    stats: { maxHitPoints: input.maxHitPoints, armorClass: input.armorClass, speedFeet: input.speedFeet },
    attacks,
    bonusActions: [],
    traits: [],
  };
}

// ---------------------------------------------------------------------------
// Encuentro
// ---------------------------------------------------------------------------

export interface MonsterGroupInput {
  readonly sheetId: string;
  readonly count: number;
  readonly personality: PersonalityId;
}

export interface EncounterSetup {
  readonly id: string;
  readonly label: string;
  readonly monsters: readonly MonsterGroupInput[];
  readonly party: readonly PartyMemberInput[];
  readonly partyLevel: number;
  readonly difficulty: DifficultyId;
  readonly customDifficulty: CustomDifficulty | null;
}

export type SetupIssue =
  | "noMonsters"
  | "noParty"
  | "partyMemberInvalid"
  | "unknownSheet"
  | "partyLevelInvalid"
  | "customDifficultyMissing"
  | "mapFull";

/** Mapa de la mesa (DECISIÓN CONFIRMADA): 15 columnas x 21 filas, casillas de 5 pies. */
export const TABLE_MAP = { columns: 15, rows: 21, feetPerSquare: 5 } as const;

/** Problemas de la preparación (vacío si se puede crear el encuentro). */
export function setupIssues(setup: EncounterSetup, bestiary: Bestiary): SetupIssue[] {
  const issues: SetupIssue[] = [];
  if (setup.monsters.reduce((n, g) => n + g.count, 0) === 0) issues.push("noMonsters");
  if (setup.party.length === 0) issues.push("noParty");
  if (setup.party.some((p) => partyMemberIssues(p).length > 0)) issues.push("partyMemberInvalid");
  if (setup.monsters.some((g) => bestiary.sheets[g.sheetId] === undefined)) issues.push("unknownSheet");
  if (!isWhole(setup.partyLevel, 1, 20)) issues.push("partyLevelInvalid");
  if (setup.difficulty === "custom" && setup.customDifficulty === null) issues.push("customDifficultyMissing");
  return issues;
}

/**
 * Crea el encuentro: una instancia independiente por monstruo (PG,
 * posición, condiciones y recursos propios) y un registro por personaje,
 * con la mesa de la jugadora, el nivel del grupo y la dificultad.
 * Despliegue automático (PROPUESTA, decisión 117): monstruos en las filas
 * de arriba y personajes en las de abajo, centrados; se puede recolocar antes
 * de la iniciativa.
 */
export function buildEncounter(
  setup: EncounterSetup,
  bestiary: Bestiary,
): { readonly ok: true; readonly encounter: Encounter } | { readonly ok: false; readonly issues: readonly SetupIssue[] } {
  const issues = setupIssues(setup, bestiary);
  if (issues.length > 0) return { ok: false, issues };
  const engine = createRulesEngine();
  let encounter = engine.createEncounter({
    id: asEncounterId(setup.id),
    label: setup.label,
    grid: { feetPerSquare: TABLE_MAP.feetPerSquare, terrain: "open", dimensions: { columns: TABLE_MAP.columns, rows: TABLE_MAP.rows } },
    occupancyPolicy: "one-creature-per-space",
    tableRules: TABLE_RULES_OF_THE_PLAYERS_TABLE,
    partyLevel: setup.partyLevel,
  });

  // Instancias numeradas por ficha: "goblin-warrior-1", "Goblin 1"… (sin número si solo hay una).
  const monsters: CombatantDefinition[] = [];
  const totalOf = (sheetId: string): number => setup.monsters.filter((g) => g.sheetId === sheetId).reduce((n, g) => n + g.count, 0);
  const used: Record<string, number> = {};
  for (const group of setup.monsters) {
    const sheet = bestiary.sheets[group.sheetId]!;
    for (let n = 0; n < group.count; n++) {
      const index = (used[sheet.id] = (used[sheet.id] ?? 0) + 1);
      const label = totalOf(sheet.id) === 1 ? sheet.label : `${sheet.label} ${index}`;
      monsters.push(combatantFromSheet(sheet, { creatureId: `${sheet.id}-${index}`, label, personality: group.personality }).definition);
    }
  }
  const party = setup.party.map((p, i) => playerCharacterDefinition(p, `pc-${i + 1}-${p.key}`));

  const placed = deploy(encounter, monsters, "top", engine);
  if (!placed) return { ok: false, issues: ["mapFull"] };
  encounter = placed;
  const withParty = deploy(encounter, party, "bottom", engine);
  if (!withParty) return { ok: false, issues: ["mapFull"] };
  encounter = withParty;
  // PG actuales de los personajes (pueden empezar heridos).
  const combatants = { ...encounter.combatants };
  setup.party.forEach((p, i) => {
    const id = `pc-${i + 1}-${p.key}`;
    const record = combatants[id]!;
    combatants[id] = { ...record, state: { ...record.state, currentHitPoints: p.currentHitPoints } };
  });
  const difficultyByCreature = Object.fromEntries(monsters.map((m) => [m.id, setup.difficulty]));
  return {
    ok: true,
    encounter: {
      ...encounter,
      combatants,
      brainSettings: { partyLevel: setup.partyLevel, difficultyByCreature, customDifficulty: setup.customDifficulty },
    },
  };
}

/** Coloca criaturas por filas desde un borde, centradas, donde el motor lo permite. */
function deploy(
  encounter: Encounter,
  creatures: readonly CombatantDefinition[],
  edge: "top" | "bottom",
  engine: ReturnType<typeof createRulesEngine>,
): Encounter | null {
  const { columns, rows } = encounter.grid.dimensions;
  const center = Math.floor(columns / 2);
  // Columnas desde el centro hacia fuera: 7, 6, 8, 5, 9…
  const columnOrder = Array.from({ length: columns }, (_, i) => center + (i % 2 === 0 ? i / 2 : -(i + 1) / 2)).filter(
    (c) => c >= 0 && c < columns,
  );
  let updated = encounter;
  for (const creature of creatures) {
    let spot: GridPosition | null = null;
    for (let r = 1; r < rows && spot === null; r++) {
      const row = edge === "top" ? r : rows - 1 - r;
      for (const column of columnOrder) {
        const position = { column, row };
        if (validatePlacement(updated, position, creature.size).valid) {
          spot = position;
          break;
        }
      }
    }
    if (spot === null) return null;
    updated = engine.addCombatant(updated, creature, spot);
  }
  return updated;
}
