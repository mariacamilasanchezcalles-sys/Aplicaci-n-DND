# Especificación del cerebro táctico (de la jugadora, 2026-11-07)

Texto entregado por la jugadora. Es la fuente de las decisiones sobre el cerebro. El diseño técnico
que la desarrolla está en `TACTICAL_BRAIN_DESIGN.md`.

## 1. Cuándo piensa
Piensa durante todo el combate, pero no recalcula constantemente sin motivo: observa el combate y
reacciona a los acontecimientos importantes.

| Momento | Qué hace |
|---|---|
| Inicio de su turno | Analiza la situación completa y planifica |
| Antes de cada operación | Comprueba que la decisión siga siendo válida |
| Después de cada operación | Actualiza su estrategia según el resultado |
| Durante el turno de otros | Evalúa amenazas y posibles reacciones |
| Cuando ocurre un evento importante | Reconsidera sus prioridades |
| Cuando cambia el campo de batalla | Recalcula rutas, objetivos y oportunidades |

Ejemplo: un goblin planea acercarse a Cata y atacarla, pero en el turno anterior Caín elimina a otro
goblin que protegía su posición. El goblin debe reconocer que la situación cambió y reconsiderar su
estrategia.

**Pensar no significa actuar fuera de su turno:** solo actúa cuando las reglas lo permiten (por
ejemplo, con una reacción).

## 2. Qué decide
Decisiones tácticas completas, no solo elegir un ataque:
- **Posicionamiento:** a qué casilla moverse, qué distancia mantener, acercarse o alejarse, buscar
  cobertura, evitar quedar rodeado, aprovechar obstáculos y terreno.
- **Objetivos:** a quién atacar, a quién debilitar primero, cuándo cambiar de objetivo, cuándo
  atender una amenaza inmediata.
- **Capacidades:** qué ataque, cuándo usar conjuros y habilidades especiales, cuándo reservar
  recursos, cuándo usar acciones adicionales y reacciones.
- **Supervivencia:** retirarse, esconderse, Destrabarse, proteger a un aliado, abandonar un objetivo
  demasiado arriesgado.
- **Cooperación:** no perseguir todos al mismo personaje sin razón, rodear, proteger a los
  vulnerables, coordinar ataques, aprovechar las capacidades de otros monstruos.

Debe considerar todas las decisiones que las reglas y su ficha le permitan.

## 3. Cómo juzga
Evaluación **numérica de consecuencias**, no reglas rígidas ("si tiene pocos PG, atacarlo"…).

| Factor | Qué evalúa |
|---|---|
| Daño esperado | Cuánto daño podría causar |
| Probabilidad de impacto | Qué tan probable es acertar |
| Riesgo | Cuánto daño podría recibir |
| Posicionamiento | Qué tan favorable es su ubicación |
| Supervivencia | Qué tan probable es que siga vivo |
| Control | Cuánto limita las opciones enemigas |
| Cooperación | Cómo beneficia a sus aliados |
| Recursos | Qué tan conveniente es gastar una capacidad |
| (Consecuencias futuras) | Incluido en la especificación resumida |

Ejemplo del goblin (7 PG; Cata cerca, cuerpo a cuerpo; Caín lejos, a distancia; cimitarra y arco):
- No elige a Cata por estar más cerca.
- Opción A, atacar a Cata: probabilidad de impacto, daño esperado, riesgo de quedarse a su lado,
  posible respuesta y posibilidad de eliminarla.
- Opción B, atacar a Caín: probabilidad con el arco, daño esperado, distancia, cobertura, amenaza
  que representa Caín y riesgo de quedarse donde está.
- Si Cata es una amenaza inmediata y Caín está a cubierto, quizá convenga Cata. Si Caín está a punto
  de eliminar a otro aliado y el goblin lo alcanza con el arco, quizá convenga Caín.
- **Depende de las circunstancias, no de una prioridad fija.** Debe poder comparar **planes
  completos**.

## 4. Personalidades
Modifican prioridades, nunca las reglas ni la legalidad.
- **Agresivo:** prioriza el daño, busca oportunidades de ataque, acepta más riesgo, persigue
  objetivos vulnerables y gasta recursos para ganar ventaja ofensiva. No es estúpido: sigue
  considerando el peligro.
- **Pragmático:** prioriza la supervivencia y la eficacia, evalúa riesgos y beneficios, usa
  cobertura, cambia de objetivo cuando conviene y se retira cuando el combate deja de ser
  favorable. Es el perfil equilibrado.
