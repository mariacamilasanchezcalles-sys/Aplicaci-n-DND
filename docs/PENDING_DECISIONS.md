# Decisiones pendientes (requieren aprobación antes de continuar)

## Resueltas
7 PG del goblin provisionales · coordenadas desde 0 · casillas de 5 pies · diagonal alternada 1-2-1-2 (regla de mesa del DM) · el azar solo en los dados · Escapismo Ágil como acción adicional propia · ocupación por tamaño · mapa de 15 x 21 con 5 x 9 visibles · se puede atravesar, y actuar en, una casilla ocupada por criaturas Diminutas, Pequeñas o Medianas (coste normal, sin terreno difícil) pero no terminar el turno en ella. Detalle en `RULES_VERIFICATION.md`.

## Resueltas el 2026-11-07 (preguntas a la jugadora)
- **16 → Guardado:** local en el dispositivo como base (sin conexión); Firebase solo como copia/sincronización **opcional** si hay conexión y está configurado.
- **19 → Fichas:** arquitectura aprobada; la **personalidad y la dificultad** se asignan en el encuentro, no en la ficha.
- **20 → Ejecución:** el cerebro planea el turno completo y se ejecuta **operación por operación**, con reevaluación sobre el estado real y revalidación por el motor antes de cada operación.
- **21 → Acciones estándar** (Atacar, Correr, Destrabarse…) y **ataque de oportunidad**: con el mismo formato que las capacidades de ficha, como capacidades integradas del motor (un solo ejecutor).
- **22 → Costes:** activación y recursos se pagan una sola vez al iniciar y no se devuelven. Una operación `capability` no paga la activación de la capacidad usada, pero **sí** gasta sus recursos.
- **23 → Renuncia:** si un paso queda sin opción legal se pierde y se registra; además el monstruo **puede renunciar voluntariamente** a los pasos restantes.
- **31 → Reglas caseras:** siguen vigentes la diagonal 1-2-1-2 y atravesar criaturas Diminutas, Pequeñas y Medianas (aliadas o enemigas) a coste normal.
- **Siguiente etapa:** verificar en SRD 5.2.1 el vocabulario (decisión 26), Recharge y si se puede mover entre ataques de Multiataque (24); después, ejecutor de capacidades solo para ataques y acciones estándar, con pruebas de invariantes.

## Mapa y movimiento
1. ~~**Subirse a una criatura.**~~ → Resuelta (decisión 38): "Encaramarse a una criatura más grande", guía 2014. Sin implementar. Atravesar no es terreno difícil "a menos que quiera subir en la criatura". No está modelado: ¿qué significa subir, cuánto cuesta y se puede subir a criaturas Grandes o mayores (hoy bloquean el paso)?
2. **Terreno difícil del mapa** (cada casilla cuesta el doble): hoy el terreno es siempre abierto.

## Reglas: confirmar suposiciones
3. Las suposiciones de implementación listadas en `RULES_VERIFICATION.md` (cuenta de diagonales por turno, medida entre espacios, ancla de criaturas grandes, quién bloquea el paso, no atacarse a uno mismo, sin Velocidad, impacto con "total >= CA").
4. ~~**Bandos**~~ → Implementados: por defecto monstruos contra personajes jugadores, cambiable por criatura (`addCombatant(..., { side })`).
5. **Criaturas Diminutas:** el manual permite 4 por casilla; hoy ocupan una casilla exclusiva.

## Reglas: sin implementar
6. **Estado de condiciones, visibilidad y Hide** (Invisible, Oculto, ventaja/desventaja automáticas).
7. ~~**Ataques de oportunidad**~~ → Implementados (con su propio movimiento). Quedan las decisiones 59 a 61.
8. ~~**Llegar a 0 PG**~~ → Implementado con reglas verificadas (ver `RULES_VERIFICATION.md`). Queda la decisión 51.
9. ~~**Iniciativa y turnos**~~ → Implementados (ver `RULES_VERIFICATION.md`). Quedan las decisiones 57 y 58.
10. **Acciones sin modelar:** Help, Influence, Magic, Ready, Search, Study, Utilize.
11. **Rasgos con más ataques** (Extra Attack, Multiattack): hoy `attacksPerAttackAction`.

