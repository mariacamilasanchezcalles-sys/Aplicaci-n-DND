# Especificación ampliada del proyecto

Documento entregado por la jugadora después del brief original (`PROJECT_BRIEF.md`). Lo amplía y,
en caso de conflicto con el brief, manda este documento. Las decisiones posteriores tomadas con
la jugadora (en `CLAUDE.md` y `docs/`) mandan sobre ambos.

> Nota del estado anterior (sección 14 del original): el informe previo hablaba de un esqueleto
> con 23 pruebas en `/home/claude/dnd-tactical-sim`. El repositorio real tenía **135 pruebas**
> al importarse.

---

## 1. Papel
Arquitecto de software, ingeniero de TypeScript y desarrollador especializado en motores de
reglas, simulación táctica e inteligencia artificial **determinista**. No se usa IA generativa,
modelos de lenguaje ni servicios externos para las decisiones tácticas. Se trabaja junto con la
jugadora, explicando las decisiones y sin cambiar por cuenta propia lo ya decidido.

## 2. Objetivo general
Simulador táctico de combate de D&D 5e (reglas 2024) para **Android**, descargable y que funcione
**completamente sin conexión**. Pensado para partidas presenciales con dados físicos y tablero
cuadriculado. La app controla principalmente a los monstruos. El objetivo no es administrar hojas
de personaje, sino un cerebro táctico que interprete las reglas y tome decisiones legales.

Características:
- Android y funcionamiento offline.
- Cuadrícula de 5 pies; el usuario controla el tablero.
- Iniciativa y turnos.
- PG, condiciones, recursos y estados.
- Resolución automática de las acciones de los monstruos.
- IA táctica determinista.
- Fichas de monstruos cargables y extensibles.
- Guardado y carga manual.
- Dados físicos para los personajes jugadores; virtuales para los monstruos.

**No introducir servicios en la nube como requisito de funcionamiento.**

## 3. Experiencia de uso
**Personajes jugadores**: solo los datos mecánicos necesarios:
- identificador, nombre y posición;
- PG actuales y máximos, CA y Velocidad;
- tamaño, atributos o modificadores necesarios y condiciones;
- información mecánica relevante.

Cuando un personaje ataca:
1. El usuario comunica la tirada.
2. La app determina si impacta.
3. El usuario introduce o confirma el daño.
4. Se actualizan PG y estados.

Cuando un monstruo ataca:
1. El simulador elige una acción legal.
2. Tira el ataque.
3. Lo compara con la CA.
4. Determina el daño.
5. Informa del resultado.
6. El usuario confirma las consecuencias.

**Monstruos**: el simulador administra sus PG, recursos, acciones, movimiento, condiciones,
reacciones, decisiones y tiradas.

**Tablero**:
- coordenadas, tamaños variables, obstáculos, terrenos y cobertura;
- distancias y alcances, movimiento legal y ataques de oportunidad;
- el usuario puede mover posiciones cuando haga falta.

## 4. Principio fundamental: motor de reglas y cerebro separados
- **Motor de reglas**: qué acciones existen y cuáles son legales, requisitos, recursos
  consumidos, efectos, dados y actualización del estado.
- **Cerebro**: qué objetivo atacar, qué acción usar, dónde posicionarse, cuándo huir, proteger a
  un aliado, usar una capacidad especial o aprovechar una oportunidad.

**Regla innegociable:** el cerebro jamás convierte una acción ilegal en legal. Primero se generan
y validan las opciones; el cerebro evalúa solo las legales; antes de ejecutar se revalida. El
cerebro no implementa ni duplica reglas.

## 5. Fichas de monstruos: arquitectura declarativa (decisión adoptada)
Fichas como datos estructurados (preferentemente JSON) validados con tipos y esquemas de
TypeScript. La ficha declara las capacidades y el código las interpreta. No se programa cada
monstruo; una mecánica nueva se implementa como manejador general reutilizable.

Campos posibles:
1. Identificación.
2. Tipo y tamaño.
3. CA y PG.
4. Velocidades.
5. Atributos.
6. Salvaciones y competencias.
7. Sentidos.
8. Resistencias, inmunidades y vulnerabilidades.
9. Rasgos pasivos.
10. Acciones, acciones adicionales y reacciones.
11. Conjuros.
12. Recursos, usos limitados y recargas.
13. Efectos especiales.

No todas las fichas necesitan todos los campos.

Componentes conceptuales: Sheet Loader, Sheet Validator, Action Catalog, Effect Catalog,
Requirement Evaluator, Rules Engine y Tactical Brain.

## 6. Acciones y efectos
- **Acción**: lo que la criatura decide hacer.
- **Efecto**: lo que ocurre (daño, curación, condición, desplazamiento forzado…).
- **Requisitos**: alcance, cargas, mano libre…
- **Coste**: acción, acción adicional, reacción, movimiento, espacio de conjuro, carga.

Una acción puede tener varios efectos, requisitos y costes.

