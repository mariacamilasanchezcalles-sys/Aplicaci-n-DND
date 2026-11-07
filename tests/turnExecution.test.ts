import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { asCreatureId } from "../src/models";
import type { CombatantDefinition, CreatureId, Encounter, GridPosition } from "../src/models";
import {
  applyDamage,
  applyTurnCommand,
  previewEffect,
  capabilitySupport,
  getTurnOptions,
  startTurn,
} from "../src/rules";
import type {
  CapabilitySource,
  EffectInput,
  ExecutionChoice,
  TurnCommand,
  TurnCommandResult,
  TurnState,
} from "../src/rules";
import { goblin } from "../src/scenarios/provisionalScenario";
import { combatantFromSheet, loadCreatureSheet } from "../src/sheets";
import { emptyEncounter, engine, scriptedDice } from "./helpers";

const GOBLIN = asCreatureId("goblin-1");
const SKIRMISHER = asCreatureId("skirmisher");

/** Blanco con CA y PG registrados (copia del Goblin con otro id). */
function dummy(id: string, hp = 7): CombatantDefinition {
  return { ...goblin, id: asCreatureId(id), label: id, stats: { ...goblin.stats, maxHitPoints: hp } };
}

function skirmisherDefinition(): CombatantDefinition {
  const json = readFileSync(join(__dirname, "fixtures/sheets/test-skirmisher.json"), "utf8");
  const loaded = loadCreatureSheet(json);
  if (!loaded.valid) throw new Error(JSON.stringify(loaded.errors));
  const { definition, gaps } = combatantFromSheet(loaded.sheet, {
    creatureId: "skirmisher",
    personality: "pragmatic",
  });
  expect(gaps).toEqual([]);
  return definition;
}

function place(
  ...entries: readonly (readonly [CombatantDefinition, number, number])[]
): Encounter {
  let encounter = emptyEncounter(40, 20);
  for (const [definition, column, row] of entries) {
    encounter = engine.addCombatant(encounter, definition, { column, row });
  }
  return encounter;
}

const at = (column: number, row: number): GridPosition => ({ column, row });

/** Aplica una orden que debe ser legal y devuelve el nuevo estado. */
function run(
  state: { encounter: Encounter; turn: TurnState },
  command: TurnCommand,
  dice = scriptedDice([]),
): { encounter: Encounter; turn: TurnState } {
  const result = applyTurnCommand(state.encounter, state.turn, command, dice);
  if (!result.ok) throw new Error(`Orden rechazada: ${JSON.stringify(result)}`);
  return { encounter: result.encounter, turn: result.turn };
}

function begin(source: CapabilitySource): TurnCommand {
  return { kind: "beginCapability", source };
}

const STANDARD_ATTACK: CapabilitySource = { kind: "standard", action: "attack" };
const sheetCapability = (capabilityId: string): CapabilitySource => ({ kind: "sheet", capabilityId });

/** Clave de la opción que coincide con `match`. */
function keyOf(state: { encounter: Encounter; turn: TurnState }, match: Readonly<Record<string, string>>): string {
  const options = getTurnOptions(state.encounter, state.turn).executionOptions;
  const found = options.find((o) => Object.entries(match).every(([k, v]) => (o.choice as Record<string, unknown>)[k] === v));
  if (!found) throw new Error(`Opción no disponible: ${JSON.stringify(match)} en ${JSON.stringify(options)}`);
  return found.key;
}

function choices(state: { encounter: Encounter; turn: TurnState }): ExecutionChoice[] {
  return getTurnOptions(state.encounter, state.turn).executionOptions.map((o) => o.choice);
}

function rejected(result: TurnCommandResult): string {
  return result.ok ? "aceptada" : result.reasonCode;
}

