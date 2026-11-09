import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { asCreatureId } from "../src/models";
import type { RandomSource } from "../src/rules";
import {
  beginCombat,
  buildEncounter,
  canAdvance,
  deathSave,
  loadBestiary,
  nextTurn,
  outcomeOf,
  partyMemberIssues,
  playerCommand,
  playerTurnView,
  redeploy,
  respond,
  rollInitiative,
  startSession,
} from "../src/ui-bridge";
import type { CombatSnapshot, EncounterSetup, PartyMemberInput, PlayerInput } from "../src/ui-bridge";

/** Núcleo de las pantallas: bestiario, personajes, preparación y sesión de combate. */
const goblinJson = readFileSync(join(__dirname, "../data/sheets/goblin-warrior.json"), "utf8");
const middle: RandomSource = { nextInt: (min, max) => Math.floor((min + max) / 2) };

const cata: PartyMemberInput = {
  key: "cata",
  label: "Cata",
  description: "Guerrera",
  size: "medium",
  maxHitPoints: 20,
  currentHitPoints: 20,
  armorClass: 16,
  speedFeet: 30,
  attacks: [{ label: "Espada larga", mode: "melee", normalFeet: 5, longFeet: null, damageType: "slashing" }],
};
const cain: PartyMemberInput = { ...cata, key: "cain", label: "Caín", description: "", maxHitPoints: 14, currentHitPoints: 14, armorClass: 12, attacks: [{ label: "Rayo de fuego", mode: "ranged", normalFeet: 120, longFeet: null, damageType: "fire" }] };

const setup = (overrides: Partial<EncounterSetup> = {}): EncounterSetup => ({
  id: "enc-1",
  label: "Prueba",
  monsters: [{ sheetId: "goblin-warrior", count: 3, personality: "aggressive" }],
  party: [cata, cain],
  partyLevel: 1,
  difficulty: "easy",
  customDifficulty: null,
  ...overrides,
});

describe("bestiario y personajes", () => {
  it("carga el Goblin con su Valor de Desafío y resumen", () => {
    const bestiary = loadBestiary([goblinJson, "{no es json"]);
    expect(bestiary.invalid).toEqual([1]);
    expect(bestiary.entries).toEqual([
      expect.objectContaining({ sheetId: "goblin-warrior", label: "Goblin", size: "small", creatureType: "fey", challengeRating: "1/4", armorClass: 15, hitPoints: 10, speedFeet: 30 }),
    ]);
    expect(bestiary.entries[0]!.attacks.map((a) => a.label)).toEqual(["Cimitarra", "Arco corto"]);
  });

  it("valida la tarjeta del personaje con códigos", () => {
    expect(partyMemberIssues(cata)).toEqual([]);
    expect(partyMemberIssues({ ...cata, label: " ", currentHitPoints: 25, speedFeet: 32, attacks: [{ ...cata.attacks[0]!, normalFeet: 3 }] })).toEqual([
      "labelRequired",
      "currentHitPointsInvalid",
      "speedInvalid",
      "attackRangeInvalid",
    ]);
  });
});

describe("preparación del encuentro", () => {
  const bestiary = loadBestiary([goblinJson]);

  it("crea instancias independientes, despliega y guarda nivel y dificultad", () => {
    const built = buildEncounter(setup(), bestiary);
    if (!built.ok) throw new Error(JSON.stringify(built.issues));
    const e = built.encounter;
    expect(Object.keys(e.combatants).sort()).toEqual(["goblin-warrior-1", "goblin-warrior-2", "goblin-warrior-3", "pc-1-cata", "pc-2-cain"]);
    expect(e.combatants["goblin-warrior-2"]!.definition.label).toBe("Goblin 2");
    expect(e.grid.dimensions).toEqual({ columns: 15, rows: 21 });
    expect(e.brainSettings).toEqual({
      partyLevel: 1,
      difficultyByCreature: { "goblin-warrior-1": "easy", "goblin-warrior-2": "easy", "goblin-warrior-3": "easy" },
      customDifficulty: null,
    });
    // Monstruos arriba, personajes abajo.
    expect(e.combatants["goblin-warrior-1"]!.state.position.row).toBeLessThan(5);
    expect(e.combatants["pc-1-cata"]!.state.position.row).toBeGreaterThan(15);
    // Cada instancia tiene su propio estado.
    expect(e.combatants["goblin-warrior-1"]!.state).not.toBe(e.combatants["goblin-warrior-2"]!.state);
  });

  it("explica con códigos por qué no se puede crear", () => {
    const built = buildEncounter(setup({ monsters: [], party: [], partyLevel: 0, difficulty: "custom" }), bestiary);
    expect(built.ok ? [] : built.issues).toEqual(["noMonsters", "noParty", "partyLevelInvalid", "customDifficultyMissing"]);
  });
});

