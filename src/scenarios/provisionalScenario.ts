import { asAttackId, asBonusActionId, asCreatureId, asEncounterId } from "../models";
import type {
  CombatantDefinition,
  GridConfig,
  GridPosition,
  MonsterDefinition,
  OccupancyPolicy,
  PlayerCharacterDefinition,
} from "../models";

/**
 * DATOS DE PRUEBA PROVISIONALES. No son lógica táctica ni reglas confirmadas.
 *
 * Los 7 PG del Goblin son un dato provisional del escenario de prueba y NO
 * son las estadísticas definitivas del Goblin Warrior de 2024 (la ficha
 * oficial tiene otros PG). Ver `PROVISIONAL_FIELDS` y docs/RULES_VERIFICATION.md.
 * El resto de datos de ataque, tamaño y Escapismo Ágil coinciden con la ficha
 * del Monster Manual 2024, pero el escenario completo sigue siendo de prueba.
 */
export const goblin: MonsterDefinition = {
  kind: "monster",
  id: asCreatureId("goblin-1"),
  label: "Goblin",
  personality: "pragmatic",
  size: "small",
  stats: { maxHitPoints: 7, armorClass: 15, speedFeet: 30 },
  attacks: [
    {
      id: asAttackId("scimitar"),
      label: "Cimitarra",
      mode: "melee",
      rangeFeet: { normal: 5 },
      toHitBonus: 4,
      damage: [
        { dice: { count: 1, sides: 6 }, bonus: 2, type: "slashing" },
        {
          dice: { count: 1, sides: 4 },
          bonus: 0,
          type: "slashing",
          condition: "attackRollHadAdvantage",
        },
      ],
    },
    {
      id: asAttackId("shortbow"),
      label: "Arco corto",
      mode: "ranged",
      rangeFeet: { normal: 80, long: 320 },
      toHitBonus: 4,
      damage: [
        { dice: { count: 1, sides: 6 }, bonus: 2, type: "piercing" },
        {
          dice: { count: 1, sides: 4 },
          bonus: 0,
          type: "piercing",
          condition: "attackRollHadAdvantage",
        },
      ],
    },
  ],
  bonusActions: [
    {
      id: asBonusActionId("nimble-escape"),
      label: "Escapismo Ágil",
      allowedActions: ["disengage", "hide"],
    },
  ],
  traits: [],
};

export const cata: PlayerCharacterDefinition = {
  kind: "playerCharacter",
  registration: "simplified",
  id: asCreatureId("cata"),
  label: "Cata",
  testRole: "melee-fighter",
  size: "medium",
  stats: {},
  attacks: [],
  bonusActions: [],
  traits: [],
};

export const cain: PlayerCharacterDefinition = {
  kind: "playerCharacter",
  registration: "simplified",
  id: asCreatureId("cain"),
  label: "Caín",
  testRole: "ranged-spellcaster",
  size: "medium",
  stats: {},
  attacks: [],
  bonusActions: [],
  traits: [],
};

export interface ScenarioPlacement {
  readonly definition: CombatantDefinition;
  readonly position: GridPosition;
}

/**
 * Campos de este escenario que son provisionales y no deben tratarse como
 * estadísticas definitivas de ninguna criatura.
 */
export const PROVISIONAL_FIELDS: Readonly<Record<string, readonly string[]>> = {
  "goblin-1": ["stats.maxHitPoints"],
  cata: ["size", "stats", "attacks"],
  cain: ["size", "stats", "attacks"],
};

/**
 * Mapa de 15 columnas x 21 filas (decisión del proyecto). El área visible en
 * pantalla (5 x 9, con desplazamiento y zoom) es un requisito de interfaz
 * aparte, ver docs/UI_REQUIREMENTS.md.
 */
export const PROVISIONAL_GRID_DIMENSIONS = { columns: 15, rows: 21 } as const;

export const PROVISIONAL_SCENARIO = {
  encounterId: asEncounterId("provisional-1"),
  label: "Escenario provisional",
  grid: {
    feetPerSquare: 5,
    terrain: "open",
    dimensions: PROVISIONAL_GRID_DIMENSIONS,
    diagonalRule: "alternating-1-2",
  } satisfies GridConfig,
  occupancyPolicy: "one-creature-per-space" satisfies OccupancyPolicy,
  placements: [
    { definition: goblin, position: { column: 10, row: 5 } },
    { definition: cata, position: { column: 6, row: 5 } },
    { definition: cain, position: { column: 10, row: 11 } },
  ] satisfies readonly ScenarioPlacement[],
} as const;
