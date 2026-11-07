import { defineConfig } from "vitest/config";

// Configuración propia para que Vitest no herede `root: "app"` de vite.config.ts.
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"] },
});
