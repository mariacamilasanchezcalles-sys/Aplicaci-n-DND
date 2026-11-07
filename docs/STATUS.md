# Estado del proyecto

Última verificación: `npm run verify` sin errores, 11 archivos de prueba, 182 pruebas aprobadas.

## Implementado
- **Modelos tipados** de criaturas, ataques, acciones, posiciones y encuentro (`src/models`).
- **Motor de reglas** (`src/rules`):
  - Crear encuentros con mapa de dimensiones explícitas y registrar criaturas (validación de límites y ocupación por tamaño).
  - Distancia y coste de movimiento con diagonal alternada; presupuesto de Velocidad; Correr (Dash) como movimiento extra.
  - `validateTurnPlan`: valida un turno completo (movimiento, una acción, una acción adicional, ataques conocidos, objetivo, alcance desde la posición que se tiene en ese punto del turno, paso por casillas ocupadas, fin de turno en casilla libre).
  - Dados inyectables (`RandomSource`), `resolveAttack` (ventaja, desventaja, crítico, daño condicionado) y `applyDamage`.
- **Persistencia:** interfaz, serialización JSON (versión 3) y almacén en memoria.
- **Fachada `ui-bridge`** ampliada (vistas de mapa y menú de turno, `validateTurnPlan`, escenario provisional, biblioteca de encuentros) y **escenario de prueba** provisional (Goblin, Cata, Caín).
- **Fichas declarativas** (`src/sheets`, tipos en `src/models/sheet.ts`): esquema, validación de estructura y coherencia, carga desde JSON y puente temporal al modelo del motor. Ficha del Goblin Warrior en `data/sheets/goblin-warrior.json` (produce la misma criatura que el escenario). Diseño en `docs/SHEET_ARCHITECTURE.md`.
- **Pruebas:** estructura, movimiento, tamaños, dados, economía de acciones, integración y separación de módulos.

## Solo estructura o provisional
- `getLegalActions`: lanza `PendingImplementationError` (falta decidir si el cerebro elige pasos sueltos o turnos completos).
- Cerebro táctico: contrato y punto de integración vacío (`unimplementedTacticalBrain`).
- Percepción: solo tipos.
- Datos del escenario: 7 PG del Goblin, tamaño Mediano y estadísticas vacías de Cata y Caín.

## Ejecutor de turno paso a paso (2026-11-07)
`src/rules/turnExecution.ts`: `startTurn`, `getTurnOptions` (solo opciones legales) y `applyTurnCommand` (mover, iniciar capacidad, elegir opción, renunciar, terminar turno). Ejecuta la acción de Atacar estándar, Correr, Destrabarse, Esquivar, acciones adicionales simples y capacidades de ficha compuestas de ataques y acciones estándar (Multiataque con `sequence`/`choice`/`repeat`/`optional`/`conditional`). Desventaja automática más allá del alcance normal. Lo no modelado (costes, recursos, efectos, conjuros, reacciones, condiciones, Esconderse) se rechaza con un código. Comprobaciones compartidas con `validateTurnPlan` en `rules/turnSteps.ts`.

## Etapa anterior: fichas declarativas y acciones compuestas
Especificación vigente: `docs/PROJECT_SPEC.md`. Hecho: tipos, validación y carga. Propuesto (sin implementar, requiere aprobación): ejecutor de capacidades con reevaluación paso a paso, acciones estándar como capacidades integradas, catálogo de efectos y condiciones. Ver `docs/SHEET_ARCHITECTURE.md` y decisiones 19–27.

## Pausado: prototipo de pantallas
Se empezó (viewport con arrastre y pellizco, textos en español, almacenes local y Firebase) y se pausó por el cambio de prioridad. Está completo en el commit `62634f7`; en el árbol actual solo queda la ampliación de `ui-bridge`. Ver `docs/UI_REQUIREMENTS.md`.

## En espera
- **Cerebro táctico:** la jugadora explicará cómo "piensa todo el tiempo". No se diseña nada hasta recibir esa explicación.
- **Decisiones abiertas:** `docs/PENDING_DECISIONS.md` (subirse a una criatura, terreno difícil, bandos, condiciones, 0 PG, iniciativa…).
- **Android:** Capacitor es compatible (v8.6.0 exige Node >= 22) pero no está instalado; faltan empaquetador web, `capacitor.config.ts`, JDK y Android SDK.
- **Repositorio:** falta elegir licencia y decidir si es público; los datos del Goblin Warrior vienen de un libro que no está en el SRD.
