# Estado del proyecto

Última verificación: `npm run verify` sin errores, 18 archivos de prueba, 251 pruebas aprobadas.

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

## Condiciones y 0 PG (2026-11-07)
- `rules/conditions.ts`: las 15 condiciones como efectos mecánicos (ver la tabla en `RULES_VERIFICATION.md`): aplicar y quitar con inmunidades, efectos implícitos, Velocidad efectiva, Ventaja, Desventaja y críticos al atacar, salvaciones afectadas, Encantado y Asustado, caducidad al inicio o fin de turno.
- `rules/vitality.ts`: muerte de monstruos a 0 PG, personajes moribundos y salvaciones contra la muerte (anotadas), daño masivo, daño a 0 PG, Estable, curación y dejar inconsciente.
- Ejecutor: Incapacitado no actúa, Velocidad 0, arrastrarse y `standUp`, Asustado no se acerca, efectos que aplican o quitan condiciones, y `beginCreatureTurn` (caducidad y Recarga al inicio del turno). Guardado v7.

## Efectos con salvación y áreas (2026-11-07)
- `rules/areas.ts`: las seis formas oficiales sobre la cuadrícula con la regla casera de la mitad de la casilla; validación de origen, dirección y alcance.
- `rules/effects.ts`: salvaciones (los monstruos con dados virtuales; los personajes jugadores, tirada anotada), daño tirado una vez para todos, mitad o anulación, defensas y curación con tope.
- Ejecutor: opción `effect` que se completa con `effectInput` (objetivos, colocación y salvaciones de jugadores); `previewEffect` dice a quién afectaría y a quién hay que pedir la tirada. El aliento del Bruto de prueba ya se ejecuta de principio a fin.

## Configuración de mesa, recursos y defensas contra el daño (2026-11-07)
- **Configuración de mesa** (`Encounter.tableRules`): interruptores `diagonal` (`standard` = regla oficial 2024; `alternating-1-2` = regla casera) y `movementThroughCreatures` (`houseSmallOrMedium`). La diagonal sale de `grid`; el formato de guardado sube a la versión 5. La mesa de la jugadora está en `TABLE_RULES_OF_THE_PLAYERS_TABLE`.
- **Recursos** (`rules/resources.ts`): empiezan completos, se gastan de forma atómica al iniciar la capacidad (`resourcesUnavailable` si no alcanzan) y hay un predicado `resourceAvailable`. Recarga X–6 con `rollRechargesAtTurnStart`.
- **Defensas contra el daño** (`rules/damage.ts`): Inmunidad, Resistencia y Vulnerabilidad en el orden oficial; el ejecutor las aplica y lo registra en `damageAfterDefenses`.

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