describe("ejecutor: inicio de turno y acción de Atacar estándar", () => {
  it("empieza con la economía de acciones y el movimiento a cero", () => {
    const encounter = place([goblin, 10, 5]);
    const turn = startTurn(encounter, GOBLIN);
    expect(turn).toMatchObject({
      serial: 0,
      budgetFeet: 30,
      actionUsed: false,
      bonusActionUsed: false,
      execution: null,
      ended: false,
      movement: { position: at(10, 5), spentFeet: 0, diagonalCount: 0 },
    });
  });

  it("no se paga la acción de Atacar si no hay ningún objetivo al alcance", () => {
    // El arco corto llega a 320 pies: sin ninguna otra criatura no hay objetivo.
    const encounter = place([goblin, 10, 5]);
    const turn = startTurn(encounter, GOBLIN);
    const result = applyTurnCommand(encounter, turn, begin(STANDARD_ATTACK), scriptedDice([]));
    expect(rejected(result)).toBe("noLegalOptions");
    expect(getTurnOptions(encounter, turn).capabilities).not.toContainEqual(STANDARD_ATTACK);
  });

  it("mueve, ataca, aplica el daño y paga la acción una sola vez", () => {
    const encounter = place([goblin, 10, 5], [dummy("target"), 6, 5]);
    let state = { encounter, turn: startTurn(encounter, GOBLIN) };
    state = run(state, { kind: "move", path: [at(9, 5), at(8, 5), at(7, 5)] });
    expect(state.turn.movement.spentFeet).toBe(15);

    state = run(state, begin(STANDARD_ATTACK));
    expect(state.turn.actionUsed).toBe(true);
    // Cimitarra (cuerpo a cuerpo) y Arco corto contra el único blanco.
    expect(choices(state)).toEqual([
      { kind: "attack", attackId: "scimitar", targetId: "target", rollMode: "normal" },
      { kind: "attack", attackId: "shortbow", targetId: "target", rollMode: "normal" },
    ]);

    // d20 = 15 (+4 = 19 >= CA 15, impacto), 1d6 = 4 → 4 + 2 = 6 de daño.
    const dice = scriptedDice([15, 4]);
    state = run(state, { kind: "chooseOption", key: keyOf(state, { attackId: "scimitar" }) }, dice);
    expect(dice.remaining()).toBe(0);
    expect(state.encounter.combatants["target"]?.state.currentHitPoints).toBe(1);
    expect(state.turn.execution).toBeNull();
    expect(state.turn.log.map((e) => e.kind)).toEqual([
      "moved",
      "capabilityBegun",
      "attackResolved",
      "capabilityFinished",
    ]);

    // La acción ya está gastada: no se puede volver a atacar ni correr.
    expect(rejected(applyTurnCommand(state.encounter, state.turn, begin(STANDARD_ATTACK), scriptedDice([])))).toBe(
      "activationUnavailable",
    );
    expect(getTurnOptions(state.encounter, state.turn).capabilities).toEqual([
      { kind: "bonusAction", bonusActionId: "nimble-escape" },
    ]);
  });

  it("a distancia más allá del alcance normal se tira con Desventaja (regla verificada)", () => {
    // 18 casillas = 90 pies (> 80 normal, <= 320 largo).
    const encounter = place([goblin, 10, 5], [dummy("target"), 28, 5]);
    let state = { encounter, turn: startTurn(encounter, GOBLIN) };
    state = run(state, begin(STANDARD_ATTACK));
    expect(choices(state)).toEqual([
      { kind: "attack", attackId: "shortbow", targetId: "target", rollMode: "disadvantage" },
    ]);
    // Desventaja: dos d20, se usa el menor (3 + 4 = 7, falla).
    const dice = scriptedDice([18, 3]);
    state = run(state, { kind: "chooseOption", key: keyOf(state, {}) }, dice);
    const entry = state.turn.log.find((e) => e.kind === "attackResolved");
    expect(entry).toMatchObject({ resolution: { d20Rolls: [18, 3], naturalRoll: 3, outcome: "miss" } });
  });

  it("un objetivo sin CA registrada no se resuelve y no consume nada", () => {
    const cata: CombatantDefinition = { ...dummy("cata"), stats: {} };
    const encounter = place([goblin, 10, 5], [cata, 9, 5]);
    let state = { encounter, turn: startTurn(encounter, GOBLIN) };
    state = run(state, begin(STANDARD_ATTACK));
    const before = state;
    const result = applyTurnCommand(state.encounter, state.turn, { kind: "chooseOption", key: keyOf(state, { attackId: "scimitar" }) }, scriptedDice([10]));
    expect(rejected(result)).toBe("targetArmorClassUnknown");
    expect(state).toEqual(before);
  });
});

