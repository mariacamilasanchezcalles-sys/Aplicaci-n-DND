import { describe, expect, it } from "vitest";
import { asAttackId, asBonusActionId, asCreatureId } from "../src/models";
import type {
  ActionOption,
  AttackActionOption,
  BonusActionOption,
  MovementOption,
} from "../src/models";
import { goblin } from "../src/scenarios/provisionalScenario";
// Los datos de ataque del goblin coinciden con la ficha oficial MM 2024 (ver docs/RULES_VERIFICATION.md).

describe("representación tipada de ataques y acciones", () => {
  it("modela movimiento, acción y acción adicional como ranuras distintas", () => {
    const move: MovementOption = { slot: "movement", path: [{ column: 9, row: 5 }] };
    const dash: ActionOption = { slot: "action", actionType: "dash" };
    const bonus: BonusActionOption = {
      slot: "bonusAction",
      bonusActionId: asBonusActionId("nimble-escape"),
      actionType: "disengage",
    };
    expect(new Set([move.slot, dash.slot, bonus.slot]).size).toBe(3);
  });

  it("el movimiento normal no es la acción de Correr", () => {
    const move: ActionOption = { slot: "movement", path: [] };
    const dash: ActionOption = { slot: "action", actionType: "dash" };
    expect(move.slot).not.toBe(dash.slot);
    expect("actionType" in move).toBe(false);
  });

  it("un ataque concreto es una opción dentro de la acción de Atacar", () => {
    const attack: AttackActionOption = {
      slot: "action",
      actionType: "attack",
      attacks: [{ attackId: asAttackId("scimitar"), targetId: asCreatureId("cata") }],
    };
    expect(attack.attacks[0]?.attackId).toBe("scimitar");
    expect(attack).not.toHaveProperty("attackId");
  });

  it("Escapismo Ágil es una acción adicional propia (no un rasgo)", () => {
    expect(goblin.traits).toEqual([]);
    expect(goblin.bonusActions).toEqual([
      {
        id: "nimble-escape",
        label: "Escapismo Ágil",
        allowedActions: ["disengage", "hide"],
      },
    ]);
  });

  it("los ataques del goblin son datos tipados con id funcional", () => {
    expect(goblin.attacks.map((a) => a.id)).toEqual(["scimitar", "shortbow"]);
    expect(goblin.attacks.map((a) => a.mode)).toEqual(["melee", "ranged"]);
  });

  it("el daño extra de 1d4 con ventaja es un componente condicionado", () => {
    const [base, extra] = goblin.attacks[0]!.damage;
    expect(base?.condition).toBeUndefined();
    expect(extra).toMatchObject({ dice: { count: 1, sides: 4 }, condition: "attackRollHadAdvantage" });
  });
});
