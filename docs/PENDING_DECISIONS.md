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
4. **Bandos (aliados/enemigos).** Necesarios para la desventaja de disparar con un enemigo cerca y para el cerebro táctico.
5. **Criaturas Diminutas:** el manual permite 4 por casilla; hoy ocupan una casilla exclusiva.

## Reglas: sin implementar
6. **Estado de condiciones, visibilidad y Hide** (Invisible, Oculto, ventaja/desventaja automáticas).
7. **Ataques de oportunidad** y reacciones.
8. **Llegar a 0 PG** (muerte, salvaciones de muerte, estabilidad).
9. **Iniciativa y turnos** (`initiativeOrder`, `round`).
10. **Acciones sin modelar:** Help, Influence, Magic, Ready, Search, Study, Utilize.
11. **Rasgos con más ataques** (Extra Attack, Multiattack): hoy `attacksPerAttackAction`.

## Motor y cerebro táctico
12. **Cómo "piensa" el cerebro.** La jugadora indicó que el cerebro piensa todo el tiempo y que lo explicará; hasta recibir esa explicación no se diseña nada. Bloquea `getLegalActions` (¿pasos sueltos o turnos completos?).
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
50. **Ataques de personajes jugadores** con dados físicos (decisiones 28 y 36): el mismo mecanismo de "el jugador tira y la app lo anota" serviría para sus tiradas de ataque y su daño.