describe("ejecutor: acciones estándar y acción adicional", () => {
  it("Correr suma la Velocidad al movimiento del turno", () => {
    const encounter = place([goblin, 0, 0]);
    let state = { encounter, turn: startTurn(encounter, GOBLIN) };
    state = run(state, begin({ kind: "standard", action: "dash" }));
    state = run(state, { kind: "chooseOption", key: keyOf(state, { action: "dash" }) });
    expect(state.turn.budgetFeet).toBe(60);
    const path = Array.from({ length: 12 }, (_, i) => at(i + 1, 0));
    state = run(state, { kind: "move", path });
    expect(state.turn.movement.spentFeet).toBe(60);
    expect(rejected(applyTurnCommand(state.encounter, state.turn, { kind: "move", path: [at(13, 0)] }, scriptedDice([])))).toBe(
      "movementNotAllowedNow",
    );
  });

  it("Escapismo Ágil ofrece Destrabarse pero no Esconderse (aún no modelado)", () => {
    const encounter = place([goblin, 10, 5]);
    let state = { encounter, turn: startTurn(encounter, GOBLIN) };
    state = run(state, begin({ kind: "bonusAction", bonusActionId: "nimble-escape" }));
    expect(choices(state)).toEqual([{ kind: "standardAction", action: "disengage" }]);
    state = run(state, { kind: "chooseOption", key: keyOf(state, { action: "disengage" }) });
    expect(state.turn).toMatchObject({ disengaged: true, bonusActionUsed: true, actionUsed: false, execution: null });
  });
});

describe("ejecutor: Multiataque (capacidad compuesta)", () => {
  it("dos ataques con reevaluación, movimiento entre ataques y Mordisco opcional si el último impacta", () => {
    const encounter = place([skirmisherDefinition(), 10, 5], [dummy("near", 30), 11, 5], [dummy("far", 30), 20, 5]);
    let state = { encounter, turn: startTurn(encounter, SKIRMISHER) };
    state = run(state, begin(sheetCapability("multiattack")));
    expect(state.turn.actionUsed).toBe(true);
    expect(choices(state)).toEqual([
      { kind: "attack", attackId: "claw", targetId: "near", rollMode: "normal" },
      // "far" está a 50 pies: más allá del alcance normal (30) → Desventaja.
      { kind: "attack", attackId: "javelin", targetId: "far", rollMode: "disadvantage" },
      { kind: "attack", attackId: "javelin", targetId: "near", rollMode: "normal" },
    ]);

    // 1.er ataque: Garra a "near", impacta (12 + 5 = 17 >= 15), 1d6 = 2 → 5.
    state = run(state, { kind: "chooseOption", key: keyOf(state, { attackId: "claw", targetId: "near" }) }, scriptedDice([12, 2]));
    expect(state.encounter.combatants["near"]?.state.currentHitPoints).toBe(25);
    const staleKey = keyOf(state, { attackId: "claw", targetId: "near" });

    // Se puede mover entre ataques de la acción de Atacar (regla verificada).
    expect(getTurnOptions(state.encounter, state.turn).canMove).toBe(true);
    state = run(state, { kind: "move", path: [at(10, 6), at(10, 7)] });
    // "near" es del mismo bando (monstruos): no se le ofrece ataque de oportunidad.
    expect(state.turn.pendingReactions).toEqual([]);
    expect(state.encounter.combatants["skirmisher"]?.state.position).toEqual(at(10, 7));

    // Revalidación: desde la nueva casilla "near" ya no está al alcance de la Garra.
    expect(choices(state)).toEqual([
      { kind: "attack", attackId: "javelin", targetId: "far", rollMode: "disadvantage" },
      { kind: "attack", attackId: "javelin", targetId: "near", rollMode: "normal" },
    ]);
    // Una clave calculada antes del movimiento ya no sirve (no se ejecuta dos veces nada).
    expect(rejected(applyTurnCommand(state.encounter, state.turn, { kind: "chooseOption", key: staleKey }, scriptedDice([20, 6])))).toBe(
      "staleOption",
    );

    // 2.º ataque: Jabalina a "far" con Desventaja (15 y 16 → 15 + 5 = 20), impacta.
    state = run(state, { kind: "chooseOption", key: keyOf(state, { attackId: "javelin", targetId: "far" }) }, scriptedDice([15, 16, 1]));
    expect(state.turn.execution).not.toBeNull();
    // Mordisco cuerpo a cuerpo: nadie adyacente, así que solo queda terminar.
    expect(choices(state)).toEqual([{ kind: "finish" }]);
    state = run(state, { kind: "chooseOption", key: keyOf(state, { kind: "finish" }) });
    expect(state.turn.execution).toBeNull();
    expect(state.turn.log.filter((e) => e.kind === "attackResolved")).toHaveLength(2);
  });

  it("si el último ataque falla, el Mordisco no se ofrece", () => {
    const encounter = place([skirmisherDefinition(), 10, 5], [dummy("near", 30), 11, 5]);
    let state = { encounter, turn: startTurn(encounter, SKIRMISHER) };
    state = run(state, begin(sheetCapability("multiattack")));
    state = run(state, { kind: "chooseOption", key: keyOf(state, { attackId: "claw" }) }, scriptedDice([15, 1]));
    // Falla: 2 + 5 = 7 < 15.
    state = run(state, { kind: "chooseOption", key: keyOf(state, { attackId: "claw" }) }, scriptedDice([2]));
    expect(choices(state)).toEqual([{ kind: "finish" }]);
  });

  it("si el último ataque impacta, el Mordisco se ofrece junto a terminar", () => {
    const encounter = place([skirmisherDefinition(), 10, 5], [dummy("near", 30), 11, 5]);
    let state = { encounter, turn: startTurn(encounter, SKIRMISHER) };
    state = run(state, begin(sheetCapability("multiattack")));
    state = run(state, { kind: "chooseOption", key: keyOf(state, { attackId: "claw" }) }, scriptedDice([2]));
    state = run(state, { kind: "chooseOption", key: keyOf(state, { attackId: "claw" }) }, scriptedDice([15, 1]));
    expect(choices(state)).toEqual([
      { kind: "attack", attackId: "bite", targetId: "near", rollMode: "normal" },
      { kind: "finish" },
    ]);
    // Mordisco: daño fijo 2, sin dados de daño.
    state = run(state, { kind: "chooseOption", key: keyOf(state, { attackId: "bite" }) }, scriptedDice([15]));
    expect(state.encounter.combatants["near"]?.state.currentHitPoints).toBe(30 - 4 - 2);
    expect(state.turn.execution).toBeNull();
  });

  it("renunciar al resto: queda registrado y la acción no se devuelve", () => {
    const encounter = place([skirmisherDefinition(), 10, 5], [dummy("near", 30), 11, 5]);
    let state = { encounter, turn: startTurn(encounter, SKIRMISHER) };
    state = run(state, begin(sheetCapability("multiattack")));
    state = run(state, { kind: "chooseOption", key: keyOf(state, { attackId: "claw" }) }, scriptedDice([2]));
    state = run(state, { kind: "forfeitRemaining" });
    expect(state.turn.execution).toBeNull();
    expect(state.turn.actionUsed).toBe(true);
    expect(state.turn.log.at(-1)).toEqual({
      kind: "capabilityFinished",
      source: sheetCapability("multiattack"),
      outcome: "forfeited",
      hadLegalOptions: true,
    });
  });

  it("en una capacidad que no es la acción de Atacar no se mueve entre operaciones", () => {
    const encounter = place([skirmisherDefinition(), 10, 5], [dummy("near", 30), 11, 5]);
    let state = { encounter, turn: startTurn(encounter, SKIRMISHER) };
    state = run(state, begin(sheetCapability("lunge")));
    state = run(state, { kind: "chooseOption", key: keyOf(state, { attackId: "claw" }) }, scriptedDice([2]));
    expect(getTurnOptions(state.encounter, state.turn).canMove).toBe(false);
    expect(rejected(applyTurnCommand(state.encounter, state.turn, { kind: "move", path: [at(10, 6)] }, scriptedDice([])))).toBe(
      "movementNotAllowedNow",
    );
    expect(rejected(applyTurnCommand(state.encounter, state.turn, { kind: "endTurn" }, scriptedDice([])))).toBe(
      "executionInProgress",
    );
  });
});

