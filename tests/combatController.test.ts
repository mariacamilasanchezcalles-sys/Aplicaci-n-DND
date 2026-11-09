import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { asAttackId, asCreatureId } from "../src/models";
import type { CombatantDefinition, Encounter } from "../src/models";
import { applyTurnCommand, beginCreatureTurn, startTurn } from "../src/rules";
import type { RandomSource } from "../src/rules";
import { resolveMonsterReactions, runMonsterTurn, startMonsterTurn, stepMonsterTurn } from "../src/combat-controller";
import type { MonsterTurnSession, MonsterTurnStatus, PlayerInput } from "../src/combat-controller";
import { goblin } from "../src/scenarios/provisionalScenario";
import { combatantFromSheet, loadCreatureSheet } from "../src/sheets";
import { emptyEncounter, engine } from "./helpers";

/**
 * Controlador de combate (etapa 6). Se prueba el MECANISMO: turno completo
 * legal, revalidación y replanificación, peticiones al jugador y reacciones
 * de monstruos. Cuando hace falta un plan concreto se fija a mano (la sesión
 * es un dato), para no depender de decisiones tácticas.
 */
const G = asCreatureId("goblin-1");
const CATA = asCreatureId("cata");
const CAIN = asCreatureId("cain");
const DRAKE = asCreatureId("drake");

/** Dados reales simulados: siempre el valor central (determinista). */
const middleDice: RandomSource = { nextInt: (min, max) => Math.floor((min + max) / 2) };

const pc = (name: string, ac = 16, hp = 20): CombatantDefinition => ({
  kind: "playerCharacter",
  registration: "simplified",
  testRole: "melee-fighter",
  id: asCreatureId(name),
  label: name,
  size: "medium",
  stats: { maxHitPoints: hp, armorClass: ac, speedFeet: 30 },
  attacks: [{ id: asAttackId("sword"), label: "Espada", mode: "melee", rangeFeet: { normal: 5 }, toHitBonus: 5, damage: [{ dice: { count: 1, sides: 8 }, bonus: 3, type: "slashing" }] }],
  bonusActions: [],
  traits: [],
});
const goblin10: CombatantDefinition = { ...goblin, stats: { ...goblin.stats, maxHitPoints: 10 } };

function drake(): CombatantDefinition {
  const loaded = loadCreatureSheet(readFileSync(join(__dirname, "fixtures/sheets/test-drake.json"), "utf8"));
  if (!loaded.valid) throw new Error(JSON.stringify(loaded.errors));
  return combatantFromSheet(loaded.sheet, { creatureId: "drake", personality: "pragmatic" }).definition;
}

function place(entries: readonly (readonly [CombatantDefinition, number, number])[], partyLevel: number | null = 1): Encounter {
  let e = emptyEncounter(15, 21);
  for (const [d, column, row] of entries) e = engine.addCombatant(e, d, { column, row });
  return { ...e, brainSettings: { ...e.brainSettings, partyLevel } };
}

function session(encounter: Encounter, actorId = G): MonsterTurnSession {
  const begun = beginCreatureTurn(encounter, actorId, middleDice);
  return startMonsterTurn(begun.encounter, begun.turn);
}

/** Sesión con un plan fijado a mano. */
const withPlan = (s: MonsterTurnSession, steps: MonsterTurnSession["remaining"]): MonsterTurnSession => ({ ...s, remaining: steps, replans: 1 });

