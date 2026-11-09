# Estado del proyecto

Última verificación: `npm run verify` sin errores, 32 archivos de prueba, 394 pruebas aprobadas (más 1 de calibración que solo corre con `npm run calibrate`).

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

## Pantallas (2026-11-09)
- `app/`: Vite sin framework. Tema "fantasía oscura naturalista" (`styles/theme.css`, fichas de color de la jugadora), arte SVG propio (`art/art.ts`), tipografías Cinzel y Alegreya Sans incluidas (sin conexión).
- Inicio, Bestiario, Personajes, Dificultad (con Personalizada), Combate (despliegue, iniciativa, turnos, peticiones y final) y Partidas guardadas. Guardado local de personajes, borrador y partidas.
- `npm run dev` para probar; `npm run verify` también compila la web. Probado en navegador a tamaño de teléfono (390 x 844) y tableta con un combate de varios asaltos, sin errores.

## Pantallas: núcleo de la fachada (2026-11-09)
- Fichas en formato 3 con `challengeRating` (Goblin: CR 1/4, verificado). Dificultad Personalizada en `brainSettings.customDifficulty` (persistencia versión 15).
- `ui-bridge/encounterSetup.ts`: bestiario desde las fichas, tarjetas de personaje validadas con códigos, preparación con instancias independientes y despliegue automático.
- `ui-bridge/combatSession.ts`: sesión de combate serializable (despliegue, iniciativa, turnos de personaje y de monstruo, peticiones, salvaciones contra la muerte, fin del combate y registro).

## Cerebro táctico, etapa 6: controlador de combate (2026-11-09)
- `models`: `Encounter.brainSettings` (nivel del grupo y dificultad por monstruo; `DifficultyId` pasa a `models`). Persistencia versión 14.
- `combat-controller/monsterTurn.ts`: `brainFor`, `startMonsterTurn`, `stepMonsterTurn`, `runMonsterTurn` y `resolveMonsterReactions`. Planea con coordinación, publica intenciones, ejecuta paso a paso sobre el estado real con revalidación, actualiza la memoria del bando, replanifica según la dificultad o ante eventos relevantes, decide las reacciones de los monstruos y pide al jugador sus salvaciones y reacciones.
- `ui-bridge`: `setBrainSettings`, `playMonsterTurn`, `continueMonsterTurn` y `resolveMonsterReactions`; la fachada recibe los dados reales inyectables. La arquitectura permite `ui-bridge → combat-controller`.
- Prueba de humo: 12 turnos con iniciativa (dos goblins en Difícil contra dos personajes) sin atascos, unos 1,2 s.

## Cerebro táctico, etapa 5: cooperación (2026-11-09)
- `models`: `Intention` y `Encounter.sideIntentions` (pizarra por bando; el estado creído incluye la del propio bando).
- `tactical-brain/cooperation.ts`: `intentionOf`, `publishIntention`, `alliesActingAfter`, `cooperationFromBoard` y `planCoordinatedTurn` (coordinación "limitada", "considera aliados" o "planifica cooperación").
- `computeFeatures` y `planTurn` aceptan el contexto de cooperación (remate marginal y flanqueos previstos; decisión 109). `SimulationPort.projectPositions` coloca a los aliados donde terminarán, respetando la ocupación.
- Persistencia versión 13.

## Niveles de dificultad (2026-11-07)
- `tactical-brain/difficulty.ts`: Fácil, Normal y Difícil como parámetros de búsqueda (valores PROPUESTOS, decisión 96); la calibración usa Difícil.

## Reacciones de ficha (2026-11-07)
- Reacciones con desencadenante "le impactan" o "recibe daño" y cuerpo de ataque: el motor las ofrece al terminar el ataque o efecto (`SheetReactionOpportunity`) y las resuelve con `resolveReaction` (objetivo elegido, costes, reacción gastada).
- El cerebro las decide (`decideReaction`, igual que el ataque de oportunidad) y al planear cuenta las que provocaría, solo si su bando ya las ha visto (memoria `reactionTriggersSeen`).
- Persistencia versión 12.

## Condiciones al impactar y Agarrado (2026-11-07)
- Ataques con condiciones al impactar (`onHitConditions`, tamaño máximo opcional); fichas en formato 2 (las de formato 1 se migran).
- Agarrado completo salvo arrastrar: escapar con la acción (`escapeGrapple`), fin por distancia o Incapacitado, una criatura por parte.
- El cerebro cuenta la probabilidad de imponer la condición y considera escapar para moverse.
- Persistencia versión 11.

## Cerebro táctico, etapa 4: planificador (2026-11-07)
- `tactical-brain/plan.ts`: simulación incremental (`startSimulation`, `continueSimulation`) y pasos `forfeit`, `standUp` y `surrender`; `simulatePlan` puede continuar un turno empezado.
- `tactical-brain/planner.ts`: `planTurn` busca el mejor plan completo por fases (levantarse, mover, capacidad con todas sus elecciones; Destrabarse y Correr junto con su movimiento), con poda por haz y parámetros de dificultad (`SearchParameters`). Determinista; replanifica desde un turno a medias.
- `decideOpportunityAttack`: hace el ataque de oportunidad si mejora la puntuación con los mismos pesos.
- Moverse entre ataques de Atacar o de un Multiataque (decisión 101).
- Recalibración con la búsqueda (rondas 1 y 2): `tests/calibration/judged-plans.json` guarda los planes de la búsqueda juzgados; `tests/calibration/search.test.ts` comprueba que con búsqueda libre cada personalidad elige lo decidido. Nuevo cálculo de `deathRisk` y rasgo `adjacentEnemiesWhileBloodied` (12 rasgos).
- Provisional: valores de cada nivel de dificultad (decisión 96). Pendiente en el motor: efectos al impactar de ataques (102) y reacciones de ficha (103).

