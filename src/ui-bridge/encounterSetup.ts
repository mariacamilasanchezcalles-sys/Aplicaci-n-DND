import { asAttackId, asCreatureId, asEncounterId } from "../models";
import type {
  AttackDefinition,
  Capability,
  Operation,
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
import { SPELLS_2024, UNARMED_STRIKE, WEAPONS_2024, beamsForCharacterLevel, createRulesEngine, spellDamageAtLevel, validatePlacement, weaponAttacks } from "../rules";
import type { CharacterClassId, SpellEntry, WeaponEntry } from "../rules";
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
  /** Arma del catálogo de la que sale (si no, es un ataque personalizado). */
  readonly weaponId?: string;
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
  /** Clases y niveles (multiclase: varias filas). Opcional en tarjetas antiguas. */
  readonly classes?: readonly PartyClassInput[];
  /** Conjuros de daño elegidos (ids del catálogo del SRD). */
  readonly spellIds?: readonly string[];
  /** CD de salvación de sus conjuros (necesaria si elige conjuros de salvación). */
  readonly spellSaveDc?: number | null;
}

export interface PartyClassInput {
  readonly classId: CharacterClassId;
  readonly level: number;
}

export type PartyMemberIssue =
  | "labelRequired"
  | "maxHitPointsInvalid"
  | "currentHitPointsInvalid"
  | "armorClassInvalid"
  | "speedInvalid"
  | "attackLabelRequired"
  | "attackRangeInvalid"
  | "classLevelInvalid"
  | "classRepeated"
  | "totalLevelOver20"
  | "unknownSpell"
  | "spellSaveDcRequired";

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
  const classes = input.classes ?? [];
  if (classes.some((c) => !isWhole(c.level, 1, 20))) issues.push("classLevelInvalid");
  if (new Set(classes.map((c) => c.classId)).size !== classes.length) issues.push("classRepeated");
  if (classes.reduce((n, c) => n + (Number.isFinite(c.level) ? c.level : 0), 0) > 20) issues.push("totalLevelOver20");
  const spells = (input.spellIds ?? []).map((id) => SPELLS_2024.find((s) => s.id === id));
  if (spells.some((s) => s === undefined)) issues.push("unknownSpell");
  if (spells.some((s) => s?.effect.kind === "save") && !isWhole(input.spellSaveDc ?? Number.NaN, 1, 30)) issues.push("spellSaveDcRequired");
  return [...new Set(issues)];
}

// ---------------------------------------------------------------------------
// Catálogo de armas 2024 para la tarjeta del personaje
// ---------------------------------------------------------------------------

/** Arma del catálogo tal como la muestra la interfaz. */
export interface WeaponCatalogEntry {
  readonly id: string;
  readonly label: string;
  readonly category: WeaponEntry["category"];
  readonly kind: WeaponEntry["kind"];
  /** Dados de daño para mostrar ("1d8", "2d6", "1"). */
  readonly damageText: string;
  readonly damageType: DamageType;
  readonly reach: boolean;
  readonly thrown: boolean;
  readonly range: { readonly normal: number; readonly long: number } | null;
}

export const WEAPON_CATALOG: readonly WeaponCatalogEntry[] = WEAPONS_2024.map((w) => ({
  id: w.id,
  label: w.label,
  category: w.category,
  kind: w.kind,
  damageText: w.damage.count > 0 ? `${w.damage.count}d${w.damage.sides}${w.damageBonus ? ` + ${w.damageBonus}` : ""}` : String(w.damageBonus ?? 0),
  damageType: w.damageType,
  reach: w.reach === true,
  thrown: w.thrown === true,
  range: w.range ?? null,
}));

/**
 * Ataques de la tarjeta a partir de armas del catálogo (en el orden dado).
 * Un arma cuerpo a cuerpo arrojadiza da dos ataques: golpear y lanzar.
 */
export function attacksFromWeapons(weaponIds: readonly string[]): PartyAttackInput[] {
  return weaponIds.flatMap((id) => {
    const weapon = WEAPONS_2024.find((w) => w.id === id);
    if (!weapon) return [];
    return weaponAttacks(weapon).map((a) => ({
      label: a.thrown && weapon.kind === "melee" ? `${weapon.label} (lanzada)` : weapon.label,
      mode: a.mode,
      normalFeet: a.normalFeet,
      longFeet: a.longFeet,
      damageType: weapon.damageType,
      weaponId: weapon.id,
    }));
  });
}