## Motor y cerebro táctico
12. **Cómo "piensa" el cerebro** → Especificación recibida el 2026-11-07 (`TACTICAL_BRAIN_SPEC.md`). Diseño propuesto en `TACTICAL_BRAIN_DESIGN.md`, **pendiente de aprobación**. Propuesta para `getLegalActions`: el cerebro construye planes encadenando los puntos de decisión del ejecutor y generadores de candidatos legales.
13. Rangos, escalas y pesos de los cuatro factores; catálogo de personalidades (solo `pragmatic`); niveles de habilidad.
14. Qué percibe cada criatura, memoria y ocultamiento.
15. Catálogo de recursos (conjuros, usos por descanso) y de roles del registro simplificado.

## Persistencia y Android
16. **Dónde se guarda.** La jugadora eligió Firebase para el prototipo, pero `PROJECT_SPEC.md` prohíbe servicios en la nube como requisito. Propuesta: guardado local como base (funciona sin conexión) y Firebase como copia/sincronización **opcional**. El adaptador de Firestore (caché local persistente, usuario anónimo, `firestore.rules`) quedó en el commit `62634f7`, sin probar contra un proyecto real. Falta: proyecto de Firebase, método de inicio de sesión (anónimo liga los datos al dispositivo) y confirmar el enfoque. El formato de guardado está en la versión 3.
17. **Capacitor**: compatible (v8.6.0 exige Node >= 22; hay 22.23), pero no instalado. Faltan empaquetador web, `capacitor.config.ts`, JDK y Android SDK.
18. **Licencia y visibilidad del repositorio** (ver README): los datos del Goblin Warrior vienen de un libro que no está en el SRD.

## Fichas declarativas y acciones compuestas (ver `SHEET_ARCHITECTURE.md`)
19. **Aprobar la arquitectura de fichas**: tipos en `models`, módulo `sheets`, vocabulario cerrado con `unmodeled` explícito, personalidad y habilidad asignadas en el encuentro y no en la ficha.
20. **Ejecución de capacidades** (propuesta): planear el turno completo y ejecutar operación por operación, con reevaluación y revalidación; estado de ejecución serializable dentro del encuentro. Resuelve en parte la decisión 12.
21. **Acciones estándar y ataque de oportunidad como capacidades integradas** con el mismo formato que las fichas.
22. **Costes**: se pagan todos de una vez al iniciar la capacidad y no se devuelven; una operación `capability` no paga la activación de la capacidad referida, pero sí sus recursos.
23. **Pasos sin opción legal** dentro de una capacidad: se pierden y quedan registrados. ¿Se puede renunciar voluntariamente al resto?
24. ~~Moverse entre los ataques de un Multiataque~~ → VERIFICADO: sí (ver `RULES_VERIFICATION.md`).
25. **Límites provisionales** del formato: `repeat` 1–10, `choice` 2–20, `sequence` 1–20, profundidad 8, CD 1–40, bonificadores ±30.
26. ~~Verificar el vocabulario~~ → VERIFICADO el 2026-11-07 contra SRD 5.2.1 y el Glosario 2024.
27. **Catálogo de conjuros**: las fichas aceptan `spellcasting` y `castSpell`, pero no existe catálogo (aviso `spellCatalogMissing`).

## De la especificación ampliada (sin diseñar)
28. **Personajes jugadores con dados físicos**: `resolveAttack` hoy tira dados virtuales; falta una entrada para "la tirada que comunicó el usuario" y la confirmación del daño.
29. **Semillas reproducibles**: hoy hay un único `RandomSource`. Propuesta: un generador con semilla y dos flujos separados (dados del combate y desempates del cerebro).
30. **Personalidades** Agresiva y Pacifista (hoy solo existe `pragmatic`) y **niveles de dificultad** por profundidad y amplitud de búsqueda.
31. **Reglas caseras vigentes frente a la especificación**: diagonal 1-2-1-2 y atravesar criaturas Diminutas, Pequeñas y Medianas siguen siendo DECISIÓN CONFIRMADA. La especificación pide verificar la ocupación según las reglas oficiales; se mantiene la regla casera salvo indicación.

