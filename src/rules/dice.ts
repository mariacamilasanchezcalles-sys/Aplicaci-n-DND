import type { DiceExpression } from "../models";

/**
 * ÚNICO punto de azar del proyecto: tirar dados. Todo lo demás (reglas,
 * decisiones de monstruos) es determinista. La fuente se inyecta para que las
 * pruebas y las simulaciones reproducibles puedan sustituirla.
 */
export interface RandomSource {
  /** Entero uniforme en [minInclusive, maxInclusive]. */
  nextInt(minInclusive: number, maxInclusive: number): number;
}

/** Fuente real basada en Math.random. Es la única que usa azar de verdad. */
export const mathRandomSource: RandomSource = {
  nextInt(minInclusive, maxInclusive) {
    return Math.floor(Math.random() * (maxInclusive - minInclusive + 1)) + minInclusive;
  },
};

export function rollDie(sides: number, source: RandomSource): number {
  if (!Number.isInteger(sides) || sides < 1) {
    throw new RangeError(`Un dado necesita un número entero de caras >= 1 (recibido: ${sides})`);
  }
  const value = source.nextInt(1, sides);
  if (!Number.isInteger(value) || value < 1 || value > sides) {
    throw new RangeError(`La fuente de azar devolvió ${value}, fuera de [1, ${sides}]`);
  }
  return value;
}

export interface DiceRoll {
  readonly rolls: readonly number[];
  readonly total: number;
}

/** Tira `count` dados de `sides` caras (sin modificadores). */
export function rollDice(expression: DiceExpression, source: RandomSource): DiceRoll {
  if (!Number.isInteger(expression.count) || expression.count < 0) {
    throw new RangeError(`Cantidad de dados no válida: ${expression.count}`);
  }
  const rolls: number[] = [];
  for (let i = 0; i < expression.count; i++) {
    rolls.push(rollDie(expression.sides, source));
  }
  return { rolls, total: rolls.reduce((sum, value) => sum + value, 0) };
}
