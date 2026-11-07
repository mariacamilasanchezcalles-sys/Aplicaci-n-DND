import { describe, expect, it } from "vitest";
import type { CombatantDefinition } from "../src/models";
import { applyDamageModifiers } from "../src/rules";
import { goblin } from "../src/scenarios/provisionalScenario";

type Defenses = Pick<CombatantDefinition, "damageResistances" | "damageImmunities" | "damageVulnerabilities">;
const defender = (defenses: Defenses): CombatantDefinition => ({ ...goblin, ...defenses });

describe("defensas contra el daño (SRD 5.2.1, Damage and Healing)", () => {
  it("sin defensas el daño no cambia", () => {
    expect(applyDamageModifiers(goblin, [{ type: "slashing", amount: 7 }])).toEqual({
      instances: [{ type: "slashing", raw: 7, final: 7, defense: "none" }],
      total: 7,
    });
  });

  it("Resistencia: mitad redondeando hacia abajo", () => {
    const result = applyDamageModifiers(defender({ damageResistances: ["cold"] }), [{ type: "cold", amount: 7 }]);
    expect(result.total).toBe(3);
  });

  it("Vulnerabilidad: el doble", () => {
    const result = applyDamageModifiers(defender({ damageVulnerabilities: ["fire"] }), [{ type: "fire", amount: 7 }]);
    expect(result.total).toBe(14);
  });

  it("Inmunidad: ese tipo no hace daño", () => {
    const result = applyDamageModifiers(defender({ damageImmunities: ["poison"] }), [
      { type: "poison", amount: 9 },
      { type: "piercing", amount: 4 },
    ]);
    expect(result.instances).toEqual([
      { type: "poison", raw: 9, final: 0, defense: "immune" },
      { type: "piercing", raw: 4, final: 4, defense: "none" },
    ]);
    expect(result.total).toBe(4);
  });

  it("orden oficial: primero Resistencia, después Vulnerabilidad", () => {
    // Ejemplo del SRD sin el aura: 23 de fuego → mitad 11 → doble 22.
    const result = applyDamageModifiers(
      defender({ damageResistances: ["fire"], damageVulnerabilities: ["fire"] }),
      [{ type: "fire", amount: 23 }],
    );
    expect(result.instances).toEqual([{ type: "fire", raw: 23, final: 22, defense: "resistantAndVulnerable" }]);
  });

  it("PROPUESTA: las partes del mismo tipo se suman antes de aplicar la Resistencia", () => {
    // 3 + 3 cortante con Resistencia: 6 → 3 (por partes daría 1 + 1 = 2).
    const result = applyDamageModifiers(defender({ damageResistances: ["slashing"] }), [
      { type: "slashing", amount: 3 },
      { type: "slashing", amount: 3 },
    ]);
    expect(result.total).toBe(3);
  });

  it("rechaza cantidades no válidas", () => {
    expect(() => applyDamageModifiers(goblin, [{ type: "fire", amount: -1 }])).toThrow(RangeError);
  });
});
