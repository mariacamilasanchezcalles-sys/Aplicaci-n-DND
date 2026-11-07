# CLAUDE.md — Simulador táctico de combate de D&D 5e (2024)

Aplicación de simulación de combate para Dungeons & Dragons donde los monstruos deciden de forma **algorítmica** (sin IA generativa). Objetivo: app Android instalable (APK) con Capacitor, sin conexión a internet, en TypeScript. Desarrollo en GitHub Codespaces.

Especificación vigente: `docs/PROJECT_SPEC.md` (amplía el brief original `docs/PROJECT_BRIEF.md`). Estado actual: `docs/STATUS.md`. Fichas declarativas: `docs/SHEET_ARCHITECTURE.md`. Cerebro táctico: `docs/TACTICAL_BRAIN_SPEC.md` (especificación de la jugadora) y `docs/TACTICAL_BRAIN_DESIGN.md` (diseño aprobado el 2026-11-07; se implementa por etapas). Reglas caseras y opcionales: `docs/HOUSE_RULES.md` (la *Guía del DM* que tiene la jugadora es de **2014**: solo sirve como origen de reglas caseras, nunca como fuente de reglas oficiales; no se copia al repositorio).

## Cómo trabajar aquí (obligatorio)
- **Idioma:** español para documentación y comunicación; identificadores de código en inglés, comentarios en español.
- **No avances de etapa por tu cuenta.** El cerebro táctico y las pantallas definitivas solo se implementan cuando se pida. Ante una decisión no definida: crea una interfaz provisional, documéntala en `docs/PENDING_DECISIONS.md` y sigue con lo que no dependa de ella.
- **No mezcles ediciones.** Solo D&D 5e 2024. Verifica cada mecánica en fuente oficial (SRD 5.2.1, Basic Rules 2024 en D&D Beyond) y anótala en `docs/RULES_VERIFICATION.md`, separando lo verificado, lo que es regla de mesa y lo pendiente. Nunca des por confirmada una regla de memoria.
- **Prohibido:** IA generativa en el combate, texto libre para describir acciones o ataques, interpretación de lenguaje natural, importación de fichas, editor completo de personajes, inventar pesos o puntuaciones del cerebro, funcionalidades no pedidas, y mezclar reglas, puntuación táctica y presentación en un mismo módulo.
- Distingue siempre **DECISIÓN CONFIRMADA**, **PROPUESTA**, **PENDIENTE DE VALIDAR**, **REGLA OFICIAL VERIFICADA** y **REGLA CASERA**.
- **Offline obligatorio:** ningún servicio en la nube puede ser requisito de funcionamiento.
- **Azar solo al tirar dados** (`RandomSource` inyectable). Todo lo demás, incluidas las decisiones de los monstruos, es programación determinista.
- Al terminar cada tarea informa: (1) archivos y módulos creados, (2) para qué sirve cada uno, (3) decisiones técnicas, (4) comandos ejecutados y sus resultados, (5) qué está implementado y qué es provisional, (6) decisiones pendientes que requieren aprobación.

## Comandos
```bash
npm ci
npm run verify      # typecheck + build + pruebas (debe terminar sin errores)
npm run typecheck
npm run build
npm test
```
Node >= 22. TypeScript 7 y Vitest 5. Antes de dar algo por terminado, `npm run verify` limpio, y actualiza los documentos de `docs/` que cambien.

