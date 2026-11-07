# Decisiones pendientes (requieren aprobación antes de continuar)

## Resueltas
7 PG del goblin provisionales · coordenadas desde 0 · casillas de 5 pies · diagonal alternada 1-2-1-2 (regla de mesa del DM) · el azar solo en los dados · Escapismo Ágil como acción adicional propia · ocupación por tamaño · mapa de 15 x 21 con 5 x 9 visibles · se puede atravesar, y actuar en, una casilla ocupada por criaturas Diminutas, Pequeñas o Medianas (coste normal, sin terreno difícil) pero no terminar el turno en ella. Detalle en `RULES_VERIFICATION.md`.

## Mapa y movimiento
1. **Subirse a una criatura.** Atravesar no es terreno difícil "a menos que quiera subir en la criatura". No está modelado: ¿qué significa subir, cuánto cuesta y se puede subir a criaturas Grandes o mayores (hoy bloquean el paso)?
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
24. **Moverse entre los ataques de un Multiataque** (PENDIENTE DE VALIDAR en 2024).
25. **Límites provisionales** del formato: `repeat` 1–10, `choice` 2–20, `sequence` 1–20, profundidad 8, CD 1–40, bonificadores ±30.
26. **Verificar el vocabulario** contra SRD 5.2.1: 13 tipos de daño, 15 condiciones, tipos de criatura, formas de área, Recharge y el orden de resistencias y vulnerabilidades.
27. **Catálogo de conjuros**: las fichas aceptan `spellcasting` y `castSpell`, pero no existe catálogo (aviso `spellCatalogMissing`).

## De la especificación ampliada (sin diseñar)
28. **Personajes jugadores con dados físicos**: `resolveAttack` hoy tira dados virtuales; falta una entrada para "la tirada que comunicó el usuario" y la confirmación del daño.
29. **Semillas reproducibles**: hoy hay un único `RandomSource`. Propuesta: un generador con semilla y dos flujos separados (dados del combate y desempates del cerebro).
30. **Personalidades** Agresiva y Pacifista (hoy solo existe `pragmatic`) y **niveles de dificultad** por profundidad y amplitud de búsqueda.
31. **Reglas caseras vigentes frente a la especificación**: diagonal 1-2-1-2 y atravesar criaturas Diminutas, Pequeñas y Medianas siguen siendo DECISIÓN CONFIRMADA. La especificación pide verificar la ocupación según las reglas oficiales; se mantiene la regla casera salvo indicación.