describe("controlador: turno de un monstruo", () => {
  it("sin nivel del grupo no puede pensar", () => {
    const status = runMonsterTurn(session(place([[goblin10, 5, 5], [pc("cata"), 6, 5]], null)), middleDice);
    expect(status.status === "error" && status.reason).toBe("partyLevelRequired");
  });

  it("juega un turno completo y legal, y publica su intención en la pizarra del bando", () => {
    const status = runMonsterTurn(session(place([[goblin10, 5, 5], [pc("cata"), 6, 5]])), middleDice);
    expect(status.status).toBe("ended");
    const { session: s } = status;
    expect(s.turn.ended).toBe(true);
    expect(s.events[0]?.kind).toBe("planned");
    expect(s.events.some((e) => e.kind === "executed" && e.command.kind === "endTurn")).toBe(true);
    const side = s.encounter.combatants[G]!.side;
    expect(s.encounter.sideIntentions[side]?.intentions[G]?.creatureId).toBe(G);
  });

  it("un paso que ya no es legal se rechaza y replanifica", () => {
    // Plan imposible: atacar a Caín, que está lejos.
    const start = withPlan(session(place([[goblin10, 5, 5], [pc("cata"), 6, 5], [pc("cain"), 12, 18]])), [
      { kind: "begin", source: { kind: "standard", action: "attack" } },
      { kind: "attack", attackId: asAttackId("scimitar"), targetId: CAIN },
      { kind: "end" },
    ]);
    const status = runMonsterTurn(start, middleDice);
    expect(status.status).toBe("ended");
    const events = status.session.events;
    const rejected = events.findIndex((e) => e.kind === "stepRejected");
    expect(rejected).toBeGreaterThanOrEqual(0);
    expect(events.slice(rejected).some((e) => e.kind === "planned" && e.reason === "stepNotLegal")).toBe(true);
  });

  it("pide las salvaciones de los jugadores contra un efecto y sigue al recibirlas", () => {
    const start = withPlan(
      session(place([[drake(), 2, 2], [pc("cata"), 5, 3], [pc("cain"), 6, 2]]), DRAKE),
      [
        { kind: "begin", source: { kind: "sheet", capabilityId: "breath" } },
        { kind: "effect", placement: { origin: { column: 4, row: 3 }, direction: "e" } },
        { kind: "end" },
      ],
    );
    const waiting = runMonsterTurn(start, middleDice);
    expect(waiting.status).toBe("awaitingPlayer");
    if (waiting.status !== "awaitingPlayer") return;
    expect(waiting.request).toEqual({ kind: "playerSaves", creatureIds: [CAIN, CATA], ability: "dex", dc: 13 });
    const done = runMonsterTurn(waiting.session, middleDice, {
      kind: "playerSaves",
      saves: { cata: { total: 15 }, cain: { outcome: "failure" } },
    });
    expect(done.status).toBe("ended");
    const effect = done.session.turn.log.find((e) => e.kind === "effectResolved");
    expect(effect?.kind === "effectResolved" && effect.targets.map((t) => [t.targetId, t.save?.success])).toEqual([
      ["cain", false],
      ["cata", true],
    ]);
  });

  it("pide al jugador si hace su ataque de oportunidad", () => {
    // Plan fijado: alejarse de Cata sin Destrabarse.
    const start = withPlan(session(place([[goblin10, 5, 5], [pc("cata"), 6, 5]])), [
      { kind: "move", path: [{ column: 4, row: 5 }, { column: 3, row: 5 }] },
      { kind: "end" },
    ]);
    const waiting = runMonsterTurn(start, middleDice);
    expect(waiting.status).toBe("awaitingPlayer");
    if (waiting.status !== "awaitingPlayer") return;
    expect(waiting.request.kind === "playerReaction" && waiting.request.opportunity.reactorId).toBe(CATA);
    const done: MonsterTurnStatus = runMonsterTurn(waiting.session, middleDice, { kind: "playerReaction", reactorId: CATA, take: false });
    expect(done.status).toBe("ended");
    expect(done.session.turn.log.some((e) => e.kind === "reactionDeclined")).toBe(true);
  });

  it("una respuesta para otra petición no hace avanzar", () => {
    const start = withPlan(session(place([[goblin10, 5, 5], [pc("cata"), 6, 5]])), [
      { kind: "move", path: [{ column: 4, row: 5 }] },
      { kind: "end" },
    ]);
    const waiting = runMonsterTurn(start, middleDice);
    if (waiting.status !== "awaitingPlayer") throw new Error("debía esperar");
    const again = stepMonsterTurn(waiting.session, middleDice, { kind: "playerPendingSave", creatureId: CATA, playerSave: { outcome: "success" } });
    expect(again.status).toBe("awaitingPlayer");
    expect(again.session).toBe(waiting.session);
  });
});

describe("controlador: reacciones de monstruos en el turno de otro", () => {
  it("el cerebro decide el ataque de oportunidad del goblin cuando Cata se aleja", () => {
    const encounter = place([[goblin10, 5, 5], [pc("cata"), 6, 5]]);
    const turn = startTurn(encounter, CATA);
    const moved = applyTurnCommand(encounter, turn, { kind: "move", path: [{ column: 7, row: 5 }] }, middleDice);
    if (!moved.ok) throw new Error(JSON.stringify(moved));
    expect(moved.turn.pendingReactions.map((r) => r.reactorId)).toEqual([G]);
    const resolved = resolveMonsterReactions(moved.encounter, moved.turn, middleDice);
    expect(resolved.decisions.map((d) => d.reactorId)).toEqual([G]);
    expect(resolved.turn.pendingReactions).toEqual([]);
    // Con la reacción resuelta, el movimiento de Cata sigue.
    expect(resolved.encounter.combatants[CATA]!.state.position).toEqual({ column: 7, row: 5 });
  });
});