- **Pacifista:** evita causar daño si tiene alternativas; prioriza huir, esconderse o negociar;
  puede proteger aliados; prefiere incapacitar o controlar antes que matar; no inicia violencia
  innecesaria; si debe defenderse, combate.

La lista es ampliable (cobarde, protector, territorial, vengativo, disciplinado, instintivo…). La
personalidad es **independiente de la dificultad**: un agresivo puede ser muy listo o muy torpe.

## 5. Dificultad
Representa la **calidad de las decisiones**, sin bonificaciones artificiales (ni más PG, ni más daño,
ni más información).

| Capacidad | Fácil | Normal | Difícil |
|---|---|---|---|
| Opciones evaluadas | Pocas | Varias | Muchas |
| Profundidad de planificación | Limitada | Intermedia | Mayor |
| Reevaluación | Básica | Frecuente | Después de cada operación relevante |
| Coordinación | Limitada | Considera aliados | Planifica cooperación |
| Posicionamiento | Básico | Busca ventajas | Evalúa varias posiciones |
| Recursos | Uso sencillo | Uso situacional | Administración estratégica |

Niveles configurables mediante parámetros: profundidad de búsqueda, número máximo de alternativas,
calidad de evaluación, anticipación y coordinación. Como mejorar un motor de ajedrez, no como subir
estadísticas. Una dificultad alta **no conoce el futuro ni usa información que la criatura no tiene**.

## 6. Qué sabe
Se separa el estado real del conocimiento de cada criatura.

| Información | ¿La conoce automáticamente? |
|---|---|
| Posición visible de Cata | Sí |
| Posición de Caín detrás de una pared | No, salvo que tenga información para localizarlo |
| PG exactos de Cata | No |
| CA exacta de Cata | No |
| Que Cata está sangrando o maltrecha | Si puede observarlo y reconocerlo |
| Que Caín utiliza magia | Si ha observado esa capacidad |
| Que un personaje está inconsciente | Si puede percibirlo |
| Una habilidad que nunca ha visto | No |
| Un ataque que recibió anteriormente | Puede recordarlo |

**Aprende durante el combate:** si su ataque falla contra Cata, actualiza su estimación de la
defensa de Cata y la mejora con más observaciones, sin conocer la CA exacta. Recuerda que Caín lanzó
un conjuro. Todo esto depende de su **inteligencia, percepción, memoria y capacidades**.

## 7. Resumen
- Evalúa el combate continuamente mediante eventos relevantes.
- Decide movimiento, objetivos, ataques, recursos, supervivencia y cooperación.
- Compara consecuencias mediante puntuaciones numéricas.
- Su personalidad es independiente de su habilidad táctica.
- Mejora con más profundidad de búsqueda y capacidad de planificación.
- Solo usa información que puede percibir, conocer o recordar.
- Reevalúa sus decisiones cuando cambia el estado real del combate.
- Nunca ejecuta acciones ilegales.

## 8. Especificación técnica resumida (texto de la jugadora)
1. **Frecuencia:** evaluación basada en eventos. Reevalúa al comenzar su turno, antes y después de
   cada operación, ante eventos tácticamente relevantes, cuando cambia la información que puede
   percibir y cuando se activan oportunidades de reacción.
2. **Responsabilidades:** posicionamiento, movimiento, objetivos, ataques, conjuros y capacidades
   especiales, recursos, retirada y supervivencia, protección de aliados, cooperación y reacciones.
3. **Evaluación:** daño esperado, probabilidad de impacto, riesgo de recibir daño,
   posicionamiento, supervivencia, control del terreno, cooperación, recursos consumidos y
   consecuencias futuras. Compara planes completos.
4. **Personalidad:** independiente de la dificultad. Agresivo, Pragmático y Pacifista. Modifica
   ponderaciones, nunca la legalidad.
5. **Dificultad:** profundidad de búsqueda, alternativas examinadas, calidad de evaluación,
   anticipación y coordinación. Sin estadísticas artificiales ni información oculta.
6. **Percepción:** `KnowledgeView` con información percibida, recordada, estimaciones,
   incertidumbre y desconocida. PG y CA exactos no se conocen automáticamente; se estiman a partir
   de lo observado.
7. **Replanificación:** planificación anticipada con reevaluación tras cada operación relevante,
   sin violar las restricciones de la acción compuesta original.
8. **Restricción fundamental:** solo evalúa y elige acciones que el motor declaró legales; la
   ejecución vuelve a validar; la evaluación nunca modifica las reglas.