## Ejecutor de turno (propuestas de la etapa 2026-11-07)
32. **No pagar una capacidad sin ninguna operación legal al empezar** (por ejemplo, Atacar sin nadie al alcance: primero hay que moverse). Es más restrictivo que el manual, que permite tomar la acción y moverse después entre ataques si el rasgo da varios.
33. **Nada de acciones adicionales entre las operaciones de una capacidad en curso** (por ejemplo, entre los dos ataques del Multiataque). PENDIENTE DE VALIDAR si las reglas 2024 lo permiten.
34. **Turno separado del encuentro**: `TurnState` no se guarda con el encuentro (no hay iniciativa). Al diseñar la iniciativa, decidir si el turno en curso entra en el guardado (subiría el formato a v5).
35. **Atacar a una criatura con 0 PG**: hoy se permite. Según el SRD, un monstruo muere al llegar a 0 PG; falta modelar la muerte y el estado de los personajes (decisión 8).
36. **Ataques de personajes jugadores y criaturas sin CA**: un ataque contra una criatura sin CA no se resuelve (`targetArmorClassUnknown`). Relacionado con la decisión 28 (dados físicos).

## Guía del DM 2014 (ver `HOUSE_RULES.md`)
- **Resueltas el 2026-11-07:** solo hay guía de 2014 (decisión 40). La mesa usa Flanquear, Moral, Daño masivo, Marcar y Encaramarse a una criatura más grande, como reglas caseras (37). La decisión 1 ("subirse a una criatura") es "Encaramarse a una criatura más grande" (38). La configuración de mesa por interruptores queda aprobada (39).
41. **Adaptar cada regla de 2014 a 2024** al implementarla: por ejemplo, Moral y Daño masivo usan estados y salvaciones que hay que mapear a las condiciones 2024; Marcar depende de los ataques de oportunidad (decisión 7). Se preguntará regla por regla.

## Recursos y daño (etapa 2026-11-07)
42. **"Instancia de daño"** (PROPUESTA): las partes del mismo tipo de una tirada se suman antes de aplicar la Resistencia. Afecta al redondeo: 3 + 3 cortante con Resistencia da 3 (sumando) o 2 (por partes). El SRD no lo aclara.
43. **Costes de capacidades anidadas**: una capacidad usada desde otra y que tiene costes aún no se ejecuta. Falta decidir cuándo se cobra si está dentro de un `choice` u `optional` (propuesta: al elegir esa rama).
44. **Descansos** (corto y largo): recuperan recursos (también los de Recarga, verificado), PG y más. Están fuera del combate y sin implementar.
45. **Cuándo se tira la Recarga**: hoy hay que llamar a `rollRechargesAtTurnStart` antes de `startTurn`. Se unirán al diseñar la iniciativa (decisión 9).

## Efectos y áreas (etapa 2026-11-07)
- **Resueltas:** las áreas usan el método de la guía 2014 (mitad de la casilla, todas las formas) y las salvaciones de los personajes jugadores las tira el jugador y la app las anota (total o éxito/fracaso).
46. **Colocación de áreas** (PROPUESTA): cono y línea en 8 direcciones; el cubo crece en diagonal desde una esquina de una cara (subconjunto de "cualquier punto de una cara"); con alcance 0 el origen está en el borde del espacio de la criatura.
47. **Quién está "dentro" de un área** (PROPUESTA): basta con una casilla de su espacio. Quien crea el área queda fuera salvo `includesSelf`.
48. **Línea de 5 pies trazada por una línea de la cuadrícula**: con la regla de la mitad cubre media casilla a cada lado, así que afecta a dos filas. Es lo que dice el método; confirmar que la mesa lo juega así.
49. **Efectos aún no aplicables**: condiciones, PG temporales, desplazamiento forzado, CD de conjuros. Una capacidad que los incluya no se ejecuta.
50. ~~**Ataques de personajes jugadores**~~ → Implementado según la especificación §3: el jugador dice su d20 natural y su total; la app decide si impacta; el jugador anota el daño.