/** Id del Golpe sin armas que tiene todo personaje (se añade solo). */
export const UNARMED_ATTACK_ID = "unarmed-strike";

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
  // Conjuros de daño: cada uno es una capacidad de la acción Magia.
  const capabilities: Capability[] = [];
  const characterLevel = characterLevelOf(input);
  for (const spellId of input.spellIds ?? []) {
    const spell = SPELLS_2024.find((s) => s.id === spellId);
    if (!spell) continue;
    const built = spellCapability(spell, input.spellSaveDc ?? null, characterLevel);
    if (!built) continue;
    if (built.attack) attacks.push(built.attack);
    capabilities.push(built.capability);
  }
  // Golpe sin armas: lo tiene toda criatura (REGLA OFICIAL VERIFICADA), así
  // que todo personaje puede hacer ataques de oportunidad (decisión 128).
  attacks.push({
    id: asAttackId(UNARMED_ATTACK_ID),
    label: UNARMED_STRIKE.label,
    mode: "melee",
    rangeFeet: { normal: UNARMED_STRIKE.reachFeet },
    toHitBonus: 0,
    damage: [{ dice: { count: 0, sides: 1 }, bonus: 0, type: UNARMED_STRIKE.damageType }],
  });
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
    ...(capabilities.length > 0 ? { capabilities } : {}),
  };
}

/** Nivel del personaje: la suma de sus clases (1 si no tiene ninguna anotada). */
export function characterLevelOf(input: PartyMemberInput): number {
  return Math.max(1, (input.classes ?? []).reduce((n, c) => n + (Number.isFinite(c.level) ? c.level : 0), 0));
}

/**
 * Capacidad del motor para un conjuro (acción Magia). Ataque de conjuro: un
 * ataque marcado como conjuro (fuera de Atacar y de los ataques de
 * oportunidad), repetido por rayos. Salvación: efecto con la CD del
 * personaje; el daño lo anota el jugador al lanzarlo. null si falta la CD.
 */
function spellCapability(
  spell: SpellEntry,
  spellSaveDc: number | null,
  characterLevel: number,
): { readonly attack: AttackDefinition | null; readonly capability: Capability } | null {
  const id = `spell-${spell.id}`;
  const effect = spell.effect;
  if (effect.kind === "attack") {
    const attack: AttackDefinition = {
      id: asAttackId(id),
      label: spell.label,
      mode: effect.mode,
      rangeFeet: { normal: effect.rangeFeet },
      toHitBonus: 0,
      damage: effect.damage.map((d) => ({ dice: { count: 0, sides: 1 }, bonus: 0, type: d.type })),
      spell: true,
    };
    const times = effect.attacks === "beams" ? beamsForCharacterLevel(characterLevel) : effect.attacks;
    const one: Operation = { op: "attack", attackRef: id };
    return {
      attack,
      capability: { id, label: spell.label, activation: "action", body: times === 1 ? one : { op: "repeat", times, body: one } },
    };
  }
  if (spellSaveDc === null || !Number.isInteger(spellSaveDc)) return null;
  const t = effect.targeting;
  return {
    attack: null,
    capability: {
      id,
      label: spell.label,
      activation: "action",
      body: {
        op: "effect",
        targeting:
          t.kind === "creature"
            ? { kind: "creatures", count: 1, rangeFeet: t.rangeFeet }
            : { kind: "area", shape: t.shape, sizeFeet: t.sizeFeet, rangeFeet: t.rangeFeet, ...(t.widthFeet ? { widthFeet: t.widthFeet } : {}) },
        save: { ability: effect.ability, dc: spellSaveDc, onSuccess: effect.onSuccess === "half" ? "halfDamage" : "negates" },
        effects: spellDamageAtLevel(spell, characterLevel).map((d) => ({ kind: "damage" as const, dice: d.dice, bonus: d.bonus, damageType: d.type })),
      },
    },
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

// ---------------------------------------------------------------------------
// Conjuros y clases para la tarjeta del personaje
// ---------------------------------------------------------------------------

export { CHARACTER_CLASSES } from "../rules";
export type { CharacterClassId } from "../rules";

/** Conjuro del catálogo tal como lo muestra la interfaz. */
export interface SpellCatalogEntry {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly level: number;
  readonly classes: readonly CharacterClassId[];
  readonly effect: SpellEntry["effect"];
  readonly unmodeled: readonly string[];
}

export const SPELL_CATALOG: readonly SpellCatalogEntry[] = SPELLS_2024.map((s) => ({ ...s }));