## Arquitectura (`src/`)
| Módulo | Puede importar | Función |
|---|---|---|
| `models` | nada | Tipos de datos (ids, acciones, criaturas, encuentro). Sin reglas. |
| `rules` | models | Motor de reglas: colocación, ocupación por tamaño, distancia, movimiento, economía de acciones, dados, resolución de ataques, daño y **ejecutor de turno paso a paso** (`turnExecution.ts`). |
| `perception` | models, rules | Memoria compartida por bando (`sideKnowledge`) y `KnowledgeView`: lo percibido, recordado y estimado (cotas de CA por sus propias tiradas, PG máximos por Maltrecho). Nunca da CA ni PG reales de enemigos. |
| `tactical-brain` | models, perception, rules (**solo tipos**) | Puerto de simulación, planes (`simulatePlan`), rasgos medidos (`computeFeatures`), calibración de pesos, perfiles de personalidad (`personalities.json`), planificador (`planTurn`, búsqueda por fases) y decisión de ataques de oportunidad. |
| `persistence` | models | Interfaz de guardado/carga, JSON, almacén en memoria. |
| `ui-bridge` | models, rules, persistence, scenarios | Fachada para que una interfaz hable con el núcleo (vistas, validación de turno, biblioteca de encuentros). |
| `scenarios` | models | Datos de prueba provisionales (Goblin, Cata, Caín). |
| `combat-controller` | models, rules, perception, tactical-brain | Orquesta los turnos de los monstruos. Hoy: puerto de simulación sobre el estado creído (`createSimulationPort`, dados esperados). |
| `sheets` | models | Fichas declarativas: esquema, validación, carga y puente temporal al modelo del motor. Los tipos de ficha están en `models/sheet.ts`. |

`tests/architecture.test.ts` hace cumplir esas dependencias. Detalle en `docs/ARCHITECTURE.md`.

