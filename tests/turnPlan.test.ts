import { describe, expect, it } from "vitest";
import { asAttackId, asBonusActionId, asCreatureId } from "../src/models";
import type { ActionOption, CombatantDefinition } from "../src/models";
import type { LegalityResult } from "../src/rules";
import { goblin } from "../src/scenarios/provisionalScenario";
import { buildScenario, emptyEncounter, engine, move } from "./helpers";

const goblinId = asCreatureId("goblin-1");
const cataId = asCreatureId("cata");
const encounter = buildScenario();

const plan = (actor: typeof goblinId, ...steps: ActionOption[]) =>
  engine.validateTurnPlan(encounter, { actorId: actor, steps });

const reason = (r: LegalityResult) => (r.legal ? null : r.reasonCode);

/** Arco corto contra Cata: está a 20 pies, dentro de su alcance (80/320). */
const shortbowAt = (targetId = cataId): ActionOption => ({
  slot: "action",
  actionType: "attack",
  attacks: [{ attackId: asAttackId("shortbow"), targetId }],
});

describe("economía de acciones: acción principal", () => {
  it("permite una acción", () => {
    expect(plan(goblinId, { slot: "action", actionType: "dodge" }).legal).toBe(true);
  });

  it("rechaza dos acciones en el mismo turno", () => {
    const r = plan(
      goblinId,
      { slot: "action", actionType: "dodge" },
      { slot: "action", actionType: "dash" },
    );
    expect(reason(r)).toBe("multipleActions");
    expect(r.legal ? null : r.stepIndex).toBe(1);
  });

  it("rechaza un actor desconocido", () => {
    expect(reason(plan(asCreatureId("nadie"), { slot: "action", actionType: "dodge" }))).toBe(
      "unknownActor",
    );
  });

  it("no acepta a ciegas acciones cuyos datos aún no se modelan", () => {
    expect(reason(plan(goblinId, { slot: "action", actionType: "magic" }))).toBe(
      "actionNotYetModeled",
    );
    expect(reason(plan(goblinId, { slot: "action", actionType: "ready" }))).toBe(
      "actionNotYetModeled",
    );
  });
});

describe("economía de acciones: acción adicional propia", () => {
  const nimbleEscape = (actionType: "disengage" | "hide" | "dash" | "magic"): ActionOption => ({
    slot: "bonusAction",
    bonusActionId: asBonusActionId("nimble-escape"),
    actionType,
  });

  it("el goblin puede usar Destrabarse o Esconderse como acción adicional", () => {
    expect(plan(goblinId, nimbleEscape("disengage")).legal).toBe(true);
    expect(plan(goblinId, nimbleEscape("hide")).legal).toBe(true);
  });

  it("un turno puede combinar movimiento, una acción y una acción adicional", () => {
    expect(plan(goblinId, move([9, 5]), shortbowAt(), nimbleEscape("disengage")).legal).toBe(true);
  });

  it("rechaza una acción que la acción adicional no permite", () => {
    expect(reason(plan(goblinId, nimbleEscape("dash")))).toBe("bonusActionNotGranted");
    expect(reason(plan(goblinId, nimbleEscape("magic")))).toBe("bonusActionNotGranted");
  });

  it("rechaza una acción adicional que la criatura no tiene", () => {
    expect(reason(plan(cataId, nimbleEscape("hide")))).toBe("bonusActionNotGranted");
    expect(
      reason(
        plan(goblinId, {
          slot: "bonusAction",
          bonusActionId: asBonusActionId("inventada"),
          actionType: "hide",
        }),
      ),
    ).toBe("bonusActionNotGranted");
  });

  it("rechaza dos acciones adicionales en un turno", () => {
    expect(reason(plan(goblinId, nimbleEscape("hide"), nimbleEscape("disengage")))).toBe(
      "multipleBonusActions",
    );
  });
});

describe("la acción de Atacar y los ataques concretos", () => {
  it("un ataque conocido contra un objetivo en alcance es válido", () => {
    expect(plan(goblinId, shortbowAt()).legal).toBe(true);
  });

  it("por defecto la acción de Atacar permite un solo ataque", () => {
    const two: ActionOption = {
      slot: "action",
      actionType: "attack",
      attacks: [
        { attackId: asAttackId("shortbow"), targetId: cataId },
        { attackId: asAttackId("shortbow"), targetId: cataId },
      ],
    };
    expect(reason(plan(goblinId, two))).toBe("attackCountInvalid");
  });

  it("un dato de criatura puede permitir más ataques dentro de la MISMA acción", () => {
    // Definición sintética de prueba: no representa ninguna criatura real.
    const multi: CombatantDefinition = {
      ...goblin,
      id: asCreatureId("synthetic-multi"),
      stats: { ...goblin.stats, attacksPerAttackAction: 2 },
    };
    const e = engine.addCombatant(emptyEncounter(), multi, { column: 0, row: 0 });
    const withTarget = engine.addCombatant(e, { ...goblin, id: asCreatureId("t") }, { column: 1, row: 0 });
    const result = engine.validateTurnPlan(withTarget, {
      actorId: multi.id,
      steps: [
        {
          slot: "action",
          actionType: "attack",
          attacks: [
            { attackId: asAttackId("scimitar"), targetId: asCreatureId("t") },
            { attackId: asAttackId("scimitar"), targetId: asCreatureId("t") },
          ],
        },
      ],
    });
    expect(result.legal).toBe(true);
  });

  it("rechaza una acción de Atacar sin ataques", () => {
    expect(
      reason(plan(goblinId, { slot: "action", actionType: "attack", attacks: [] })),
    ).toBe("attackCountInvalid");
  });

  it("rechaza ataques que la criatura no tiene o a objetivos inexistentes", () => {
    expect(
      reason(
        plan(goblinId, {
          slot: "action",
          actionType: "attack",
          attacks: [{ attackId: asAttackId("lanza"), targetId: cataId }],
        }),
      ),
    ).toBe("unknownAttack");
    expect(reason(plan(goblinId, shortbowAt(asCreatureId("fantasma"))))).toBe("unknownTarget");
  });

  it("rechaza atacarse a sí mismo", () => {
    expect(reason(plan(goblinId, shortbowAt(goblinId)))).toBe("invalidTarget");
  });
});

describe("movimiento separado de la acción de Correr", () => {
  it("el movimiento no consume la acción: se puede mover y atacar", () => {
    expect(plan(goblinId, move([9, 5]), shortbowAt()).legal).toBe(true);
  });

  it("el movimiento se puede dividir antes y después de la acción", () => {
    expect(plan(goblinId, move([9, 5]), shortbowAt(), move([10, 5])).legal).toBe(true);
  });

  it("mover y usar Correr son compatibles porque son ranuras distintas", () => {
    expect(plan(goblinId, move([9, 5]), { slot: "action", actionType: "dash" }).legal).toBe(true);
  });

  it("rechaza rutas vacías", () => {
    expect(reason(plan(goblinId, { slot: "movement", path: [] }))).toBe("emptyPath");
  });
});
