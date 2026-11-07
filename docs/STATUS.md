# Estado del proyecto

Última verificación: `npm run verify` sin errores, 8 archivos de prueba, 135 pruebas aprobadas.

## Implementado
- **Modelos tipados** de criaturas, ataques, acciones, posiciones y encuentro (`src/models`).
- **Motor de reglas** (`src/rules`):
  - Crear encuentros con mapa de dimensiones explícitas y registrar criaturas (validación de límites y ocupación por tamaño).
  - Distancia y coste de movimiento con diagonal alternada; presupuesto de Velocidad; Correr (Dash) como movimiento extra.
  - `validateTurnPlan`: valida un turno completo (movimiento, una acción, una acción adicional, ataques conocidos, objetivo, alcance desde la posición que se tiene en ese punto del turno, paso por casillas ocupadas, fin de turno en casilla libre).
  - Dados inyectables (`RandomSource`), `resolveAttack` (ventaja, desventaja, crítico, daño condicionado) y `applyDamage`.
- **Persistencia:** interfaz, serialización JSON (versión 3) y almacén en memoria.
- **Fachada `ui-bridge`** mínima y **escenario de prueba** provisional (Goblin, Cata, Caín).
- **Pruebas:** estructura, movimiento, tamaños, dados, economía de acciones, integración y separación de módulos.

## Solo estructura o provisional
- `getLegalActions`: lanza `PendingImplementationError` (falta decidir si el cerebro elige pasos sueltos o turnos completos).
- Cerebro táctico: contrato y punto de integración vacío (`unimplementedTacticalBrain`).
- Percepción: solo tipos.
- Datos del escenario: 7 PG del Goblin, tamaño Mediano y estadísticas vacías de Cata y Caín.

## Siguiente etapa acordada: pantallas
Ver `docs/UI_REQUIREMENTS.md`. Resumen: prototipo para probar en el celular con tres pantallas (mapa de combate, panel de turno, lista de encuentros). No se ha escrito código de interfaz todavía.

## En espera
- **Cerebro táctico:** la jugadora explicará cómo "piensa todo el tiempo". No se diseña nada hasta recibir esa explicación.
- **Decisiones abiertas:** `docs/PENDING_DECISIONS.md` (subirse a una criatura, terreno difícil, bandos, condiciones, 0 PG, iniciativa…).
- **Android:** Capacitor es compatible (v8.6.0 exige Node >= 22) pero no está instalado; faltan empaquetador web, `capacitor.config.ts`, JDK y Android SDK.
- **Repositorio:** falta elegir licencia y decidir si es público; los datos del Goblin Warrior vienen de un libro que no está en el SRD.