## Condiciones y 0 PG (etapa 2026-11-07)
51. **Monstruos tratados como personajes a 0 PG**: el SRD permite al DM que un monstruo concreto no muera al llegar a 0 PG. ¿Lo quieres como opción por criatura?
52. **"Ver" sin percepción**: hoy una criatura ve a otra salvo que esté Cegada o la otra sea Invisible. Faltan luz, cobertura, obstáculos y sentidos (visión ciega, visión verdadera…), que dependen de la percepción (decisión 14).
53. **Objetivos muertos** (PROPUESTA): no se ofrecen como objetivo de ataques ni de efectos. Los cuerpos siguen ocupando su espacio.
54. **`validateTurnPlan` no tiene en cuenta las condiciones**: valida planes completos sin estado de condiciones. El ejecutor paso a paso es la fuente de verdad. ¿Retiramos `validateTurnPlan` o lo hacemos usar las mismas comprobaciones?
55. **Duraciones en asaltos y minutos**: necesitan la iniciativa (decisión 9). Hasta entonces, un efecto con esas duraciones no se ejecuta. "Hasta escapar" se queda hasta que se quite a mano (escapar no está modelado).
56. **Esquivar** solo se registra en el turno: falta que dure hasta el inicio del siguiente turno de quien esquiva y que dé Desventaja a sus atacantes.

## Iniciativa y reacciones (etapa 2026-11-07)
57. **Duraciones en asaltos** (PROPUESTA): N asaltos terminan al inicio del N-ésimo turno siguiente de quien causó el efecto (o del afectado si no hay origen); 1 minuto = 10 asaltos.
58. **Turnos de monstruos muertos** (PROPUESTA): se saltan. Los personajes a 0 PG sí tienen turno (salvaciones contra la muerte).
59. **Reacciones de ficha** (`activation: "reaction"` con desencadenante): el sistema de reacciones pendientes ya existe, pero solo para ataques de oportunidad. Hay que conectar los desencadenantes de las fichas.
60. **Ataque sin armas**: el ataque de oportunidad también puede hacerse con un Ataque sin armas, que aún no existe. Hoy solo reacciona quien tiene un ataque cuerpo a cuerpo registrado; los personajes sin ataques registrados no reaccionan.
61. ~~**Quién reacciona**~~ → DECISIÓN CONFIRMADA: solo los enemigos del que se mueve.
62. **Validación del total del jugador**: la app no comprueba que el total anotado sea coherente con el d20 (el jugador suma sus modificadores, incluidas Ventaja/Desventaja y Cansancio).
63. ~~**Marcar**~~ → Implementada (ver `HOUSE_RULES.md`).

## Bandos y reglas caseras (etapa 2026-11-07)
64. **Moral, "no puede dañar a sus oponentes"** (PROPUESTA): al inicio de su turno, ningún enemigo en pie está a su Velocidad más el mayor alcance de sus ataques y efectos de daño (o no tiene ninguno). Aproxima el juicio del DM.
65. **Huyendo** (PROPUESTA): no ataca ni usa efectos; solo Correr y Destrabarse (también como acción adicional) y moverse sin acercarse a ningún enemigo que vea. Si no puede escapar, la persona o el cerebro ordena `surrender`.
66. **Shock "hasta el final de su siguiente turno"** (PROPUESTA): si ocurre durante su propio turno, dura también todo el siguiente.
67. **Escenario base de pruebas**: las pruebas del motor usan la mesa de la jugadora **sin** Flanquear, Marcar, Daño masivo ni Moral (`CORE_TEST_TABLE_RULES`); cada regla casera tiene sus propias pruebas.
68. **Encaramarse a una criatura más grande** (regla casera confirmada): sin implementar; necesita agarrar y pruebas de característica enfrentadas.

