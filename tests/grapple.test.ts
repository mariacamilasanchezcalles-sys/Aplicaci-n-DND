import { describe, expect, it } from "vitest";
import { asAttackId, asCreatureId } from "../src/models";
import type { AttackDefinition, CombatantDefinition, Encounter, GridPosition } from "../src/models";
import { applyCondition, applyTurnCommand, effectiveSpeed, getTurnOptions, startTurn } from "../src/rules";
import type { TurnCommand, TurnState } from "../src/rules";
import { goblin } from "../src/scenarios/provisionalScenario";
import { emptyEncounter, engine, scriptedDice } from "./helpers";

/**
 * Condiciones al impactar y Agarrado. REGLAS OFICIALES VERIFICADAS (glosario
 * 2024, "Grappled", "Grappling"): Velocidad 0; escapar usa la acción (FUE
 * Atletismo o DES Acrobacias contra la CD de escape); termina si quien agarra
 * queda Incapacitado o si la distancia supera el alcance; con la parte que
 * agarra solo se agarra a una criatura.
 */
const GRAPPLER = asCreatureId("grappler");
const A = asCreatureId("a");
const B = asCreatureId("b");
const grab = asAttackId("grab");

const grabAttack: AttackDefinition = {
  id: grab,
  label: "Agarrar",
  mode: "melee",
  rangeFeet: { normal: 5 },
  toHitBonus: 5,
  damage: [{ dice: { count: 1, sides: 4 }, bonus: 0, type: "bludgeoning" }],
  onHitConditions: [{ condition: "grappled", duration: { kind: "untilEscape", escapeDc: 12 }, targetMaxSize: "medium" }],
};
const grappler: CombatantDefinition = { ...goblin, id: GRAPPLER, label: "grappler", attacks: [grabAttack], stats: { ...goblin.stats, maxHitPoints: 30 } };
const dummy = (id: string, size: CombatantDefinition["size"] = "small"): CombatantDefinition => ({
  ...goblin,
  id: asCreatureId(id),
  label: id,
  size,
  stats: { ...goblin.stats, maxHitPoints: 30 },
});

const at = (column: number, row: number): GridPosition => ({ column, row });
type State = { encounter: Encounter; turn: TurnState };

function place(...entries: readonly (readonly [CombatantDefinition, number, number])[]): Encounter {
  let encounter = emptyEncounter(20, 20);
  for (const [definition, column, row] of entries) encounter = engine.addCombatant(encounter, definition, { column, row });
  return encounter;
}

function run(state: State, command: TurnCommand, dice: readonly number[] = []): State {
  const result = applyTurnCommand(state.encounter, state.turn, command, scriptedDice(dice));
  if (!result.ok) throw new Error(`Orden rechazada: ${JSON.stringify(result)}`);
  return { encounter: result.encounter, turn: result.turn };
}

/** Ataca con `grab` a `targetId` (d20 y 1d4 guionizados). */
function grabAt(state: State, targetId: string, d20: number): State {
  let s = state.turn.execution === null ? run(state, { kind: "beginCapability", source: { kind: "standard", action: "attack" } }) : state;
  const option = getTurnOptions(s.encounter, s.turn).executionOptions.find(
    (o) => o.choice.kind === "attack" && o.choice.targetId === targetId,
  );
  if (!option) throw new Error("sin opción de ataque");
  s = run(s, { kind: "chooseOption", key: option.key }, [d20, 2]);
  return s;
}

const grappledBy = (encounter: Encounter, id: string) =>
  encounter.combatants[id]!.state.conditions.filter((c) => c.condition === "grappled");

describe("condiciones al impactar", () => {
  it("al impactar aplica Agarrado con su CD de escape, la parte que agarra y su alcance", () => {
    const encounter = place([grappler, 5, 5], [dummy("a"), 6, 5]);
    const s = grabAt({ encounter, turn: startTurn(encounter, GRAPPLER) }, "a", 15);
    expect(grappledBy(s.encounter, "a")).toEqual([
      { condition: "grappled", sourceId: GRAPPLER, duration: { kind: "untilEscape", escapeDc: 12 }, viaAttackId: grab, rangeFeet: 5 },
    ]);
    expect(effectiveSpeed(s.encounter.combatants[A]!)).toBe(0);
    const entry = s.turn.log.find((e) => e.kind === "attackResolved");
    expect(entry?.kind === "attackResolved" && entry.conditionsApplied).toEqual(["grappled"]);
  });

  it("si falla, o el objetivo es demasiado grande, no hay condición", () => {
    const encounter = place([grappler, 5, 5], [dummy("a"), 6, 5], [dummy("big", "large"), 4, 6]);
    const missed = grabAt({ encounter, turn: startTurn(encounter, GRAPPLER) }, "a", 1);
    expect(grappledBy(missed.encounter, "a")).toEqual([]);
    const large = grabAt({ encounter, turn: startTurn(encounter, GRAPPLER) }, "big", 15);
    expect(grappledBy(large.encounter, "big")).toEqual([]);
  });
});

