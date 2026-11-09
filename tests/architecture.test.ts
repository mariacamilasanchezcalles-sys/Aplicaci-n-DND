import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Qué módulos puede importar cada módulo. Evita mezclar reglas, táctica y presentación. */
const ALLOWED: Record<string, readonly string[]> = {
  models: [],
  rules: ["models"],
  perception: ["models", "rules"],
  "tactical-brain": ["models", "perception", "rules"],
  persistence: ["models"],
  "ui-bridge": ["models", "rules", "persistence", "scenarios", "combat-controller", "sheets"],
  scenarios: ["models"],
  sheets: ["models"],
  "combat-controller": ["models", "rules", "perception", "tactical-brain"],
};

const SRC = join(__dirname, "..", "src");

/** Módulos que solo pueden importar TIPOS de otro (sin lógica): el cerebro nombra tipos del motor. */
const TYPE_ONLY: Record<string, readonly string[]> = { "tactical-brain": ["rules"] };

describe("separación de módulos", () => {
  for (const [moduleName, typeOnly] of Object.entries(TYPE_ONLY)) {
    it(`${moduleName} solo importa tipos de: ${typeOnly.join(", ")}`, () => {
      for (const file of readdirSync(join(SRC, moduleName)).filter((f) => f.endsWith(".ts"))) {
        const text = readFileSync(join(SRC, moduleName, file), "utf8");
        for (const m of text.matchAll(/import\s+(type\s+)?[^;]*?from\s+"\.\.\/([^"/]+)/g)) {
          if (typeOnly.includes(m[2] ?? "")) expect(m[1], `${moduleName}/${file} importa lógica de ${m[2]}`).toBeTruthy();
        }
      }
    });
  }

  for (const [moduleName, allowed] of Object.entries(ALLOWED)) {
    it(`${moduleName} solo importa: ${allowed.join(", ") || "nada"}`, () => {
      const files = readdirSync(join(SRC, moduleName)).filter((f) => f.endsWith(".ts"));
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        const text = readFileSync(join(SRC, moduleName, file), "utf8");
        const imports = [...text.matchAll(/from\s+"(\.\.\/[^"/]+)/g)].map((m) =>
          (m[1] ?? "").replace("../", ""),
        );
        for (const imported of imports) {
          expect(allowed, `${moduleName}/${file} importa ${imported}`).toContain(imported);
        }
      }
    });
  }
});

