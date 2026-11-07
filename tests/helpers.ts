import { asCreatureId } from "../src/models";
import type {
  ActionOption,
  CombatantDefinition,
  CreatureSize,
  Encounter,
  GridPosition,
} from "../src/models";
import { createRulesEngine } from "../src/rules";
import type { RandomSource } from "../src/rules";
import {
  PROVISIONAL_SCENARIO,
  TABLE_RULES_OF_THE_PLAYERS_TABLE,
  goblin,
} from "../src/scenarios/provisionalScenario";

export const engine = createRulesEngine();

/**
 * Mesa de la jugadora sin las reglas caseras de la guía 2014 que añaden
 * tiradas o Ventaja (Flanquear, Marcar, Daño masivo, Moral), para que las
 * pruebas del motor base no dependan de ellas. Cada regla casera tiene sus
 * propias pruebas.
 */
export const CORE_TEST_TABLE_RULES = {
  ...TABLE_RULES_OF_THE_PLAYERS_TABLE,
  flanking: false,
  mark: false,
  massiveDamage: false,
  morale: false,
} as const;

export function emptyEncounter(columns = 16, rows = 16, id = "e-test"): Encounter {
  return engine.createEncounter({
    id: id as never,
    label: "Prueba",
    grid: {
      feetPerSquare: 5,
      terrain: "open",
      dimensions: { columns, rows },
    },
    occupancyPolicy: "one-creature-per-space",
    tableRules: CORE_TEST_TABLE_RULES,
  });
}

export function buildScenario(): Encounter {
  let encounter = engine.createEncounter({
    id: PROVISIONAL_SCENARIO.encounterId,
    label: PROVISIONAL_SCENARIO.label,
    grid: PROVISIONAL_SCENARIO.grid,
    occupancyPolicy: PROVISIONAL_SCENARIO.occupancyPolicy,
    tableRules: PROVISIONAL_SCENARIO.tableRules,
  });
  for (const { definition, position } of PROVISIONAL_SCENARIO.placements) {
    encounter = engine.addCombatant(encounter, definition, position);
  }
  return encounter;
}

/** Encuentro grande con solo el goblin en (10, 5) y, opcionalmente, otras criaturas. */
export function goblinAlone(
  others: readonly { definition: CombatantDefinition; position: GridPosition }[] = [],
  columns = 40,
  rows = 20,
): Encounter {
  let encounter = engine.addCombatant(emptyEncounter(columns, rows), goblin, { column: 10, row: 5 });
  for (const { definition, position } of others) {
    encounter = engine.addCombatant(encounter, definition, position);
  }
  return encounter;
}

export const copyOfGoblin = (id: string, size: CreatureSize = "small"): CombatantDefinition => ({
  ...goblin,
  id: asCreatureId(id),
  size,
});

/** Paso de movimiento a partir de pares [columna, fila]. */
export const move = (...squares: readonly (readonly [number, number])[]): ActionOption => ({
  slot: "movement",
  path: squares.map(([column, row]) => ({ column, row })),
});

/** Una fila recta de `count` casillas hacia la derecha desde (column, row). */
export const straightRight = (fromColumn: number, row: number, count: number): ActionOption =>
  move(...Array.from({ length: count }, (_, i) => [fromColumn + 1 + i, row] as const));

/** Fuente de dados con valores predefinidos, para pruebas reproducibles. */
export function scriptedDice(values: readonly number[]): RandomSource & { remaining(): number } {
  const queue = [...values];
  return {
    nextInt(min, max) {
      const value = queue.shift();
      if (value === undefined) throw new Error("scriptedDice: se agotaron los valores");
      if (value < min || value > max) {
        throw new Error(`scriptedDice: ${value} fuera de [${min}, ${max}]`);
      }
      return value;
    },
    remaining: () => queue.length,
  };
}