## Cerebro táctico, etapa 3: evaluación y calibración (2026-11-07)
- Supuestos por nivel aprobados (`perception/priors.ts`) y ataque y Velocidad supuestos de los enemigos en el estado creído.
- `tactical-brain/plan.ts`: planes completos como pasos de intención; `simulatePlan` sobre el estado creído (ataques con sus probabilidades, ataques de oportunidad provocados).
- `tactical-brain/features.ts`: 10 rasgos medidos y `scoreFeatures`.
- `tactical-brain/calibration.ts`: solucionador determinista con signos por personalidad; `personalities.json` con los pesos (pendientes de aprobación).
- `tests/calibration/`: escenarios E1–E10 de la jugadora y prueba de regresión de sus 19 decisiones.
- Efectos en los planes (paso `effect`): probabilidades por objetivo (`SimulationPort.effectOdds`), salvación supuesta de enemigos por nivel y rasgo `friendlyDamage` (11 rasgos). Ficha inventada `test-drake.json` para E8–E10.

## Cerebro táctico, etapa 2: candidatos y simulación (2026-11-07)
- `rules/candidates.ts`: `reachableSquares` (ruta de menor coste con la diagonal de la mesa, paso entre criaturas, arrastrarse, Asustado y huida; marca dónde puede terminar el turno), `areaPlacementCandidates` (con quién queda dentro) y `effectTargetCandidates`.
- `rules/odds.ts`: probabilidad de impacto y crítico, daño esperado (con el 1d4 de la Ventaja y el crítico automático), probabilidad de salvación y multiplicador de defensas.
- `perception/belief.ts`: estado creído (enemigos con CA y PG estimados, sin ataques conocidos) y estimaciones puntuales.
- `tactical-brain/simulation.ts` (contrato) y `combat-controller/simulation.ts` (implementación): el cerebro simula sobre el estado creído con dados esperados y calcula probabilidades promediando la CA estimada.

## Cerebro táctico, etapa 1: percepción y memoria (2026-11-07)
- `models/knowledge.ts`: memoria por bando (`Encounter.sideKnowledge`, guardado v10).
- `perception/memory.ts`: `observeState` (posición, estado vital, condiciones visibles, Maltrecho) y `observeLogEntries` (de las órdenes del turno: cotas de CA con las tiradas del propio bando, daño visto y causado, ataques y capacidades vistos). El bando percibe lo que ve cualquiera de sus miembros conscientes.
- `perception/knowledge.ts`: `buildKnowledgeView` (sí mismo y aliados completos; enemigos solo con lo recordado, con estimaciones e incertidumbre; supuesto inicial pasado como dato, sin tabla todavía).
- Pendiente: llamar a la percepción tras cada orden lo hará el `combat-controller` (etapa 6); las pruebas lo hacen a mano.

## Cerebro táctico: diseño aprobado (2026-11-07)
Especificación de la jugadora en `TACTICAL_BRAIN_SPEC.md`; propuesta técnica en `TACTICAL_BRAIN_DESIGN.md` (decisiones 69–75). **Sin código hasta su aprobación.**

## Bandos y reglas caseras (2026-11-07)
- **Bandos**: `CombatantRecord.side` (por defecto monstruos contra jugadores), `isEnemy`; Desventaja a distancia con un enemigo a 5 pies (regla oficial verificada); ataques de oportunidad solo de enemigos.
- **Reglas caseras** de la guía 2014 como interruptores (`rules/houseRules.ts`): Flanquear, Marcar, Daño masivo (salvaciones pendientes de jugadores con `resolvePendingSave`) y Moral (disparadores, huida, rendición). Guardado v9. Detalle en `HOUSE_RULES.md`.

## Iniciativa, reacciones y ataques de oportunidad (2026-11-07)
- `rules/initiative.ts`: `rollMonsterInitiative` (grupos idénticos, sorpresa, Invisible e Incapacitado), `startCombat` (totales anotados de los jugadores; empates decididos por la persona), `advanceTurn` (orden, asaltos, salta monstruos muertos; al inicio del turno: reacción, Esquivar, caducidad, Recarga y asaltos de las condiciones) y `currentCreature`.
- Ataques de personajes jugadores con dados físicos (`resolvePlayerAttack`).
- Ataques de oportunidad: el movimiento se detiene justo antes de salir del alcance; `resolveReaction` (tomar o dejar pasar); una reacción por asalto; Destrabarse los evita; si el que se mueve cae, el movimiento se detiene.
- Esquivar persiste hasta el inicio del siguiente turno. Guardado v8.

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
