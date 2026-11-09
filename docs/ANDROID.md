# App Android (Capacitor)

La app web (`app/`, compilada en `dist-web/`) va **dentro** del APK: funciona sin conexión.
Configuración en `capacitor.config.ts`; proyecto nativo en `android/` (generado por Capacitor 8.6).

## Compilar el APK de depuración
Requisitos:
- Node 22 y Java 21 (JDK);
- Android SDK con la plataforma 36, Build-Tools 36 y Platform-Tools; Gradle descarga Build-Tools 35 si lo necesita.

```bash
export ANDROID_HOME=/ruta/al/android-sdk     # o crea android/local.properties con sdk.dir=...
npm run android:apk
```

El APK queda en `android/app/build/outputs/apk/debug/app-debug.apk`. Para instalarlo en el
teléfono: copiarlo y abrirlo (permitiendo instalar desde "orígenes desconocidos") o, con el
teléfono conectado por USB, `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`.

Instalar el SDK sin Android Studio (Linux, p. ej. Codespaces):

```bash
mkdir -p $HOME/android-sdk/cmdline-tools && cd $HOME/android-sdk/cmdline-tools
curl -O https://dl.google.com/android/repository/commandlinetools-linux-9862592_latest.zip
unzip commandlinetools-linux-9862592_latest.zip && mv cmdline-tools latest
export ANDROID_HOME=$HOME/android-sdk
yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"
```

## Identidad y recursos
- Paquete `com.simuladortactico.app`, nombre "Simulador Táctico" (PROPUESTA, decisión 126).
- Icono y pantalla de arranque generados a partir del emblema SVG propio (negro carbón).
- Mínimo Android 7.0 (SDK 24), objetivo SDK 36.
- El permiso `INTERNET` viene de la plantilla de Capacitor; la app no lo necesita para jugar.

## Pendiente
- Probar en un teléfono real (tiempos del cerebro en Difícil, tacto, tamaño de letra).
- APK de publicación firmado (necesita una clave de firma de la jugadora; no se guarda en el repositorio).