describe("ui-bridge: turno de monstruo desde la fachada", () => {
  it("con nivel del grupo y dificultad fijados en el encuentro, juega y guarda el resultado", async () => {
    const { createCombatCoreApi, asEncounterId } = await import("../src/ui-bridge");
    const api = createCombatCoreApi(engine, middleDice);
    const id = asEncounterId("fachada");
    api.createEncounter({ ...emptyEncounter(15, 21), id, label: "Fachada" });
    api.registerCombatant(id, goblin10, { column: 5, row: 5 });
    api.registerCombatant(id, pc("cata"), { column: 6, row: 5 });
    api.setBrainSettings(id, { partyLevel: 1, difficultyByCreature: { "goblin-1": "easy" } });
    const before = api.getEncounter(id);
    const view = api.playMonsterTurn(id, startTurn(before, G));
    expect(view.status).toBe("ended");
    expect(view.turn.ended).toBe(true);
    expect(api.getEncounter(id)).not.toBe(before);
    expect(() => api.continueMonsterTurn(id, { kind: "playerSaves", saves: {} })).toThrow();
  });
});

describe("controlador: combate de varios asaltos", () => {
  it("dos goblins (Difícil, cooperan) contra dos personajes que pasan turno: ningún turno se atasca", async () => {
    const { advanceTurn, startCombat } = await import("../src/rules");
    const G2 = asCreatureId("goblin-2");
    let e = place([
      [goblin10, 5, 5],
      [{ ...goblin10, id: G2, label: "goblin-2" }, 9, 9],
      [pc("cata"), 7, 7],
      [pc("cain", 12, 14), 12, 15],
    ]);
    e = { ...e, brainSettings: { partyLevel: 1, difficultyByCreature: { "goblin-1": "hard", "goblin-2": "hard" } } };
    const started = startCombat(e, { "goblin-1": 20, "goblin-2": 15, cata: 10, cain: 5 });
    if (!started.ok) throw new Error(JSON.stringify(started));
    e = started.encounter;
    let turn = null as ReturnType<typeof startTurn> | null;
    let monsterTurns = 0;
    for (let i = 0; i < 12; i++) {
      const next = advanceTurn(e, turn, middleDice);
      if (!next.ok) throw new Error(JSON.stringify(next));
      e = next.encounter;
      turn = next.turn;
      const actor = e.combatants[turn.actorId]!;
      if (actor.definition.kind === "monster") {
        let status = runMonsterTurn(startMonsterTurn(e, turn), middleDice);
        // Los personajes nunca reaccionan ni salvan en esta prueba: se responde que no / falla.
        while (status.status === "awaitingPlayer") {
          const request = status.request;
          const input: PlayerInput =
            request.kind === "playerReaction"
              ? ({ kind: "playerReaction", reactorId: request.opportunity.reactorId, take: false } as const)
              : request.kind === "playerPendingSave"
                ? ({ kind: "playerPendingSave", creatureId: request.creatureId, playerSave: { outcome: "success" } } as const)
                : ({ kind: "playerSaves", saves: Object.fromEntries(request.creatureIds.map((id) => [id, { outcome: "failure" as const }])) } as const);
          status = runMonsterTurn(status.session, middleDice, input);
        }
        expect(status.status, `turno ${i} de ${turn.actorId}`).toBe("ended");
        e = status.session.encounter;
        turn = status.session.turn;
        monsterTurns++;
      } else {
        // El personaje pasa; las reacciones de monstruos (si hubiera) las decide el cerebro.
        const ended = applyTurnCommand(e, turn, { kind: "endTurn" }, middleDice);
        if (!ended.ok) throw new Error(JSON.stringify(ended));
        e = ended.encounter;
        turn = ended.turn;
      }
    }
    expect(monsterTurns).toBeGreaterThanOrEqual(5);
    expect(e.round).toBe(3);
  }, 60_000);
});
