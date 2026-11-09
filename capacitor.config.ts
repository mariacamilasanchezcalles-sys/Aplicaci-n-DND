import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Empaquetado Android con Capacitor. La app es la web de `dist-web/`
 * (`npm run build:web`), incluida dentro del APK: funciona sin conexión.
 * appId PROVISIONAL (decisión 126): identificador del paquete Android.
 */
const config: CapacitorConfig = {
  appId: "com.simuladortactico.app",
  appName: "Simulador Táctico",
  webDir: "dist-web",
  android: {
    backgroundColor: "#101010",
  },
};

export default config;