describe("sesión de combate", () => {
  const bestiary = loadBestiary([goblinJson]);
  const fresh = (): CombatSnapshot => {
    const built = buildEncounter(setup({ monsters: [{ sheetId: "goblin-warrior", count: 1, personality: "pragmatic" }] }), bestiary);
    if (!built.ok) throw new Error("setup");
    return startSession(built.encounter);
  };

  it("despliegue: recoloca con las reglas de colocación; después ya no", () => {
    const s = fresh();
    const occupied = s.encounter.combatants["pc-2-cain"]!.state.position;
    const blocked = redeploy(s, asCreatureId("pc-1-cata"), occupied);
    expect(blocked.ok ? "ok" : blocked.reason).toBe("occupied");
    const moved = redeploy(s, asCreatureId("pc-1-cata"), { column: 7, row: 10 });
    expect(moved.ok && moved.session.encounter.combatants["pc-1-cata"]!.state.position).toEqual({ column: 7, row: 10 });
    const rolled = rollInitiative(s, middle);
    if (!rolled.ok) throw new Error("iniciativa");
    expect(redeploy(rolled.session, asCreatureId("pc-1-cata"), { column: 7, row: 10 }).ok).toBe(false);
  });

  it("iniciativa: pide desempates y empieza; el monstruo juega solo y llega el turno de un personaje", () => {
    const rolled = rollInitiative(fresh(), middle);
    if (!rolled.ok) throw new Error("iniciativa");
    const goblinTotal = rolled.session.monsterInitiative!["goblin-warrior-1"]!;
    // 10 + 2 con los dados centrales.
    expect(goblinTotal).toBe(12);
    const tie = beginCombat(rolled.session, { "pc-1-cata": 12, "pc-2-cain": 3 }, [], middle);
    expect(tie.ok ? "ok" : tie.reason).toBe("tiesUndecided");
    let started = beginCombat(rolled.session, { "pc-1-cata": 5, "pc-2-cain": 3 }, [], middle);
    if (!started.ok) throw new Error(started.reason);
    let s = started.session;
    // El goblin (12) actúa primero: o termina su turno o espera un dato del jugador.
    while (s.pending !== null) s = respond(s, answerNo(s), middle);
    expect(s.phase === "turn" || s.phase === "finished").toBe(true);
    if (s.phase === "turn") {
      expect(canAdvance(s)).toBe(true);
      s = nextTurn(s, middle);
      while (s.pending !== null) s = respond(s, answerNo(s), middle);
      const view = playerTurnView(s);
      expect(view?.actorId).toBe("pc-1-cata");
      expect(view!.options.canEndTurn).toBe(true);
      // Una orden ilegal se rechaza con su código.
      const bad = playerCommand(s, { kind: "move", path: [{ column: 0, row: 0 }] }, middle);
      expect(bad.ok).toBe(false);
      const ended = playerCommand(s, { kind: "endTurn" }, middle);
      expect(ended.ok && ended.session.turn?.ended).toBe(true);
    }
    expect(s.log.some((e) => e.item.kind === "combatStarted")).toBe(true);
  });

  it("salvación contra la muerte en el turno de un personaje a 0 PG y fin del combate", () => {
    const rolled = rollInitiative(fresh(), middle);
    if (!rolled.ok) throw new Error("iniciativa");
    const s0 = rolled.session;
    // Cata empieza a 0 PG (moribunda) y actúa primero.
    const cataRecord = s0.encounter.combatants["pc-1-cata"]!;
    const dying = {
      ...s0,
      encounter: {
        ...s0.encounter,
        combatants: {
          ...s0.encounter.combatants,
          "pc-1-cata": { ...cataRecord, state: { ...cataRecord.state, currentHitPoints: 0, lifeState: "dying" as const } },
        },
      },
    };
    const started = beginCombat(dying, { "pc-1-cata": 20, "pc-2-cain": 3 }, [], middle);
    if (!started.ok) throw new Error(started.reason);
    expect(playerTurnView(started.session)?.dying).toBe(true);
    const saved = deathSave(started.session, 20, middle);
    expect(saved.ok && saved.session.turn?.ended).toBe(true);
    expect(saved.ok && saved.session.encounter.combatants["pc-1-cata"]!.state.currentHitPoints).toBe(1);
    // Sin monstruos en pie: victoria.
    const e = saved.ok ? saved.session.encounter : s0.encounter;
    const gob = e.combatants["goblin-warrior-1"]!;
    const won = { ...e, combatants: { ...e.combatants, [gob.definition.id]: { ...gob, state: { ...gob.state, lifeState: "dead" as const, currentHitPoints: 0 } } } };
    expect(outcomeOf(won)).toBe("victory");
  });
});

/** Respuesta por defecto en las pruebas: no reaccionar, salvaciones superadas. */
function answerNo(s: CombatSnapshot): PlayerInput {
  const request = s.pending!;
  if (request.kind === "playerReaction") return { kind: "playerReaction", reactorId: request.opportunity.reactorId, take: false };
  if (request.kind === "playerPendingSave") return { kind: "playerPendingSave", creatureId: request.creatureId, playerSave: { outcome: "success" } };
  return { kind: "playerSaves", saves: Object.fromEntries(request.creatureIds.map((id) => [id, { outcome: "success" as const }])) };
}
