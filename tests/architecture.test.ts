import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Qué módulos puede importar cada módulo. Evita mezclar reglas, táctica y presentación. */
const ALLOWED: Record<string, readonly string[]> = {
  models: [],
  rules: ["models"],
  perception: ["models"],
  "tactical-brain": ["models", "perception"],
  persistence: ["models"],
  "ui-bridge": ["models", "rules", "persistence", "scenarios"],
  scenarios: ["models"],
};

const SRC = join(__dirname, "..", "src");

describe("separación de módulos", () => {
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