describe("Agarrado: fin del agarre", () => {
  it("termina si quien agarra se aleja más allá del alcance", () => {
    const encounter = place([grappler, 5, 5], [dummy("a"), 6, 5]);
    let s = grabAt({ encounter, turn: startTurn(encounter, GRAPPLER) }, "a", 15);
    s = run(s, { kind: "move", path: [at(4, 5)] });
    expect(grappledBy(s.encounter, "a")).toEqual([]);
  });

  it("atacar a otra criatura con la misma parte suelta el primer agarre", () => {
    const encounter = place(
      [{ ...grappler, stats: { ...grappler.stats, attacksPerAttackAction: 2 } }, 5, 5],
      [dummy("a"), 6, 5],
      [dummy("b"), 4, 5],
    );
    let s = grabAt({ encounter, turn: startTurn(encounter, GRAPPLER) }, "a", 15);
    s = grabAt(s, "b", 15);
    expect(grappledBy(s.encounter, "a")).toEqual([]);
    expect(grappledBy(s.encounter, "b")).toHaveLength(1);
  });

  it("termina si quien agarra queda Incapacitado", () => {
    const encounter = place([grappler, 5, 5], [dummy("a"), 6, 5]);
    let s = grabAt({ encounter, turn: startTurn(encounter, GRAPPLER) }, "a", 15);
    s = run(s, { kind: "endTurn" });
    const stunned = applyCondition(s.encounter, GRAPPLER, "stunned", null, { kind: "indefinite" });
    if (!stunned.applied) throw new Error("no aplicada");
    // Se comprueba tras la siguiente orden de cualquiera.
    const next = run({ encounter: stunned.encounter, turn: startTurn(stunned.encounter, A) }, { kind: "endTurn" });
    expect(grappledBy(next.encounter, "a")).toEqual([]);
  });
});

describe("Agarrado: escapar", () => {
  function grabbed(): State {
    const encounter = place([grappler, 5, 5], [dummy("a"), 6, 5]);
    const s = grabAt({ encounter, turn: startTurn(encounter, GRAPPLER) }, "a", 15);
    return { encounter: s.encounter, turn: startTurn(s.encounter, A) };
  }

  it("un monstruo usa su acción y tira con la mejor de FUE y DES (DES 15: +2)", () => {
    const s = grabbed();
    expect(getTurnOptions(s.encounter, s.turn).escapeFrom).toEqual([GRAPPLER]);
    const failed = run(s, { kind: "escapeGrapple", grapplerId: GRAPPLER }, [9]);
    expect(grappledBy(failed.encounter, "a")).toHaveLength(1);
    expect(failed.turn.actionUsed).toBe(true);
    expect(failed.turn.log.at(-1)).toEqual({
      kind: "escapeAttempt",
      grapplerId: GRAPPLER,
      check: { source: "virtual", ability: "dex", d20: 9, bonus: 2, penalty: 0, total: 11, dc: 12, success: false },
    });
    // Sin acción no puede volver a intentarlo.
    expect(getTurnOptions(failed.encounter, failed.turn).escapeFrom).toEqual([]);
    const escaped = run(s, { kind: "escapeGrapple", grapplerId: GRAPPLER }, [10]);
    expect(grappledBy(escaped.encounter, "a")).toEqual([]);
    // Empezó el turno con Velocidad 0; al escapar recupera su movimiento.
    expect(s.turn.budgetFeet).toBe(0);
    expect(escaped.turn.budgetFeet).toBe(30);
    expect(getTurnOptions(escaped.encounter, escaped.turn).canMove).toBe(true);
  });

  it("un jugador anota su prueba física; sin ella se rechaza", () => {
    const s = grabbed();
    const pcState = {
      ...s,
      encounter: {
        ...s.encounter,
        combatants: {
          ...s.encounter.combatants,
          a: { ...s.encounter.combatants[A]!, definition: { ...s.encounter.combatants[A]!.definition, kind: "playerCharacter" as const } },
        },
      } as Encounter,
    };
    const missing = applyTurnCommand(pcState.encounter, pcState.turn, { kind: "escapeGrapple", grapplerId: GRAPPLER }, scriptedDice([]));
    expect(missing.ok ? "aceptada" : missing.reasonCode).toBe("playerCheckRequired");
    const escaped = run(pcState, { kind: "escapeGrapple", grapplerId: GRAPPLER, playerCheck: { total: 12 } });
    expect(grappledBy(escaped.encounter, "a")).toEqual([]);
  });

  it("no puede escapar de quien no lo agarra", () => {
    const s = grabbed();
    const result = applyTurnCommand(s.encounter, s.turn, { kind: "escapeGrapple", grapplerId: B }, scriptedDice([]));
    expect(result.ok ? "aceptada" : result.reasonCode).toBe("notGrappled");
  });
});