## Convenciones de código
- TypeScript estricto (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`): usa `import type` para tipos.
- Identificadores funcionales con tipos de marca (`CreatureId`, `AttackId`, …) y constructores `asCreatureId(...)`. Los `label` son solo etiquetas para personas: el programa nunca los interpreta.
- Datos inmutables y serializables a JSON (sin `Map`/`Set` en el estado del encuentro). Las funciones devuelven un encuentro nuevo; nunca mutan.
- La legalidad se devuelve como **códigos** (`IllegalReason`, `PlacementReason`), no texto libre.
- Lo reservado lanza `PendingImplementationError` en vez de devolver algo falso.
- Cambia `SNAPSHOT_SCHEMA_VERSION` (persistencia) cuando cambie la forma del encuentro guardado.
- Fichas de criaturas en JSON (`data/sheets/`), validadas con `loadCreatureSheet`. Vocabulario cerrado: un tipo desconocido es error; lo no modelado se declara `unmodeled`. Cambia `SHEET_FORMAT_VERSION` si cambia la forma de la ficha.
- Pruebas con Vitest en `tests/`; helpers en `tests/helpers.ts` (incluye `scriptedDice` para dados reproducibles). No escribas pruebas que den por aprobadas decisiones tácticas pendientes.

## Decisiones de diseño ya tomadas
**Del brief**
- Legalidad = filtro obligatorio antes del cerebro, no una puntuación. El motor de reglas decide qué es legal; el cerebro solo evalúa acciones legales.
- ~~Cuatro factores tácticos~~ → sustituidos (2026-11-07) por los factores de `docs/TACTICAL_BRAIN_SPEC.md` (daño esperado, impacto, riesgo, posicionamiento, supervivencia, control, cooperación, recursos, consecuencias futuras), medidos en unidades naturales. Pesos: calibración por escenarios aprobados por la jugadora; nunca inventados.
- La personalidad modifica prioridades, nunca permite violar las reglas.
- Registro simplificado de personajes jugadores (sin hoja completa).
- Se modelan por separado acción principal, acción adicional, movimiento y ataques concretos. Un ataque concreto no es una acción independiente; el movimiento no es Correr (Dash).

**Tomadas con la jugadora**
- **Fichas y ejecución (2026-11-07):** personalidad y dificultad se asignan en el encuentro; turno planeado completo y ejecutado operación por operación con reevaluación y revalidación; acciones estándar y ataque de oportunidad como capacidades integradas; costes una vez al iniciar (sin devolución), `capability` gasta recursos pero no activación; se puede renunciar a pasos restantes. Guardado local con Firebase opcional.
- **Reglas caseras de la guía DM 2014 (2026-11-07):** la mesa usa Flanquear, Moral, Daño masivo, Marcar (implementadas como interruptores de `tableRules`) y Encaramarse a una criatura más grande (sin implementar). El motor las lee; el cerebro nunca las cambia. Ver `docs/HOUSE_RULES.md`.
- **Cerebro táctico (2026-11-07):** solo información percibida, recordada o estimada (CA y PG se estiman; supuesto inicial por nivel del grupo); los monstruos de un bando comparten conocimiento e intenciones; todos aprenden de lo que perciben (INT/SAB más adelante); desempate determinista; dificultad = calidad de búsqueda, nunca estadísticas ni información.
- **Calibración (2026-11-07):** pesos aprobados; la jugadora delega en Claude los juicios evidentes y los conflictos de calibración (aplicando su especificación y documentando cada uno). El cerebro debe poder usar todas las acciones de cada ficha (Multiataque, reacciones…).
- **Bandos (2026-11-07):** por defecto monstruos contra personajes jugadores, cambiable por criatura; los ataques de oportunidad solo se ofrecen a enemigos.
- Coordenadas desde 0. Casillas de 5 pies. Mapa de **15 columnas x 21 filas**; el área **visible** en pantalla es de 5 x 9 (requisito de interfaz, no del núcleo).
- **Salvaciones de personajes jugadores** (2026-11-07): las tira el jugador con dados físicos y la app anota el total o el resultado. **Áreas:** regla casera de la guía 2014 (origen en una intersección; casilla afectada si queda cubierta al menos a la mitad), para todas las formas.
- **Configuración de mesa** (`Encounter.tableRules`, implementada: `diagonal`, `movementThroughCreatures`, `areaTemplate`): solo contiene reglas ya implementadas; la de la jugadora es `TABLE_RULES_OF_THE_PLAYERS_TABLE`.
- **Diagonal alternada 1, 2, 1, 2** (`tableRules.diagonal: "alternating-1-2"`; la oficial es `"standard"`): regla de mesa impuesta por su DM (regla opcional de la guía DM 2014); no es la regla base 2024 (diagonal = 1). La cuenta de diagonales continúa entre pasos rectos y entre pasos de movimiento del mismo turno y se reinicia cada turno.
- **Ocupación por tamaño:** Pequeña y Mediana 1x1, Grande 2x2, Enorme 3x3, Gargantuesca 4x4; la posición es la esquina superior izquierda. Diminuta, provisionalmente, ocupa 1 casilla exclusiva.
- **Atravesar:** se puede pasar, y actuar, en una casilla ocupada por una criatura Diminuta, Pequeña o Mediana (cuenta el tamaño de la criatura atravesada), a coste normal de movimiento. Las Grandes o mayores bloquean. El turno no puede terminar en un espacio ocupado.
- **Escapismo Ágil** del Goblin es una acción adicional propia (`bonusActions`), no un rasgo. En un turno la criatura puede mover, hacer una acción y una acción adicional.
- Los **7 PG del Goblin** son dato provisional del escenario de prueba; la ficha oficial del Goblin Warrior 2024 tiene 10 PG. No los presentes como estadísticas definitivas.
- Dados: el 1d4 extra del Goblin con ventaja es un componente de daño condicionado (`condition: "attackRollHadAdvantage"`).

## Lo que NO está hecho (no lo inventes)
PG temporales, desplazamiento forzado, arrastrar al agarrado, efectos de ataque al fallar, conjuros, espacios de conjuro, reacciones de ficha, Ataque sin armas (el motor cubre ataques (con condiciones al impactar y Agarrado), Atacar, Correr, Destrabarse y Esquivar, costes de recursos, Recarga, defensas contra el daño, efectos de daño, curación y condiciones con salvación y áreas, las 15 condiciones, 0 PG, iniciativa, ataques de oportunidad y ataques de jugadores con dados físicos), descansos, Encaramarse a una criatura más grande, niveles de dificultad (valores), cooperación y bucle de turnos del cerebro táctico (etapas 5 y 6 de `TACTICAL_BRAIN_DESIGN.md`), recalibración de los pesos con los planes que encuentra la búsqueda, visibilidad real (luz, cobertura, sentidos; Hide), acciones Help/Influence/Magic/Ready/Search/Study/Utilize, empaquetado con Capacitor y pantallas (prototipo pausado; guardado en el commit `62634f7`). Lista completa y numerada en `docs/PENDING_DECISIONS.md`.
