import { describe, expect, it } from "vitest";
import { asCreatureId } from "../src/models";
import {
  applyDamage,
  combineRollModes,
  mathRandomSource,
  resolveAttack,
  rollDice,
  rollDie,
} from "../src/rules";
import { cata, goblin } from "../src/scenarios/provisionalScenario";
import { buildScenario, scriptedDice } from "./helpers";

const scimitar = goblin.attacks[0]!; // +4; 1d6+2 cortante; +1d4 si la tirada tuvo ventaja
const vsGoblin = { attack: scimitar, target: goblin }; // CA 15

describe("dados: único punto de azar", () => {
  it("rollDie y rollDice consumen la fuente en orden", () => {
    const dice = scriptedDice([3, 5, 2]);
    expect(rollDie(6, dice)).toBe(3);
    expect(rollDice({ count: 2, sides: 6 }, dice)).toEqual({ rolls: [5, 2], total: 7 });
    expect(dice.remaining()).toBe(0);
  });

  it("valida las caras del dado y la respuesta de la fuente", () => {
    expect(() => rollDie(0, scriptedDice([1]))).toThrow(RangeError);
    expect(() => rollDie(2.5, scriptedDice([1]))).toThrow(RangeError);
    expect(() => rollDie(6, { nextInt: () => 7 })).toThrow(RangeError);
    expect(() => rollDice({ count: -1, sides: 6 }, scriptedDice([]))).toThrow(RangeError);
  });

  it("la fuente real devuelve enteros dentro del rango y alcanza ambos extremos", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const value = mathRandomSource.nextInt(1, 6);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(6);
      seen.add(value);
    }
    expect(seen.size).toBe(6);
  });
});

describe("ventaja y desventaja", () => {
  it("se cancelan entre sí y no se acumulan", () => {
    expect(combineRollModes(true, false)).toBe("advantage");
    expect(combineRollModes(false, true)).toBe("disadvantage");
    expect(combineRollModes(true, true)).toBe("normal");
    expect(combineRollModes(false, false)).toBe("normal");
  });
});

describe("resolución de un ataque", () => {
  it("impacta con total mayor que la CA y tira el daño base", () => {
    const dice = scriptedDice([15, 4]); // 15 + 4 = 19 >= 15; 1d6 = 4
    const r = resolveAttack({ ...vsGoblin, mode: "normal" }, dice);
    expect(r).toMatchObject({
      resolved: true,
      outcome: "hit",
      naturalRoll: 15,
      attackTotal: 19,
      targetArmorClass: 15,
      totalDamage: 6,
    });
    expect(dice.remaining()).toBe(0); // el 1d4 de ventaja no se tira
  });

  it("impacta si el total es igual a la CA", () => {
    const r = resolveAttack({ ...vsGoblin, mode: "normal" }, scriptedDice([11, 3])); // 11 + 4 = 15
    expect(r).toMatchObject({ outcome: "hit", attackTotal: 15, totalDamage: 5 });
  });

  it("falla si el total es menor que la CA y no tira daño", () => {
    const dice = scriptedDice([10]); // 14 < 15
    const r = resolveAttack({ ...vsGoblin, mode: "normal" }, dice);
    expect(r).toMatchObject({ outcome: "miss", damage: [], totalDamage: 0 });
    expect(dice.remaining()).toBe(0);
  });

  it("un 1 natural siempre falla", () => {
    const r = resolveAttack({ ...vsGoblin, target: { ...goblin, stats: { armorClass: 1 } }, mode: "normal" }, scriptedDice([1]));
    expect(r).toMatchObject({ outcome: "miss", naturalRoll: 1 });
  });

  it("un 20 natural siempre impacta y es crítico: los dados de daño se tiran dos veces", () => {
    const dice = scriptedDice([20, 1, 2]); // 1d6 dos veces: 1 + 2, +2 de modificador
    const r = resolveAttack(
      { ...vsGoblin, target: { ...goblin, stats: { armorClass: 30 } }, mode: "normal" },
      dice,
    );
    expect(r).toMatchObject({ outcome: "criticalHit", totalDamage: 5 });
    expect(dice.remaining()).toBe(0);
  });

  it("con ventaja se tiran dos d20, se usa el mayor y se añade el 1d4 extra", () => {
    const dice = scriptedDice([12, 9, 4, 2]); // d20: 12 y 9 -> 12; 1d6 = 4; 1d4 = 2
    const r = resolveAttack({ ...vsGoblin, mode: "advantage" }, dice);
    expect(r).toMatchObject({ outcome: "hit", naturalRoll: 12, d20Rolls: [12, 9], totalDamage: 4 + 2 + 2 });
    expect(r.resolved && r.damage.map((d) => d.type)).toEqual(["slashing", "slashing"]);
    expect(dice.remaining()).toBe(0);
  });

  it("crítico con ventaja: se duplican también los dados del 1d4 extra", () => {
    const dice = scriptedDice([20, 3, 5, 6, 2, 3]); // d20; 1d6 x2 = 5+6; 1d4 x2 = 2+3
    const r = resolveAttack(
      { ...vsGoblin, target: { ...goblin, stats: { armorClass: 30 } }, mode: "advantage" },
      dice,
    );
    expect(r).toMatchObject({ outcome: "criticalHit", totalDamage: 5 + 6 + 2 + 2 + 3 });
    expect(dice.remaining()).toBe(0);
  });

  it("con desventaja se tiran dos d20 y se usa el menor", () => {
    const dice = scriptedDice([18, 5]);
    const r = resolveAttack({ ...vsGoblin, mode: "disadvantage" }, dice);
    expect(r).toMatchObject({ outcome: "miss", naturalRoll: 5, attackTotal: 9 });
    expect(dice.remaining()).toBe(0);
  });

  it("sin CA registrada no se puede resolver y no se tira ningún dado", () => {
    const dice = scriptedDice([]);
    expect(resolveAttack({ attack: scimitar, target: cata, mode: "normal" }, dice)).toEqual({
      resolved: false,
      reason: "targetArmorClassUnknown",
    });
  });

  it("es determinista: la misma secuencia de dados da el mismo resultado", () => {
    const run = () => resolveAttack({ ...vsGoblin, mode: "advantage" }, scriptedDice([12, 9, 4, 2]));
    expect(run()).toEqual(run());
  });
});

describe("aplicar daño", () => {
  const goblinId = asCreatureId("goblin-1");

  it("resta PG sin mutar el encuentro original", () => {
    const e = buildScenario();
    const after = applyDamage(e, goblinId, 3);
    expect(after.combatants["goblin-1"]?.state.currentHitPoints).toBe(4);
    expect(e.combatants["goblin-1"]?.state.currentHitPoints).toBe(7);
  });

  it("los PG no bajan de 0", () => {
    const after = applyDamage(buildScenario(), goblinId, 100);
    expect(after.combatants["goblin-1"]?.state.currentHitPoints).toBe(0);
  });

  it("rechaza daño inválido, criaturas inexistentes y criaturas sin PG registrados", () => {
    const e = buildScenario();
    expect(() => applyDamage(e, goblinId, -1)).toThrow(RangeError);
    expect(() => applyDamage(e, goblinId, 1.5)).toThrow(RangeError);
    expect(() => applyDamage(e, asCreatureId("nadie"), 1)).toThrow();
    expect(() => applyDamage(e, asCreatureId("cata"), 1)).toThrow(/sin PG/);
  });
});
