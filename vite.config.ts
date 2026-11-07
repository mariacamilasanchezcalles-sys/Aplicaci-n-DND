import { defineConfig } from "vite";

/**
 * Empaquetador de la interfaz web (app/). La salida `dist-web/` con rutas
 * relativas (`base: "./"`) es la que después usará Capacitor como `webDir`.
 * El servidor escucha en 0.0.0.0 para abrirlo desde el celular (puerto
 * reenviado de Codespaces).
 */
const inCodespaces = process.env.CODESPACES === "true";

export default defineConfig({
  root: "app",
  base: "./",
  envDir: "..",
  build: { outDir: "../dist-web", emptyOutDir: true, target: "es2022" },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: [".app.github.dev", ".github.dev"],
    // En Codespaces el navegador llega por HTTPS (443) al puerto reenviado.
    ...(inCodespaces ? { hmr: { clientPort: 443 } } : {}),
  },
  preview: { host: true, port: 4173, strictPort: true, allowedHosts: [".app.github.dev"] },
});
