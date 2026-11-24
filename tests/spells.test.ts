import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { asCreatureId } from "../src/models";
import { SPELLS_2024, applyTurnCommand, capabilitySupport, getTurnOptions, spellDamageAtLevel, startTurn } from "../src/rules";
import type { RandomSource } from "../src/rules";
import {
  SPELL_CATALOG,
  buildEncounter,
  effectChoices,
  loadBestiary,
  partyMemberIssues,
  playerCharacterDefinition,
  redeploy,
  startSession,
} from "../src/ui-bridge";
import type { CombatSnapshot, PartyMemberInput } from "../src/ui-bridge";

/** Conjuros de daño de los personajes (SRD 5.2.1) y clases con multiclase. */
const middle: RandomSource = { nextInt: (min, max) => Math.floor((min + max) / 2) };
const caster: PartyMemberInput = {
  key: "cain",
  label: "Caín",
  description: "",
  size: "medium",
  maxHitPoints: 14,
  currentHitPoints: 14,
  armorClass: 12,
  speedFeet: 30,
  attacks: [],
  classes: [{ classId: "wizard", level: 5 }],
  spellIds: ["fire-bolt", "fireball"],
  spellSaveDc: 14,
};

describe("catálogo de conjuros", () => {
  it("32 conjuros de daño del SRD con clases válidas", () => {
    expect(SPELL_CATALOG).toHaveLength(32);
    expect(SPELL_CATALOG.find((s) => s.id === "fireball")).toMatchObject({
      level: 3,
      classes: ["sorcerer", "wizard"],
      effect: { kind: "save", ability: "dex", onSuccess: "half", targeting: { kind: "area", shape: "sphere", sizeFeet: 20, rangeFeet: 150 } },
    });
  });
});

describe("tarjeta: clases, multiclase y CD", () => {
  it("valida niveles, clases repetidas, nivel total y la CD si hay conjuros de salvación", () => {
    expect(partyMemberIssues(caster)).toEqual([]);
    expect(
      partyMemberIssues({
        ...caster,
        classes: [
          { classId: "wizard", level: 15 },
          { classId: "wizard", level: 6 },
        ],
        spellSaveDc: null,
      }),
    ).toEqual(["classRepeated", "totalLevelOver20", "spellSaveDcRequired"]);
    // Solo conjuros de ataque: no hace falta CD.
    expect(partyMemberIssues({ ...caster, spellIds: ["fire-bolt"], spellSaveDc: null })).toEqual([]);
  });
});

describe("conjuros en el motor", () => {
  it("un ataque de conjuro es una capacidad (Magia), no sale en Atacar ni en ataques de oportunidad", () => {
    const def = playerCharacterDefinition(caster, "pc-1-cain");
    expect(def.attacks.find((a) => a.id === "spell-fire-bolt")).toMatchObject({ spell: true, mode: "ranged", rangeFeet: { normal: 120 } });
    expect(def.capabilities?.map((c) => [c.id, c.activation])).toEqual([
      ["spell-fire-bolt", "action"],
      ["spell-fireball", "action"],
    ]);
    expect(capabilitySupport(def, { kind: "sheet", capabilityId: "spell-fireball" })).toEqual([]);
    expect(def.capabilities![1]!.body).toMatchObject({ op: "effect", save: { ability: "dex", dc: 14, onSuccess: "halfDamage" } });
  });

  it("Descarga sobrenatural: rayos según el nivel total del personaje (multiclase)", () => {
    const warlock = { ...caster, spellIds: ["eldritch-blast"], classes: [{ classId: "warlock" as const, level: 3 }, { classId: "fighter" as const, level: 2 }] };
    const body = playerCharacterDefinition(warlock, "w").capabilities![0]!.body;
    expect(body).toMatchObject({ op: "repeat", times: 2 });
  });
});

describe("mejora de los trucos (Cantrip Upgrade)", () => {
  it("un dado más a los niveles 5, 11 y 17; los conjuros con nivel no cambian", () => {
    const flame = SPELLS_2024.find((s) => s.id === "sacred-flame")!;
    const fireball = SPELLS_2024.find((s) => s.id === "fireball")!;
    expect([1, 4, 5, 10, 11, 17, 20].map((l) => spellDamageAtLevel(flame, l)[0]!.dice.count)).toEqual([1, 1, 2, 2, 3, 4, 4]);
    expect(spellDamageAtLevel(fireball, 20)[0]!.dice.count).toBe(8);
  });
});

describe("lanzar una Bola de fuego en combate", () => {
  const goblinJson = readFileSync(join(__dirname, "../data/sheets/goblin-warrior.json"), "utf8");

  function setup(): CombatSnapshot {
    const bestiary = loadBestiary([goblinJson]);
    const built = buildEncounter(
      { id: "e", label: "e", monsters: [{ sheetId: "goblin-warrior", count: 2, personality: "pragmatic" }], party: [caster], partyLevel: 5, difficulty: "easy", customDifficulty: null },
      bestiary,
    );
    if (!built.ok) throw new Error(JSON.stringify(built.issues));
    let s = startSession(built.encounter);
    // Caín a distancia de los goblins.
    const moved = redeploy(s, asCreatureId("pc-1-cain"), { column: 7, row: 9 });
    if (!moved.ok) throw new Error("redeploy");
    s = moved.session;
    return { ...s, turn: startTurn(s.encounter, asCreatureId("pc-1-cain")), phase: "turn" };
  }

  it("ofrece grupos de afectados y aplica el daño anotado (los goblins salvan con dados virtuales)", () => {
    let s = setup();
    const begun = applyTurnCommand(s.encounter, s.turn!, { kind: "beginCapability", source: { kind: "sheet", capabilityId: "spell-fireball" } }, middle);
    if (!begun.ok) throw new Error(JSON.stringify(begun));
    s = { ...s, encounter: begun.encounter, turn: begun.turn };
    const option = getTurnOptions(s.encounter, s.turn!).executionOptions.find((o) => o.choice.kind === "effect")!;
    const choices = effectChoices(s, option.key);
    expect(choices?.kind).toBe("area");
    if (choices?.kind !== "area") return;
    // El primer grupo es el más numeroso: los dos goblins (y no Caín).
    expect(choices.groups[0]!.affected).toEqual(["goblin-warrior-1", "goblin-warrior-2"]);
    expect(choices.groups[0]!.squares.length).toBeGreaterThan(0);
    const placement = choices.groups[0]!.placement;
    // Sin el daño del jugador, se pide.
    const missing = applyTurnCommand(s.encounter, s.turn!, { kind: "chooseOption", key: option.key, effectInput: { placement } }, middle);
    expect(missing.ok ? "ok" : missing.reasonCode).toBe("playerDamageRequired");
    const cast = applyTurnCommand(s.encounter, s.turn!, { kind: "chooseOption", key: option.key, effectInput: { placement, playerDamage: { fire: 28 } } }, middle);
    if (!cast.ok) throw new Error(JSON.stringify(cast));
    const entry = cast.turn.log.find((e) => e.kind === "effectResolved");
    expect(entry?.kind === "effectResolved" && entry.rolls).toEqual([{ kind: "damage", damageType: "fire", dice: [], bonus: 0, total: 28 }]);
    // d20 central (10) + DES +2 = 12 < CD 14: fallan y reciben 28 (tienen 10 PG).
    expect(entry?.kind === "effectResolved" && entry.targets.map((t) => [t.targetId, t.save?.success, t.lifeStateAfter])).toEqual([
      ["goblin-warrior-1", false, "dead"],
      ["goblin-warrior-2", false, "dead"],
    ]);
  });
});