## Cerebro táctico (propuesta 2026-11-07, ver `TACTICAL_BRAIN_DESIGN.md`)
69. ~~**Arquitectura**~~ → CONFIRMADO (2026-11-07): nuevo módulo `combat-controller`; `perception` podrá importar `rules` (visibilidad); el cerebro simula consecuencias con un puerto de simulación sobre un estado creído.
70. ~~**Factores**~~ → CONFIRMADO: sustituir los 4 factores del brief por la lista de la especificación, medida en unidades naturales.
71. ~~**Pesos**~~ → CONFIRMADO: calibración con escenarios aprobados por la jugadora; perfiles de personalidad como datos (JSON).
72. **Inteligencia y memoria:** CONFIRMADO que de momento todas aprenden de lo que perciben; queda pendiente cómo influyen INT y SAB.
73. ~~**Suposición inicial de CA y PG**~~ → CONFIRMADO y APROBADA la tabla (`BRAIN_CALIBRATION.md`): PG ≈ 9,75 + 6,5 × (nivel − 1); CA en el intervalo 11–18 (central 14). Derivada del SRD 5.2.1.
74. ~~**Comunicación entre aliados**~~ → CONFIRMADO: los monstruos de un bando comparten todo (conocimiento e intenciones).
75. ~~**Variación con semilla**~~ → CONFIRMADO: desempate siempre igual (determinista); la variación con semilla queda para más adelante, opcional.

## Etapa 1 del cerebro: percepción y memoria (2026-11-07)
76. **Maltrecho es visible** (PROPUESTA): quien ve a una criatura sabe si está Maltrecha. Con el daño neto visto acota sus PG máximos. La cota falla si recibió daño o curación que el bando no vio.
77. **Condiciones visibles** (PROPUESTA): todas las condiciones de una criatura que se ve, salvo Invisible; el Cansancio, como presente o ausente.
78. **Qué se aprende de un ataque ajeno** (PROPUESTA): de los ataques de otro bando solo se aprende el ataque usado y el daño (no el total de la tirada). Tampoco se aprende aún el bonificador de salvación de los personajes.
79. **Percepción solo por la vista**: oído, sentidos especiales y luz quedan para cuando existan en el motor (decisión 52).

## Etapa 2 del cerebro: candidatos y simulación (2026-11-07)
80. **Estimación puntual** (PROPUESTA): con las dos cotas, el punto medio; con una sola, el supuesto inicial dentro de la cota (o la cota); sin cotas, el supuesto. Para las probabilidades se promedian todas las CA del intervalo.
81. **Dados esperados** (PROPUESTA): para avanzar un estado creído se usa la media del dado redondeada al par (d20 → 10, d6 → 4…). Las probabilidades se calculan aparte, de forma exacta.
82. **Lo que el estado creído no sabe de un enemigo**: Velocidad, ataques, defensas y recursos. Hoy aparecen vacíos; habrá que estimarlos con lo observado para prever su respuesta (etapa 3).
83. **Ajuste técnico**: `tactical-brain` puede importar **solo tipos** de `rules` (lo comprueba `tests/architecture.test.ts`), para nombrar órdenes y opciones sin poder ejecutar reglas.
84. **Monstruo o personaje se distingue a simple vista** (PROPUESTA): la memoria guarda si una criatura es monstruo o personaje jugador.

