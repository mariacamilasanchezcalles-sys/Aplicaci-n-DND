import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { asAttackId, asCreatureId } from "../src/models";
import type { CombatantDefinition, Encounter } from "../src/models";
import { applyTurnCommand, getTurnOptions, startTurn } from "../src/rules";
import type { SheetReactionOpportunity, TurnCommand, TurnState } from "../src/rules";
import { goblin } from "../src/scenarios/provisionalScenario";
import { combatantFromSheet, loadCreatureSheet } from "../src/sheets";
import { createSimulationPort } from "../src/combat-controller";
import { buildKnowledgeView, observeLogEntries, observeState, priorsForPartyLevel } from "../src/perception";
import { FEATURE_NAMES, decideReaction, simulatePlan } from "../src/tactical-brain";
import type { FeatureWeights } from "../src/tactical-brain";
import { emptyEncounter, engine, scriptedDice } from "./helpers";

/**
 * Reacciones de ficha (decisión 107): "Contragolpe" del bruto de prueba
 * (desencadenante: le impactan con un ataque; cuerpo: un zarpazo).
 */
const BRUTE = asCreatureId("brute");
const GOBLIN = asCreatureId("goblin-1");
type State = { encounter: Encounter; turn: TurnState };

function brute(): CombatantDefinition {
  const loaded = loadCreatureSheet(readFileSync(join(__dirname, "fixtures/sheets/test-brute.json"), "utf8"));
  if (!loaded.valid) throw new Error(JSON.stringify(loaded.errors));
  return combatantFromSheet(loaded.sheet, { creatureId: "brute", personality: "pragmatic" }).definition;
}

function setup(): State {
  let encounter = engine.addCombatant(emptyEncounter(16, 16), brute(), { column: 2, row: 2 }, { side: "others" });
  encounter = engine.addCombatant(encounter, { ...goblin, stats: { ...goblin.stats, maxHitPoints: 30 } }, { column: 4, row: 2 });
  return { encounter, turn: startTurn(encounter, GOBLIN) };
}

function run(state: State, command: TurnCommand, dice: readonly number[] = []): State {
  const result = applyTurnCommand(state.encounter, state.turn, command, scriptedDice(dice));
  if (!result.ok) throw new Error(`Orden rechazada: ${JSON.stringify(result)}`);
  return { encounter: result.encounter, turn: result.turn };
}

/** El goblin ataca al bruto con la cimitarra (d20 y 1d6). */
function goblinAttacks(d20: number): State {
  let s = run(setup(), { kind: "beginCapability", source: { kind: "standard", action: "attack" } });
  const option = getTurnOptions(s.encounter, s.turn).executionOptions.find((o) => o.choice.kind === "attack" && o.choice.targetId === BRUTE);
  if (!option) throw new Error("sin opción");
  s = run(s, { kind: "chooseOption", key: option.key }, [d20, 3]);
  return s;
}