describe("ejecutor: requisitos y mecánicas no modeladas", () => {
  it("un requisito (Maltrecha) se evalúa con el estado actual", () => {
    const encounter = place([skirmisherDefinition(), 10, 5]);
    const turn = startTurn(encounter, SKIRMISHER);
    expect(rejected(applyTurnCommand(encounter, turn, begin(sheetCapability("rally")), scriptedDice([])))).toBe(
      "requirementsNotMet",
    );
    // 10 de 20 PG: Maltrecha (la mitad o menos).
    const bloodied = applyDamage(encounter, SKIRMISHER, 10);
    const result = applyTurnCommand(bloodied, startTurn(bloodied, SKIRMISHER), begin(sheetCapability("rally")), scriptedDice([]));
    expect(result.ok).toBe(true);
  });

  it("una capacidad con mecánicas no modeladas no se puede iniciar ni se ofrece", () => {
    const definition = skirmisherDefinition();
    expect(capabilitySupport(definition, sheetCapability("howl"))).toEqual(["operationNotModeled"]);
    const encounter = place([definition, 10, 5]);
    const turn = startTurn(encounter, SKIRMISHER);
    expect(rejected(applyTurnCommand(encounter, turn, begin(sheetCapability("howl")), scriptedDice([])))).toBe(
      "capabilityNotSupported",
    );
    expect(getTurnOptions(encounter, turn).capabilities).not.toContainEqual(sheetCapability("howl"));
  });

  it("la ficha compleja: el Multiataque (con un ataque que agarra) es ejecutable; la reacción aún no", () => {
    const json = readFileSync(join(__dirname, "fixtures/sheets/test-brute.json"), "utf8");
    const loaded = loadCreatureSheet(json);
    if (!loaded.valid) throw new Error("ficha no válida");
    const { definition } = combatantFromSheet(loaded.sheet, { creatureId: "brute", personality: "pragmatic" });
    expect(capabilitySupport(definition, sheetCapability("multiattack"))).toEqual([]);
    // Coste (carga del aliento), salvación y área ya están modelados.
    expect(capabilitySupport(definition, sheetCapability("breath"))).toEqual([]);
    expect(capabilitySupport(definition, sheetCapability("snap-back"))).toEqual(["reactionsNotModeled"]);
  });
});