Catálogo inicial a contemplar (ampliable):
- ataques cuerpo a cuerpo, a distancia y múltiples;
- conjuros, áreas y curación;
- condiciones, movimiento especial y desplazamiento forzado;
- efectos pasivos, reacciones y duraciones;
- usos limitados y recargas;
- resistencias e inmunidades;
- capacidades especiales.

## 7. Acciones compuestas
Tres niveles:
1. Acción individual.
2. Acción compuesta.
3. Plan táctico.

Estructuras: `sequence`, `choice`, `repeat`, `optional` y `conditional`. Son herramientas de
representación, no reglas de D&D.

Multiataque:
1. Validar que la acción esté disponible.
2. Validar el primer ataque.
3. Resolverlo.
4. Actualizar el estado.
5. Validar el segundo ataque.
6. Resolverlo si sigue siendo legal.

Se respetan los costes de la acción original: no son dos acciones.

Propuesta pendiente de formalizar: plan inicial, ejecutar la primera operación, observar el
estado y reevaluar el resto sin violar las restricciones de la capacidad. No todas las
compuestas son secuencias rígidas: hay sustituciones, opcionales y condiciones especiales.

## 8. Planificación táctica
Determinista y offline, sin LLM, APIs ni conexión permanente.

Ciclo:
1. Recibir el estado.
2. Consultar la percepción.
3. Generar acciones.
4. Generar combinaciones de planes.
5. Validar la legalidad.
6. Evaluar las consecuencias.
7. Elegir.
8. Ejecutar.
9. Actualizar.
10. Reevaluar lo que quede pendiente.

Factores:
- probabilidad de impacto y daño esperado;
- riesgo, distancia, posicionamiento y cobertura;
- oportunidades de ataque, protección de aliados y control del terreno;
- condiciones, recursos y supervivencia;
- personalidad.

Personalidad y habilidad táctica son **independientes**. Personalidades iniciales: Pragmática,
Agresiva y Pacifista. La personalidad modifica prioridades y pesos, nunca la legalidad.

Dificultad:
- Se usa como inspiración la analogía con los motores de ajedrez: profundidad, alternativas y
  calidad de evaluación. No se afirma conocer sus algoritmos internos.
- La dificultad no consiste en errores aleatorios ni absurdos.
- Límites: profundidad máxima, límite de alternativas, criterios de finalización, detección de
  planes equivalentes, poda segura de opciones dominadas y prevención de ciclos.

## 9. Percepción y conocimiento
Se distinguen el estado real, lo percibido, lo recordado y lo desconocido. El cerebro recibe una
representación de conocimiento, no todas las fichas enemigas.

Aspectos a considerar:
- visibilidad, sonido y sentidos especiales;
- detección, ocultamiento e invisibilidad;
- obstáculos, distancia e información previa.

Estar oculto no es lo mismo que ser invisible, y ser invisible no implica que la ubicación sea
desconocida.

## 10. Reglas 2024 recopiladas (especificación de la usuaria, no transcripción oficial)
Verificar en fuentes 2024 y no mezclar con 2014.

**Turnos**
- Rondas de unos 6 segundos; la iniciativa se mantiene entre rondas.
- Movimiento divisible; una acción.
- Acción adicional solo si alguna capacidad la concede.
- Reacción con desencadenante, recuperada al inicio del turno propio y resuelta en el momento
  del desencadenante.
- Incapacitado: sin acciones, adicionales ni reacciones, pero no impide necesariamente moverse.

**Acciones básicas**: Atacar, Ayudar, Buscar, Correr, Destrabarse, Esconderse, Esquivar,
Estudiar, Influenciar, Magia, Preparar, Utilizar.

**Movimiento**
- Pies sobre una cuadrícula de 5 pies; ortogonal y diagonal.
- Terreno difícil; trepar, nadar y arrastrarse; movimiento dividido.
- Paso entre espacios ocupados con restricciones de tamaño; no terminar voluntariamente en el
  espacio de otra criatura.
- Esquinas de obstáculos.
- Levantarse de Derribado cuesta movimiento; con Velocidad 0 no se puede levantar.

**Tamaño**: Diminuto 4 por casilla; Pequeño y Mediano 1; Grande 2×2; Enorme 3×3; Gargantuesco 4×4.

**Ataques**
- Alcance, cuerpo a cuerpo y distancia; ventaja y desventaja.
- Cobertura: media +2 a la CA y a las salvaciones de Destreza; tres cuartos +5; total no se
  puede seleccionar directamente.
- Visibilidad, modificadores, críticos y daño; resistencias, vulnerabilidades e inmunidades.
- Distancia: rango normal y largo; desventaja más allá del normal; imposible más allá del
  largo; desventaja con un enemigo visible no incapacitado a 5 pies.

**Ataques de oportunidad**
- Al salir del alcance por movimiento propio, contra una criatura visible; se resuelven justo
  antes de salir.
- Destrabarse los evita durante el resto del turno; teletransportarse y ciertos desplazamientos
  forzados no los provocan.
- El motor debe procesar el movimiento paso a paso.

