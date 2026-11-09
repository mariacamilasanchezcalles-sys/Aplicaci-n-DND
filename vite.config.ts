import { defineConfig } from "vite";

/**
 * Empaquetador de la interfaz web (app/). La salida `dist-web/` con rutas
 * relativas (`base: "./"`) es la que después usará Capacitor como `webDir`.
 * Todo (tipografías, arte, fichas) va dentro del paquete: funciona sin conexión.
 */
const inCodespaces = process.env.CODESPACES === "true";

export default defineConfig({
  root: "app",
  base: "./",
  build: { outDir: "../dist-web", emptyOutDir: true, target: "es2022" },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: [".app.github.dev", ".github.dev"],
    fs: { allow: [".."] },
    ...(inCodespaces ? { hmr: { clientPort: 443 } } : {}),
  },
  preview: { host: true, port: 4173, strictPort: true, allowedHosts: [".app.github.dev"] },
});