## Etapa 3 del cerebro: evaluación y calibración (2026-11-07)
85. **Ataque y Velocidad supuestos de los personajes** (PROPUESTA, derivado del SRD): +(bonificador por competencia + 3), 1d8 + 3 a 5 pies y Velocidad 30, hasta que se observen sus ataques reales.
86. **Quién amenaza** (PROPUESTA): un enemigo amenaza si puede llegar con su Velocidad más el alcance de su mejor ataque; se cuenta un ataque por enemigo (sin Ataque extra ni Multiataque supuestos).
87. **Salvaciones de jugadores en la simulación** (PROPUESTA): se supone que superan las de Daño masivo (el cerebro no cuenta con el shock).
88. **Signos de los pesos por personalidad** (PROPUESTA, sacados del texto de la especificación): ver `PERSONALITY_SIGNS` en `tactical-brain/calibration.ts`.
89. ~~**Aprobar los pesos calculados**~~ → APROBADOS por la jugadora el 2026-11-07 (19 decisiones). Ver la decisión 98: con la búsqueda libre necesitan una recalibración.
90. **Más escenarios** (resuelto en lo pedido: E1–E6, más E7 riesgo inútil del agresivo, E8 y E9 recursos, E10 control del pacifista. Sigue sin haber un caso en que alguna personalidad prefiera una condición al daño: el peso de `conditionsInflicted` es 0 en las tres). Texto original: faltan casos de E1, E2 y E4 para agresivo y pacifista, y casos que pongan a prueba recursos, condiciones, riesgo para el agresivo y defensa propia para el pacifista (hoy su peso de amenaza inmediata es negativo: evita atacar incluso a quien le amenaza).
91. ~~**E3 "Destrabarse y huir"**~~ → CONFIRMADO: sin Correr.
92. **Efectos en la simulación** (PROPUESTA): el bonificador de salvación supuesto de un enemigo es la media de las seis salvaciones de la matriz estándar (+0,83 de característica y 2 de 6 con competencia; nivel 1 → +1,5). Un personaje que salva contra un efecto toma en la simulación el resultado más probable (falla si la probabilidad de fallo pasa de 0,5); el daño y la condición se valoran por su esperanza.
93. **Rasgo `friendlyDamage`** (PROPUESTA): daño esperado que el plan causa a aliados (p. ej. un aliento que los alcanza). Signo ≤ 0 en las tres personalidades; ningún escenario lo pone a prueba aún (peso 0).
95. **Estructura de la búsqueda** (PROPUESTA): fases [levantarse?] [mover?] [capacidad completa], o mover y terminar; poda por haz con la puntuación de "terminar aquí"; Destrabarse y Correr se exploran con su movimiento en la misma fase; no se explora moverse entre ataques de la acción de Atacar; no se prueban áreas que no alcanzan a nadie ni casillas donde no puede terminar el turno.
96. **Valores de dificultad** (PROPUESTA, pendiente de aprobación; `tactical-brain/difficulty.ts`). Traducción de la tabla de la especificación §5:

    | Parámetro | Fácil | Normal | Difícil |
    |---|---|---|---|
    | Planes que pasan a la fase siguiente (`beamWidth`) | 1 | 2 | 4 |
    | Fases del turno (`maxPhases`) | 2 | 3 | 3 |
    | Casillas examinadas por movimiento | 4 | 12 | todas |
    | Colocaciones de área / combinaciones de objetivos | 4 / 2 | 12 / 6 | todas |
    | Moverse entre ataques | no | sí | sí |
    | Rasgos que no calcula | flanqueos | — | — |
    | Replanificar tras cada operación (etapa 6) | no | no | sí |
    | Coordinación (etapa 5) | limitada | considera aliados | planifica cooperación |

    Medido en los 18 casos de calibración (ordenador de desarrollo): Fácil 701 planes de media, 47 ms (máx. 132) y elige lo decidido en 15 de 18; Normal 872, 49 ms (máx. 85), 15 de 18; Difícil 1.311, 171 ms (máx. 671), 18 de 18. Falta medir en el teléfono. La dificultad se guardará en el encuentro en la etapa 6.