**PG**
- Nunca superan el máximo; la curación tampoco lo supera.
- Los PG temporales se consumen primero, no se acumulan y no son curación.
- Maltrecho (mitad o menos de los PG) no tiene efecto automático.
- Críticos según las reglas; modificadores de daño en el orden oficial.
- No se asume muerte automática a 0 PG.

**Condiciones** como efectos mecánicos verificables (no etiquetas): Agarrado, Apresado,
Derribado, Asustado, Aturdido, Cansancio, Cegado, Ensordecido, Envenenado, Hechizado,
Incapacitado, Inconsciente, Invisible, Paralizado, Petrificado.

**Conjuros**
- Nivel, espacios, preparación, componentes, alcance, objetivos y área.
- Duración, concentración, salvaciones y ataques de conjuro.
- Efectos, condiciones, escalado, usos gratuitos y recargas.
- Los declara la ficha; no hay un sistema por monstruo.

**Concentración**: termina al iniciar otra concentración, por daño (salvación de Constitución),
al quedar Incapacitado, al morir o voluntariamente; se actualiza en el momento.

**Ocultamiento y sentidos**
- Esconderse, Sigilo y Percepción.
- Visión en la oscuridad, visión verdadera, visión ciega y sentido de vibraciones.
- Detectar magia, detectar criaturas y bloqueos por materiales.
- No asumir que se conoce la ubicación de lo que no se ve.

## 11. Reacciones y eventos
Eventos:
- una criatura abandona un alcance;
- recibe daño;
- entra en un área;
- es atacada;
- cae a 0 PG;
- realiza una acción determinada.

Las fichas declaran desencadenantes y efectos. El motor gestiona disponibilidad, condiciones,
requisitos, momento exacto, interrupción y revalidación, sin ciclos ni cadenas infinitas.

## 12. Aleatoriedad y reproducibilidad
Semillas reproducibles. Generadores separados para los dados del combate y para los desempates
o la variación del cerebro. El cerebro puede estimar probabilidades, pero no conoce los dados
futuros. Misma situación, configuración y semilla ⇒ mismo resultado.

## 13. Pruebas y calidad
Pruebas de:
- legalidad, movimiento y ataques;
- ataques de oportunidad y reacciones;
- condiciones, recursos y conjuros;
- acciones compuestas y decisiones tácticas;
- guardado y carga, y reproducibilidad.

Invariantes:
1. Nunca ejecutar una acción ilegal.
2. Nunca gastar recursos no disponibles.
3. Nunca superar los PG máximos.
4. No perder eventos de reacción.
5. No ejecutar dos veces la misma operación.
6. No permitir movimiento ilegal.
7. Mantener la consistencia entre estado y recursos.
8. El cerebro solo evalúa planes legales.

Cada error detectado se convierte en prueba de regresión.

## 15. Escenario de prueba inicial
- Goblin en (10,5) con 7 PG (dato de fixture, no la ficha oficial).
- Cata en (6,5), cuerpo a cuerpo.
- Caín en (10,11), a distancia.
- Terreno abierto; casillas de 5 pies.
- Goblin: CA 15, Velocidad 30, Cimitarra +4 1d6+2, Arco corto +4 1d6+2 y Nimble Escape.

## 16. Decisiones de desarrollo
- TypeScript y arquitectura modular.
- Reglas separadas de la interfaz.
- Funcionamiento offline obligatorio; Android primero.
- El diseño visual es secundario; nada innecesario antes de tener un motor fiable.
- La jugadora quiere entender y aprobar la arquitectura.
- Trabajo por etapas con finalidad y pruebas.

## 17. Forma de trabajo
Antes de modificar: inspeccionar, identificar la estructura, distinguir lo implementado de los
stubs, revisar las pruebas, detectar inconsistencias y dar un diagnóstico breve. Después,
proponer un plan incremental.

No hacer:
- reescribir todo;
- renombrar sin justificar;
- borrar pruebas;
- añadir dependencias innecesarias;
- implementar reglas por suposición.

Si falta una definición: identificarla, explicar por qué importa, proponer una opción
provisional y marcarla como pendiente.

Etiquetas: **DECISIÓN CONFIRMADA**, **PROPUESTA**, **PENDIENTE DE VALIDAR**, **REGLA OFICIAL
VERIFICADA**, **REGLA CASERA**.

Entrega por etapa:
1. Objetivo.
2. Archivos.
3. Explicación.
4. Código.
5. Pruebas realizadas.
6. Resultados.
7. Limitaciones.
8. Siguiente paso.

## 18. Primera tarea de esta especificación
Analizar el estado y diseñar la arquitectura de fichas declarativas y acciones compuestas:
1. Ficha.
2. Tipos de acciones.
3. Efectos.
4. Requisitos.
5. Costes.
6. Compuestas.
7. Estructuras.
8. Ejecución y reevaluación.
9. Validación.
10. Compatibilidad futura.

Después, implementar progresivamente los tipos, la validación y la carga. No programar todavía
el cerebro completo ni manejadores para decenas de monstruos. → Ver `docs/SHEET_ARCHITECTURE.md`.

## 19. Principio final
Legalidad primero. Coherencia después. Inteligencia táctica encima de ambas.
