import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CreatureSheet } from "../src/models";
import { goblin } from "../src/scenarios/provisionalScenario";
import { combatantFromSheet, loadCreatureSheet, validateCreatureSheet } from "../src/sheets";
import type { SheetIssue } from "../src/sheets";
import { emptyEncounter, engine } from "./helpers";

const ROOT = join(__dirname, "..");
const goblinJson = readFileSync(join(ROOT, "data/sheets/goblin-warrior.json"), "utf8");
const bruteJson = readFileSync(join(ROOT, "tests/fixtures/sheets/test-brute.json"), "utf8");

function loadValid(json: string): CreatureSheet {
  const result = loadCreatureSheet(json);
  if (!result.valid) throw new Error(JSON.stringify(result.errors));
  return result.sheet;
}

/** Copia profunda editable de la ficha del bruto para provocar errores. */
function brute(): Record<string, any> {
  return JSON.parse(bruteJson) as Record<string, any>;
}

function errorsOf(value: unknown): Pick<SheetIssue, "code" | "path">[] {
  const result = validateCreatureSheet(value);
  return result.valid ? [] : result.errors.map(({ code, path }) => ({ code, path }));
}

describe("fichas: carga de fichas válidas", () => {
  it("carga la ficha del Goblin sin errores ni avisos", () => {
    const result = loadCreatureSheet(goblinJson);
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("carga una ficha compleja (multiataque, recarga, reacción) con avisos de lo no modelado", () => {
    const result = loadCreatureSheet(bruteJson);
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([
      { severity: "warning", code: "unmodeledMechanic", path: "traits[0].effects[0]" },
    ]);
  });

  it("acepta una ficha mínima sin estructuras opcionales", () => {
    const minimal = {
      sheetFormat: 1,
      id: "minimal",
      label: "Mínima",
      source: { kind: "testFixture" },
      size: "medium",
      armorClass: 10,
      hitPoints: { average: 1 },
      speed: { walk: 30 },
    };
    expect(validateCreatureSheet(minimal).valid).toBe(true);
  });
});

describe("fichas: errores de estructura", () => {
  it("JSON mal formado", () => {
    expect(loadCreatureSheet("{ no es json")).toMatchObject({
      valid: false,
      errors: [{ code: "invalidJson" }],
    });
  });

  it("versión de formato no soportada", () => {
    expect(errorsOf({ ...brute(), sheetFormat: 2 })).toEqual([
      { code: "unsupportedFormatVersion", path: "sheetFormat" },
    ]);
  });

  it("campo obligatorio ausente y campo desconocido (errata)", () => {
    const sheet = brute();
    delete sheet["armorClass"];
    sheet["armourClass"] = 13;
    expect(errorsOf(sheet)).toEqual([
      { code: "missingField", path: "armorClass" },
      { code: "unknownField", path: "armourClass" },
    ]);
  });

  it("tipo de operación desconocido: nunca se ignora en silencio", () => {
    const sheet = brute();
    sheet["capabilities"][0].body = { op: "teleport", distance: 30 };
    expect(errorsOf(sheet)).toEqual([{ code: "unknownKind", path: "capabilities[0].body.op" }]);
  });

  it("valores fuera del vocabulario cerrado", () => {
    const sheet = brute();
    sheet["attacks"][0].onHit[0].damageType = "sonic";
    sheet["conditionImmunities"] = ["scared"];
    sheet["attacks"][0].onHit[0].dice.sides = 7;
    expect(errorsOf(sheet)).toEqual(
      expect.arrayContaining([
        { code: "invalidValue", path: "attacks[0].onHit[0].damageType" },
        { code: "invalidValue", path: "conditionImmunities[0]" },
        { code: "invalidValue", path: "attacks[0].onHit[0].dice.sides" },
      ]),
    );
  });

  it("identificadores mal formados y etiquetas vacías", () => {
    const sheet = brute();
    sheet["id"] = "Bruto de Prueba";
    sheet["label"] = "   ";
    expect(errorsOf(sheet)).toEqual([
      { code: "invalidIdentifier", path: "id" },
      { code: "invalidValue", path: "label" },
    ]);
  });

  it("límites de las estructuras compuestas", () => {
    const sheet = brute();
    sheet["capabilities"][0].body.steps[0].times = 0;
    sheet["capabilities"][0].body.steps[0].body.options = [{ op: "attack", attackRef: "claw" }];
    expect(errorsOf(sheet)).toEqual([
      { code: "outOfRange", path: "capabilities[0].body.steps[0].times" },
      { code: "tooFewItems", path: "capabilities[0].body.steps[0].body.options" },
    ]);
  });
});

describe("fichas: errores de coherencia", () => {
  it("referencias a ataques, capacidades y recursos inexistentes", () => {
    const sheet = brute();
    sheet["capabilities"][0].body.steps[0].body.options[0].attackRef = "tail";
    sheet["capabilities"][1].costs[0].resourceRef = "frost-breath";
    sheet["capabilities"][2].body.capabilityRef = "frenzy";
    expect(errorsOf(sheet)).toEqual([
      { code: "unknownReference", path: "capabilities[0].body.steps[0].body.options[0].attackRef" },
      { code: "unknownReference", path: "capabilities[1].costs[0].resourceRef" },
      { code: "unknownReference", path: "capabilities[2].body.capabilityRef" },
    ]);
  });

  it("ciclos entre capacidades (directos e indirectos)", () => {
    const sheet = brute();
    sheet["capabilities"][0].body = { op: "capability", capabilityRef: "rampage" };
    expect(errorsOf(sheet)).toEqual([{ code: "referenceCycle", path: "capabilities[0]" }]);

    const self = brute();
    self["capabilities"][2].body = { op: "optional", body: { op: "capability", capabilityRef: "rampage" } };
    expect(errorsOf(self)).toEqual([{ code: "referenceCycle", path: "capabilities[2]" }]);
  });

  it("ids duplicados", () => {
    const sheet = brute();
    sheet["attacks"][1].id = "claw";
    // Además, la referencia a "bite" queda rota: se informan ambos problemas.
    expect(errorsOf(sheet)).toEqual([
      { code: "duplicateId", path: "attacks[1].id" },
      { code: "unknownReference", path: "capabilities[0].body.steps[1].then.body.attackRef" },
    ]);
  });

  it("takenAs solo se admite en capacidades de acción", () => {
    const sheet = brute();
    sheet["capabilities"][2].takenAs = "attack";
    expect(errorsOf(sheet)).toEqual([{ code: "invalidValue", path: "capabilities[2].takenAs" }]);
  });

  it("reacción sin desencadenante y desencadenante fuera de una reacción", () => {
    const sheet = brute();
    delete sheet["capabilities"][3].trigger;
    sheet["capabilities"][0].trigger = { kind: "selfTakesDamage" };
    expect(errorsOf(sheet)).toEqual([
      { code: "triggerNotAllowed", path: "capabilities[0].trigger" },
      { code: "triggerRequired", path: "capabilities[3].trigger" },
    ]);
  });

  it("alcances incoherentes", () => {
    const sheet = brute();
    sheet["attacks"][0].rangeFeet = { normal: 5, long: 10 };
    sheet["attacks"][2].rangeFeet = { normal: 90, long: 30 };
    expect(errorsOf(sheet)).toEqual([
      { code: "invalidRange", path: "attacks[0].rangeFeet.long" },
      { code: "invalidRange", path: "attacks[2].rangeFeet.long" },
    ]);
  });

  it("anidamiento demasiado profundo", () => {
    let body: unknown = { op: "attack", attackRef: "claw" };
    for (let i = 0; i < 9; i++) body = { op: "optional", body };
    const sheet = brute();
    sheet["capabilities"][0].body = body;
    expect(errorsOf(sheet).map((e) => e.code)).toEqual(["nestingTooDeep"]);
  });
});

describe("fichas: puente con el modelo actual del motor", () => {
  it("la ficha del Goblin produce la misma criatura que el escenario provisional", () => {
    const { definition, gaps } = combatantFromSheet(loadValid(goblinJson), {
      creatureId: "goblin-1",
      personality: "pragmatic",
      // 7 PG: dato provisional del escenario de prueba; la ficha oficial dice 10.
      maxHitPointsOverride: 7,
    });
    expect(gaps).toEqual([]);
    expect(definition).toEqual(goblin);
  });

  it("sin sobrescribir, usa los PG de la ficha", () => {
    const { definition } = combatantFromSheet(loadValid(goblinJson), {
      creatureId: "goblin-2",
      personality: "pragmatic",
    });
    expect(definition.stats.maxHitPoints).toBe(10);
  });

  it("lo que el motor aún no ejecuta se informa como hueco, no se aproxima", () => {
    const { definition, gaps } = combatantFromSheet(loadValid(bruteJson), {
      creatureId: "brute-1",
      personality: "pragmatic",
    });
    expect(gaps.map((g) => `${g.path}:${g.reason}`)).toEqual([
      "attacks[1]:attackEffectNotSupported",
      "resources:resourcesNotSupported",
      "traits[0]:traitEffectNotSupported",
      "damageResistances:damageModifiersNotSupported",
      "conditionImmunities:conditionImmunitiesNotSupported",
    ]);
    // El Mordisco (agarra al impactar) no entra en la criatura: no se aproxima.
    expect(definition.attacks.map((a) => a.id)).toEqual(["claw", "rock"]);
    // Las capacidades pasan tal cual; qué se puede ejecutar lo decide el motor.
    expect(definition.capabilities?.map((c) => c.id)).toEqual(["multiattack", "breath", "rampage", "snap-back"]);
    // El Multiataque NO se convierte en "varios ataques por acción de Atacar".
    expect(definition.stats.attacksPerAttackAction).toBeUndefined();
    expect(definition.bonusActions).toEqual([]);
  });

  it("la criatura de la ficha funciona con el motor actual (colocación por tamaño y turno)", () => {
    const { definition } = combatantFromSheet(loadValid(bruteJson), {
      creatureId: "brute-1",
      personality: "pragmatic",
    });
    const encounter = engine.addCombatant(emptyEncounter(), definition, { column: 2, row: 2 });
    const result = engine.validateTurnPlan(encounter, {
      actorId: definition.id,
      steps: [{ slot: "movement", path: [{ column: 3, row: 2 }] }],
    });
    expect(result).toEqual({ legal: true });
  });
});