97. **Ataque de oportunidad** (PROPUESTA): se hace si "atacar" puntúa más que "dejarlo pasar" con los mismos pesos (solo cambian los rasgos de daño causado). Aún no se cuenta el valor de guardar la reacción (no hay otras reacciones).
98. ~~**Recalibrar con la búsqueda**~~ → HECHO el 2026-11-07 (rondas 1 y 2, `BRAIN_CALIBRATION.md` §6). Texto original (PROPUESTA): mostrar a la jugadora el plan que elige la búsqueda en cada escenario cuando no coincide con su respuesta; si lo rechaza, se añade como alternativa peor y se recalculan los pesos; repetir hasta que la búsqueda elija planes aceptados. Si algún caso no cuadra con los signos, se pregunta.
99. **Riesgo de morir** (PROPUESTA): `deathRisk` pasa a ser la probabilidad de caer a 0 PG antes de su próximo turno (cada amenaza impacta con su probabilidad y hace su daño medio por impacto). Antes era min(1, daño esperado / PG) y no distinguía Esquivar con 2 PG.
100. **Rasgo `adjacentEnemiesWhileBloodied`** (PROPUESTA): enemigos pegados al terminar si está Maltrecho. Resuelve el conflicto E3/E6 del pacifista ("prioriza huir" sobre todo herido). Signo ≤ 0 para el pacifista.
101. **Moverse entre ataques** (PROPUESTA): tras cada ataque de la acción de Atacar (o de un Multiataque que se realiza como ella), se prueba moverse a la casilla más barata desde la que alcanza a cada objetivo nuevo.
102. **Efectos al impactar de los ataques** → condiciones al impactar y Agarrado (escapar, fin, una por parte) IMPLEMENTADOS el 2026-11-07. Sigue PENDIENTE: arrastrar al agarrado, empujones (desplazamiento forzado), PG temporales y efectos al fallar ("Miss:", "Hit or Miss:"). Texto original (PENDIENTE, motor): un ataque de ficha con condición al impactar (p. ej. Agarrado), empujón o efecto al fallar se omite al convertir la ficha (`attackEffectNotSupported`), y con él las capacidades que lo usan (p. ej. un Multiataque). Muchos monstruos oficiales los tienen: hace falta implementarlos para que el cerebro use todas sus acciones.
103. **Reacciones de ficha** → parcialmente IMPLEMENTADAS el 2026-11-07 (decisión 107). Texto original (PENDIENTE, motor): el motor solo ofrece el ataque de oportunidad; las reacciones declaradas en las fichas (p. ej. "Contragolpe") no se ejecutan, así que el cerebro aún no puede decidirlas.
105. **Velocidad tras escapar** (PENDIENTE DE VALIDAR): al escapar de un agarre recupera el movimiento del turno (Velocidad × (1 + veces que usó Correr)). Interpretación de "Speed" y "Dash" del glosario 2024.
106. **Escape de los monstruos** (PROPUESTA): eligen la mejor de FUE (Atletismo) y DES (Acrobacias); si el perfil no da la habilidad, se usa el modificador de característica.
107. **Reacciones de ficha** (PROPUESTA): se ofrecen las de desencadenante "le impactan con un ataque" (`selfHitByAttack`) o "recibe daño" (`selfTakesDamage`) y cuerpo de ataque (o elección de ataques), al terminar el ataque o efecto que las provoca. El cerebro las decide como el ataque de oportunidad (`decideReaction`) y, al planear, cuenta como daño provocado las que puedan dirigirse contra él. PENDIENTE: los desencadenantes que modifican un ataque en curso o se adelantan (p. ej. Parada: +CA contra un impacto), los de movimiento (`creatureLeavesReach`, `creatureEntersArea`), `selfDropsToZeroHitPoints`, `creatureTakesAction` y los cuerpos que no son ataques.
108. **Reacciones vistas en el estado creído** (PROPUESTA): si el bando ha visto a un enemigo usar una reacción, le atribuye esa reacción con su ataque supuesto. Si no la ha visto, no sabe que existe.
109. **Cooperación sin pesos nuevos** (PROPUESTA): la pizarra cambia cómo se miden dos rasgos ya calibrados. `finishingChance` cuenta solo la parte de rematar que no consiguen los aliados que actúan después (evita ensañarse todos con el mismo). `flankingPairs` coloca a esos aliados donde terminarán. Solo cuentan las intenciones de este asalto de los aliados que actúan después en la iniciativa.
110. **Coordinación por nivel** (PROPUESTA): "limitada" no mira la pizarra; "considera aliados" la usa; "planifica cooperación" planea tentativamente a los aliados siguientes, en orden de iniciativa, cada uno con su personalidad y sobre el estado que deja el anterior, y replanifica con sus intenciones (una ronda). Las intenciones tentativas se publican; cada aliado vuelve a planear en su turno.
111. **Proteger a un aliado vulnerable** (PENDIENTE): la especificación lo menciona en la cooperación, pero no hay rasgo que lo mida ni escenario que lo calibre. Haría falta un rasgo (p. ej. daño esperado que recibirán los aliados) y escenarios.
112. **Ajustes del cerebro en el encuentro** (PROPUESTA): `Encounter.brainSettings` guarda el nivel del grupo (sin él el cerebro no piensa: error `partyLevelRequired`) y la dificultad de cada monstruo. Un monstruo sin dificultad asignada juega en "Normal".
113. **Cuándo replanifica el controlador** (PROPUESTA): en Difícil, tras cada operación; en Fácil y Normal, cuando un paso ya no es legal o pasa algo relevante (cae o muere una criatura, el actor recibe daño o una condición por una reacción, se interrumpe un movimiento, hay Moral o Daño masivo). Un ataque fallado no replanifica por sí solo. Tope de 20 replanificaciones por turno; si no hay plan posible, renuncia a lo que quede y termina el turno.
114. **Peticiones al jugador durante el turno de un monstruo** (PROPUESTA): el controlador se detiene y pide las salvaciones de los personajes contra un efecto, sus reacciones (ataque de oportunidad o reacción de ficha) y las salvaciones de Daño masivo; sigue al recibir la respuesta. Una respuesta que no corresponde a la petición no hace avanzar.
115. **Turno de los personajes en la fachada** (PENDIENTE): el ejecutor paso a paso existe en `rules`, pero la fachada aún solo expone `validateTurnPlan`. Hace falta exponerlo, junto con la iniciativa (`startCombat`, `advanceTurn`), cuando se retomen las pantallas.
116. **Ataques de los personajes** (PROPUESTA): la tarjeta solo pide nombre, cuerpo a cuerpo o distancia, alcance o distancias y tipo de daño (lo que usa el motor). El bonificador y los dados no se guardan: el jugador anota su tirada y su daño.
117. **Despliegue automático** (PROPUESTA): monstruos en las filas de arriba y personajes en las de abajo, centrados; se pueden recolocar antes de tirar la iniciativa.
118. **Grupos de iniciativa** (PROPUESTA): los monstruos de la misma ficha comparten tirada (el DM decide los grupos según las reglas).
119. **Fin del combate** (PROPUESTA): victoria si ningún monstruo sigue en pie (muertos o rendidos); derrota si ningún personaje está en pie.
120. **Dificultad Personalizada** (PROPUESTA): la persona elige alternativas (1–6), profundidad (1–3 fases), casillas examinadas (o todas), moverse entre ataques, coordinación y replanificar tras cada operación. Áreas y objetivos siguen al límite de casillas.
121. **Pantallas** (PROPUESTA): recorrido de cinco pantallas con la dirección visual de la jugadora (`UI_REQUIREMENTS.md`). Detalles decididos por Claude:
    - nombre visible "Simulador Táctico";
    - los grupos idénticos de monstruos se desempatan solos (id);
    - la tirada de ataque del jugador pide d20, total y daño a la vez (el daño se ignora si falla);
    - el registro omite planes internos del cerebro salvo "cambia de plan";
    - un aventurero puede elegir como objetivo a un aliado (lo permiten las reglas).
122. **Turno de monstruo visible** (PENDIENTE): hoy se resuelve de golpe y se lee en el registro. Propuesta: animar paso a paso (movimiento y ataques) con una pausa breve.
123. **Configuración** (PENDIENTE): qué ajustes quiere la jugadora (hoy solo "Reducir animaciones").
124. **Guardado de partidas** (PROPUESTA): la sesión completa (encuentro, fase, turno y registro) se guarda en el dispositivo (máximo 20 partidas). Firebase sigue sin incluir (decisión 16).
104. ~~**Conflictos de calibración**~~ → DECISIÓN CONFIRMADA (2026-11-07): la jugadora delega en Claude los juicios evidentes y los conflictos entre sus respuestas, aplicando su especificación; cada uno se documenta con su nota en `tests/calibration/judged-plans.json` y en `BRAIN_CALIBRATION.md` §6.
94. **Monstruo de prueba "Draco de prueba"** (`tests/fixtures/sheets/test-drake.json`): ficha inventada solo para E8–E10; no es una criatura oficial.