describe("reacciones de ficha", () => {
  it("al impactar al bruto se le ofrece su Contragolpe contra quien pueda alcanzar", () => {
    const s = goblinAttacks(15);
    expect(s.turn.pendingReactions).toEqual([
      {
        kind: "sheetReaction",
        reactorId: BRUTE,
        capabilityId: "snap-back",
        trigger: "selfHitByAttack",
        triggeringCreatureId: GOBLIN,
        options: [{ attackId: asAttackId("claw"), targetId: GOBLIN }],
      },
    ]);
    // Mientras está pendiente no se acepta otra orden.
    const blocked = applyTurnCommand(s.encounter, s.turn, { kind: "endTurn" }, scriptedDice([]));
    expect(blocked.ok ? "aceptada" : blocked.reasonCode).toBe("reactionsPending");
  });

  it("si falla no hay reacción", () => {
    expect(goblinAttacks(2).turn.pendingReactions).toEqual([]);
  });

  it("al hacerla ataca, gasta la reacción y queda registrada", () => {
    const s = run(goblinAttacks(15), { kind: "resolveReaction", reactorId: BRUTE, take: true, targetId: GOBLIN }, [15, 5]);
    const entry = s.turn.log.at(-1);
    expect(entry?.kind).toBe("sheetReactionTaken");
    if (entry?.kind !== "sheetReactionTaken") return;
    expect(entry.capabilityId).toBe("snap-back");
    expect(entry.attack.targetId).toBe(GOBLIN);
    expect(entry.attack.damageApplied).toBe(9); // 1d8 (5) + 4
    expect(s.encounter.combatants[BRUTE]!.state.reactionAvailable).toBe(false);
    expect(s.turn.pendingReactions).toEqual([]);
    // Sin reacción disponible, otro impacto no la vuelve a ofrecer.
    let again = run(s, { kind: "endTurn" });
    again = { encounter: again.encounter, turn: startTurn(again.encounter, GOBLIN) };
    expect(again.encounter.combatants[BRUTE]!.state.reactionAvailable).toBe(false);
  });

  it("dejarla pasar no gasta la reacción", () => {
    const s = run(goblinAttacks(15), { kind: "resolveReaction", reactorId: BRUTE, take: false });
    expect(s.turn.log.at(-1)).toEqual({ kind: "reactionDeclined", reactorId: BRUTE });
    expect(s.encounter.combatants[BRUTE]!.state.reactionAvailable).toBe(true);
  });
});

describe("cerebro y reacciones de ficha", () => {
  const zero = Object.fromEntries(FEATURE_NAMES.map((n) => [n, 0])) as FeatureWeights;

  it("al planear un ataque al bruto cuenta el contragolpe solo si ya se lo ha visto usar", () => {
    const plan = {
      steps: [
        { kind: "begin" as const, source: { kind: "standard" as const, action: "attack" as const } },
        { kind: "attack" as const, attackId: asAttackId("scimitar"), targetId: BRUTE },
        { kind: "end" as const },
      ],
    };
    // Supuesto de nivel 5 (36 PG): el bando no cree que el bruto caiga con este golpe.
    const provokedBy = (encounter: Encounter) => {
      const view = buildKnowledgeView(encounter, GOBLIN, priorsForPartyLevel(5));
      const simulation = simulatePlan(createSimulationPort(encounter, view), GOBLIN, plan);
      return simulation.ok ? simulation.provoked.map((p) => p.reactorId) : null;
    };
    // Sin haberlo visto: no sabe que existe (solo usa lo percibido).
    expect(provokedBy(observeState(setup().encounter))).toEqual([]);
    // Lo ve contraatacar: su bando lo recuerda y lo anticipa.
    const before = goblinAttacks(15);
    const after = run(before, { kind: "resolveReaction", reactorId: BRUTE, take: true, targetId: GOBLIN }, [15, 5]);
    const seen = observeLogEntries(observeState(after.encounter), GOBLIN, after.turn.log);
    const memory = seen.sideKnowledge[seen.combatants[GOBLIN]!.side]!.creatures["brute"]!;
    expect(memory.reactionTriggersSeen).toEqual(["selfHitByAttack"]);
    const refreshed = {
      ...seen,
      combatants: { ...seen.combatants, [BRUTE]: { ...seen.combatants[BRUTE]!, state: { ...seen.combatants[BRUTE]!.state, reactionAvailable: true } } },
    };
    expect(provokedBy(refreshed)).toEqual([BRUTE]);
  });

  it("decide la reacción con los mismos rasgos y pesos", () => {
    const s = goblinAttacks(15);
    const e = observeState(s.encounter);
    const view = buildKnowledgeView(e, BRUTE, priorsForPartyLevel(1));
    const port = createSimulationPort(e, view);
    const opportunity = s.turn.pendingReactions[0] as SheetReactionOpportunity;
    expect(decideReaction(port, view, opportunity, zero)).toBeNull();
    expect(decideReaction(port, view, opportunity, { ...zero, damageDealt: 1 })).toMatchObject({ attackId: "claw", targetId: GOBLIN });
  });
});
