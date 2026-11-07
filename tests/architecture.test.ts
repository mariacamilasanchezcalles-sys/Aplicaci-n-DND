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

const APP = join(__dirname, "..", "app");

function appFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? appFiles(join(dir, entry.name))
      : entry.name.endsWith(".ts")
        ? [join(dir, entry.name)]
        : [],
  );
}

describe("separación interfaz / núcleo", () => {
  it("la interfaz (app/) solo usa el núcleo a través de src/ui-bridge", () => {
    const files = appFiles(APP);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      const coreImports = [...text.matchAll(/from\s+"([^"]*\/src\/[^"]*)"/g)].map((m) => m[1] ?? "");
      for (const imported of coreImports) {
        expect(imported, `${file} importa ${imported}`).toMatch(/\/src\/ui-bridge$/);
      }
    }
  });

  it("el núcleo (src/) no importa nada de la interfaz", () => {
    for (const moduleName of Object.keys(ALLOWED)) {
      for (const file of readdirSync(join(SRC, moduleName)).filter((f) => f.endsWith(".ts"))) {
        const text = readFileSync(join(SRC, moduleName, file), "utf8");
        expect(text, `${moduleName}/${file}`).not.toMatch(/from\s+"[^"]*\/app\//);
        expect(text, `${moduleName}/${file}`).not.toMatch(/from\s+"firebase/);
      }
    }
  });
});
