# Diseño del cerebro táctico (APROBADO el 2026-11-07)

> **Decisiones confirmadas por la jugadora (2026-11-07):**
> - **Pesos:** se calibran con escenarios que ella aprueba (decisión 71).
> - **Memoria:** todas las criaturas aprenden de lo que perciben; la influencia de INT y SAB se
>   definirá más adelante (decisión 72).
> - **Aliados:** los monstruos de un mismo bando **comparten todo**, conocimiento e intenciones
>   (mente colectiva del bando; decisión 74). Esto sustituye la propuesta del §3 ("no comparten
>   mente") y del §7.
> - **Suposición inicial** de CA y PG no observados: según el **nivel del grupo** (definido en el
>   encuentro), con una tabla por nivel que se propondrá para su aprobación; se corrige con lo
>   observado (decisión 73).
> - **Arquitectura** del §1 aprobada (`combat-controller`, percepción con visibilidad del motor,
>   simulación sobre el estado creído). **Factores:** la lista de la especificación sustituye a los
>   4 del brief. **Empates:** desempate determinista; variación con semilla, más adelante.

Desarrolla `TACTICAL_BRAIN_SPEC.md`. **No hay código todavía.** Etiquetas: DECISIÓN CONFIRMADA
(de la especificación de la jugadora), PROPUESTA (mía) y PENDIENTE.

## 0. Principios (DECISIÓN CONFIRMADA)
- El cerebro **solo** elige entre opciones que el motor declaró legales; la ejecución las revalida
  (ya lo hace `applyTurnCommand`).
- Determinista: con el mismo estado, la misma configuración y la misma semilla, la misma decisión.
- Solo usa lo que la criatura percibe, recuerda o estima: nunca el estado real completo.
- La personalidad cambia ponderaciones; la dificultad cambia la calidad de la búsqueda.
  Son independientes.

## 1. Piezas y dependencias (PROPUESTA)
```
rules ───────────────┐  (legalidad, simulación, eventos)
perception ──────────┤  KnowledgeView: percibido, recordado, estimado, desconocido
tactical-brain ──────┤  evaluación y búsqueda (sin estado real)
combat-controller ───┘  NUEVO: orquesta turnos de los monstruos
```
| Módulo | Importa | Función |
|---|---|---|
| `perception` | models, **rules** (nuevo) | Construye la `KnowledgeView` de cada criatura y su **memoria** a partir del estado real y de los eventos observados. Usa la visibilidad del motor (`canSee`). |
| `tactical-brain` | models, perception | Genera planes con las opciones legales que recibe, los evalúa sobre un **estado creído** y elige. No importa `rules`. |
| `combat-controller` (nuevo) | models, rules, perception, tactical-brain | Bucle de decisión: opciones legales → conocimiento → decisión → ejecución → eventos → reevaluación. |

El cerebro no importa `rules`. Para prever consecuencias recibe un **puerto de simulación**
(`SimulationPort`) que le pasa el controlador. Ese puerto aplica las reglas reales sobre un **estado
creído**: el que construye la percepción, con estimaciones en lugar de los datos que no conoce.
Así la anticipación usa las mismas reglas sin duplicarlas y sin filtrar información oculta. El
puerto calcula **valores esperados** (probabilidades y promedios); nunca tira los dados reales.

## 2. Cuándo piensa: eventos (DECISIÓN CONFIRMADA → diseño PROPUESTO)
El motor ya registra lo que pasa (`TurnLogEntry`). Se generaliza a un **flujo de eventos de
combate** (`CombatEvent`):
- movimiento;
- ataque (impacto o fallo, y total si lo tiró quien observa);
- daño recibido;
- condición aplicada o quitada;
- criatura que cae o muere;
- capacidad o conjuro usado;
- reacción ofrecida;
- inicio y fin de turno.

| Momento | Qué hace el sistema |
|---|---|
| Cada evento | La percepción actualiza la memoria de cada criatura que **lo percibe**. |
| Evento relevante | Se marca la intención del monstruo como "a revisar": muere un aliado o un enemigo, aparece o desaparece un enemigo, recibe daño, falla un paso de su plan, cambia una condición. |
| Inicio de su turno | Planifica el turno completo (búsqueda). |
| Antes de cada operación | Revalida (la opción sigue en la lista legal) y comprueba que su plan sigue siendo coherente. |
| Después de cada operación | Replanifica el resto con el estado nuevo (el ejecutor ya lo permite). |
| Turno de otros | Solo **piensa**: actualiza amenazas y su intención. Actúa únicamente si el motor le ofrece una reacción (`pendingReactions`), y entonces decide con la misma evaluación. |

"No recalcular sin motivo": fuera de su turno solo se recalcula cuando una intención está marcada
"a revisar".

## 3. Qué sabe: percepción y memoria (DECISIÓN CONFIRMADA → diseño PROPUESTO)
`KnowledgeView` (ampliación del contrato actual), por cada criatura conocida:

| Dato | Cómo se obtiene |
|---|---|
| Posición | Visible ahora (`canSee`), o última posición conocida con antigüedad. |
| Bando y tamaño | Al verla. |
| Estado visible | Maltrecha (Bloodied), inconsciente, condiciones visibles (Derribado, Apresado…), si la ve. |
| **CA estimada** | Intervalo `[mín, máx]` aprendido de **sus propias** tiradas: si su total T impacta, CA ≤ T; si falla (sin 1 ni 20 naturales), CA > T. Antes de observar nada: desconocida, con una suposición inicial (PENDIENTE: cuál). |
| **PG estimados** | Daño que ha visto recibir y si está Maltrecha (indica la mitad). Los PG exactos nunca se conocen. |
| Capacidades vistas | Ataques, alcances, daños observados, conjuros y capacidades usadas ("Caín usa magia"). |
| Amenaza observada | Daño que esa criatura ha causado (a ella o a sus aliados) en el combate. |
| Desconocido | Lo que nunca ha visto: no existe para el cerebro. |

**Sobre sí misma y sus aliados** (PROPUESTA): conoce su propia ficha completa, y de sus aliados lo
mismo que de cualquier otra criatura que observe (no comparten mente).

**Inteligencia, percepción y memoria** (PENDIENTE de decidir; propuesta inicial simple):
- Todos aprenden de lo que **perciben**.
- La capacidad de memoria y la precisión de las estimaciones podrían depender de INT y SAB
  (por ejemplo, una bestia de INT 2 no recuerda conjuros), con umbrales que tendrías que aprobar.

La percepción necesita reglas de visibilidad más completas: luz, oscuridad, cobertura, obstáculos
del mapa, sentidos especiales y Esconderse. Hoy solo existen Cegado e Invisible (decisión 52).

## 4. Qué decide: opciones legales y planes (PROPUESTA)
Resuelve la decisión 12 (`getLegalActions`): el cerebro **no** recibe una lista cerrada de turnos
completos, sino que **construye planes** encadenando los puntos de decisión del ejecutor:

1. En cada punto, el motor da las opciones legales (`getTurnOptions`).
2. Para las opciones con parámetros, el motor ofrece **generadores de candidatos legales**:
   - movimiento → casillas alcanzables con su ruta y coste (nuevo: `reachableSquares`);
   - áreas → colocaciones válidas (origen y dirección);
   - efectos con objetivos → objetivos posibles.
3. Un **plan** es una secuencia de órdenes: mover, iniciar capacidad, elegir opción, acción
   adicional, mover, terminar.
4. La dificultad limita cuántos candidatos se generan y exploran.

Cubre: posicionamiento (casillas candidatas), objetivos, ataques, capacidades, recursos, acciones
adicionales, Destrabarse y Correr, retirada, rendición (si huye) y reacciones (decidir sobre
`pendingReactions`).

## 5. Cómo juzga: evaluación (DECISIÓN CONFIRMADA: numérica por consecuencias)
Cada plan se simula sobre el estado creído y produce **rasgos medidos en unidades naturales**. Se
calculan; no se inventan:

| Factor (especificación) | Rasgo medible propuesto | Unidad |
|---|---|---|
| Daño esperado | Σ P(impacto) × daño medio (con crítico, Ventaja/Desventaja y defensas conocidas) | PG |
| Probabilidad de impacto | Ya dentro del daño esperado (con la CA estimada) | 0–1 |
| Posibilidad de eliminar | P(PG estimados del objetivo ≤ daño) | 0–1 |
| Riesgo | Daño esperado que puede recibir hasta su próximo turno (enemigos que lo alcanzan, con lo que sabe de ellos, y ataques de oportunidad del plan) | PG |
| Supervivencia | P(seguir en pie hasta su próximo turno) | 0–1 |
| Posicionamiento | Cobertura (cuando exista en el mapa), enemigos adyacentes, distancia a su alcance preferido según sus ataques | varias |
| Control | Condiciones aplicadas a enemigos × su duración; enemigos que dejan de poder actuar | turnos-enemigo |
| Cooperación | Flanqueos que habilita, aliados vulnerables protegidos, reparto de objetivos | varias |
| Recursos | Usos limitados gastados, ponderados por lo que quede de combate | usos |
| Consecuencias futuras | Lo anterior evaluado al final del plan (y, en dificultad alta, tras la respuesta prevista de los enemigos) | — |

**Puntuación** = Σ (peso del factor × rasgo).

**Los pesos no los invento** (prohibido en `CLAUDE.md`). PROPUESTA: **calibración por escenarios**.
1. Escribimos juntas situaciones de prueba con la decisión que tú consideras correcta para cada
   personalidad. Por ejemplo, tu caso del goblin: "Cata amenaza y Caín está a cubierto → Cata";
   "Caín va a matar a un aliado y está a tiro → Caín".
2. Cada escenario es una prueba automática.
3. Los pesos se ajustan hasta que se cumplen todas, y tú apruebas los valores finales.
4. Los perfiles de personalidad son **datos** (JSON con un peso por factor), así que añadir
   "cobarde" o "protector" es añadir un perfil.

Relación con los **cuatro factores del brief original**:
- prioridad de personalidad → los pesos;
- conveniencia del objetivo → amenaza observada, posibilidad de eliminar y vulnerabilidad;
- eficacia de la acción → daño esperado, control, cooperación y recursos;
- riesgo → riesgo, supervivencia y posicionamiento.

Propongo sustituir el contrato de 4 factores por esta lista más fina (PENDIENTE, ver pregunta).

## 6. Dificultad (DECISIÓN CONFIRMADA: calidad, no estadísticas)
Parámetros configurables (nombres PROPUESTOS; valores por nivel a calibrar contigo):

| Parámetro | Efecto |
|---|---|
| `maxCandidatesPerDecision` | Cuántas opciones examina en cada punto (casillas, objetivos…). |
| `planDepth` | Cuántas operaciones encadena dentro del turno. |
| `enemyResponseLookahead` | 0: solo su turno; 1: estima la respuesta de los enemigos antes de su siguiente turno. |
| `evaluationFeatures` | Qué rasgos calcula (p. ej. "fácil" no calcula cooperación ni flanqueos). |
| `coordination` | Ninguna, conocer las intenciones de sus aliados o planificar en equipo. |
| `replanTriggers` | Qué eventos le hacen replanificar. |

Nunca da información extra ni dados mejores.

## 7. Cooperación (PROPUESTA)
- Cada monstruo publica su **intención** (objetivo y posición prevista) en una pizarra del bando.
- Los demás la consideran según su nivel de `coordination`. Por ejemplo, no perseguir todos al
  mismo personaje salvo que convenga, buscar el flanqueo o proteger al vulnerable.
- La pizarra solo contiene lo que los monstruos pueden comunicarse u observar (PENDIENTE:
  ¿se comunican sin restricción entre aliados?).

## 8. Reproducibilidad (PROPUESTA)
- Empates de puntuación: desempate **determinista** (orden estable de las opciones).
- Variación opcional con un generador con semilla, **separado** de los dados del combate, como pide
  la especificación §12. Desactivada por defecto.

## 9. Lo que falta en el motor para que el cerebro haga todo lo que pide la especificación
| Necesita | Para | Estado |
|---|---|---|
| Obstáculos, muros y terreno difícil en el mapa | Cobertura, rutas, "aprovechar obstáculos" | No existe (decisión 2) |
| Cobertura (½, ¾, total) | Posicionamiento, CA efectiva | Verificada, sin implementar |
| Esconderse, luz y oscuridad, sentidos | "Esconderse", percepción realista | Sin implementar (decisiones 6 y 52) |
| Conjuros y catálogo | "Cuándo usar conjuros" | Sin implementar (decisión 27) |
| Ayudar, Preparar, Influir | Cooperación y "negociar" (pacifista) | Sin implementar (decisión 10) |
| Ataque sin armas y agarrar | Ataques de oportunidad de cualquiera, controlar | Sin implementar (decisión 60) |
| `reachableSquares` y generadores de candidatos | Planes de movimiento | Nuevo, en `rules` |
| Flujo de eventos `CombatEvent` | Percepción y replanificación | Nuevo, a partir del registro actual |

El cerebro puede empezar sin todo esto: decidirá con lo que exista y cada pieza nueva amplía sus
opciones sin rehacerlo.

## 10. Etapas propuestas
1. **[HECHA 2026-11-07] Percepción y memoria:** eventos, `KnowledgeView`, estimación de CA y PG, capacidades vistas.
   Con pruebas como "no conoce la CA exacta" o "aprende de sus fallos".
2. **[HECHA 2026-11-07] Candidatos y simulación:** `reachableSquares`, generadores de candidatos, estado creído y
   puerto de simulación con valores esperados.
3. **[HECHA 2026-11-07, pesos pendientes de aprobación] Evaluación y calibración:** rasgos medidos, escenarios contigo, perfiles en JSON y pesos
   aprobados.
4. **Planificador:** búsqueda por niveles de dificultad, replanificación por eventos y reacciones.
5. **Cooperación:** pizarra de intenciones del bando.
6. **Controlador:** `combat-controller` que juega los turnos de los monstruos de principio a fin, y
   su conexión con `ui-bridge`.