describe("ejecutor: fin de turno e invariantes", () => {
  it("no se termina el turno en un espacio ocupado; después de terminar no se acepta nada", () => {
    const encounter = place([goblin, 10, 5], [dummy("ally"), 11, 5]);
    let state = { encounter, turn: startTurn(encounter, GOBLIN) };
    state = run(state, { kind: "move", path: [at(11, 5)] });
    const blocked = applyTurnCommand(state.encounter, state.turn, { kind: "endTurn" }, scriptedDice([]));
    expect(blocked).toEqual({ ok: false, reasonCode: "invalidSquare", placementReason: "occupied" });
    state = run(state, { kind: "move", path: [at(12, 5)] });
    state = run(state, { kind: "endTurn" });
    expect(state.turn.ended).toBe(true);
    expect(rejected(applyTurnCommand(state.encounter, state.turn, { kind: "move", path: [at(13, 5)] }, scriptedDice([])))).toBe(
      "turnEnded",
    );
  });

  it("reproducible: mismas órdenes y mismos dados producen exactamente el mismo resultado", () => {
    const play = () => {
      const encounter = place([skirmisherDefinition(), 10, 5], [dummy("near", 30), 11, 5]);
      let state = { encounter, turn: startTurn(encounter, SKIRMISHER) };
      const dice = scriptedDice([14, 3, 19, 6, 11]);
      state = run(state, begin(sheetCapability("multiattack")));
      state = run(state, { kind: "chooseOption", key: keyOf(state, { attackId: "claw" }) }, dice);
      state = run(state, { kind: "chooseOption", key: keyOf(state, { attackId: "claw" }) }, dice);
      state = run(state, { kind: "chooseOption", key: keyOf(state, { attackId: "bite" }) }, dice);
      return JSON.stringify(state);
    };
    expect(play()).toBe(play());
  });

  it("toda opción ofrecida es aceptada por el motor (el que elige solo ve opciones legales)", () => {
    const encounter = place([skirmisherDefinition(), 10, 5], [dummy("a", 50), 11, 5], [dummy("b", 50), 14, 8]);
    const explore = (state: { encounter: Encounter; turn: TurnState }, depth: number): number => {
      const options = getTurnOptions(state.encounter, state.turn);
      let checked = 0;
      for (const source of options.capabilities) {
        const result = applyTurnCommand(state.encounter, state.turn, begin(source), scriptedDice([]));
        expect(result.ok).toBe(true);
        checked++;
        if (result.ok && depth > 0) checked += explore(result, depth - 1);
      }
      for (const option of options.executionOptions) {
        // Una opción de efecto con objetivos elegidos se completa con el
        // primer objetivo que la vista previa acepte (siempre debe haber uno).
        let effectInput: EffectInput | undefined;
        if (option.choice.kind === "effect" && option.choice.targeting === "creatures") {
          const ids = Object.keys(state.encounter.combatants) as CreatureId[];
          const valid = ids.find((id) => previewEffect(state.encounter, state.turn, option.key, { targetIds: [id] }).ok);
          expect(valid).toBeDefined();
          effectInput = { targetIds: [valid as CreatureId] };
        }
        // Dados fijos en 4 (suficientes para cualquier opción, impacte o no).
        const result = applyTurnCommand(
          state.encounter,
          state.turn,
          effectInput ? { kind: "chooseOption", key: option.key, effectInput } : { kind: "chooseOption", key: option.key },
          scriptedDice(Array(10).fill(4)),
        );
        expect(result.ok).toBe(true);
        checked++;
        if (result.ok && depth > 0) checked += explore(result, depth - 1);
      }
      return checked;
    };
    expect(explore({ encounter, turn: startTurn(encounter, SKIRMISHER) }, 4)).toBeGreaterThan(10);
  });
});
