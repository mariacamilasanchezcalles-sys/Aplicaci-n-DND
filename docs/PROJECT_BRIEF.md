# Brief original del proyecto

Documento fuente entregado por la jugadora al inicio. Las decisiones posteriores (mapa de 15x21, diagonal alternada, ocupación por tamaño, etc.) están en `CLAUDE.md` y `docs/`; si hay conflicto, mandan esas.

---

Proyecto: simulador táctico de combate de D&D

Actúa como desarrollador de software sénior. Tu tarea actual es preparar la estructura técnica inicial de una aplicación de simulación de combate para Dungeons & Dragons.

1. Objetivo del proyecto

La aplicación debe permitir simular combates de D&D con monstruos que toman decisiones tácticas mediante un sistema algorítmico de puntuación. No se utilizará inteligencia artificial generativa para tomar decisiones durante el combate.

La aplicación está en fase de planificación y desarrollo inicial. Varias reglas y decisiones de diseño todavía no están definidas.

Tu trabajo ahora es preparar una base técnica ordenada, modular y fácil de ampliar, sin adelantarte a las decisiones pendientes.

2. Tecnologías y restricciones

* TypeScript.
* Desarrollo en GitHub Codespaces.
* Objetivo inicial: aplicación Android instalable mediante APK.
* Funcionamiento sin conexión a internet.
* Arquitectura que permita separar el núcleo de combate de la interfaz.
* Capacitor es la opción prevista para empaquetar la aplicación; verifica la configuración del proyecto antes de incorporarlo.
* No desarrolles todavía una interfaz visual completa.

3. Arquitectura requerida

Prepara módulos independientes para:

A. Núcleo de combate y reglas.
Responsable de validar las acciones legales, administrar turnos, movimiento, posiciones, recursos y resolución de acciones.

B. Cerebro táctico.
Será responsable de evaluar las acciones legales mediante puntuaciones numéricas. Por ahora, crea únicamente su contrato de entrada y salida, los tipos de datos necesarios y un punto de integración vacío. NO implementes todavía el algoritmo de decisión ni inventes puntuaciones definitivas.

C. Modelos y datos de combate.
Define estructuras tipadas para criaturas, personajes, ataques, acciones, posiciones, recursos y encuentros. Separa los datos de las reglas que los procesan.

D. Percepción y conocimiento de las criaturas.
Reserva un módulo para distinguir el estado real del combate de la información que cada monstruo conoce. No implementes todavía el sistema completo de percepción o memoria.

E. Interfaz.
Prepara únicamente la integración mínima necesaria para comprobar que la aplicación puede comunicarse con el núcleo. No inviertas tiempo en diseñar pantallas completas.

F. Persistencia.
Reserva una interfaz para guardar y cargar encuentros manualmente. No implementes todavía un sistema completo de archivos o guardado si no es necesario para validar la arquitectura.

4. Decisiones de diseño ya tomadas

* El cerebro táctico no utilizará IA generativa.
* No se aceptará texto libre para describir ataques o acciones.
* Los datos funcionales se representarán mediante tipos, identificadores, números, enumeraciones y estructuras definidas.
* Los nombres visibles serán etiquetas para las personas, no instrucciones que el programa deba interpretar.
* El motor de reglas será responsable de determinar qué acciones son legales.
* El cerebro táctico solo podrá evaluar acciones legales.
* La personalidad de cada monstruo modificará sus prioridades, pero nunca permitirá violar las reglas.
* Los cuatro factores tácticos definidos hasta ahora son:
    1. Prioridad de personalidad.
    2. Conveniencia del objetivo.
    3. Eficacia de la acción.
    4. Riesgo.
* La legalidad será un filtro obligatorio, no una puntuación.
* La posición y sus consecuencias futuras se considerarán dentro de la eficacia y el riesgo, sin añadir por ahora un factor independiente.
* Los rangos y pesos definitivos de las puntuaciones están pendientes de diseño.
* El jugador no tendrá que registrar obligatoriamente toda su hoja de personaje. La primera versión debe admitir un registro simplificado.
* No implementes importación automática de fichas ni interpretación de texto libre.

5. Escenario provisional para verificar la arquitectura

Prepara datos de prueba, no lógica táctica definitiva:

Goblin:

* Posición: columna 10, fila 5.
* Puntos de golpe: 7.
* Clase de armadura: 15.
* Velocidad: 30 pies.
* Personalidad: pragmática.
* Ataques provisionales: cimitarra y arco corto.
* Rasgo provisional: Escapismo Ágil, que permite Destrabarse o Esconderse como acción adicional según las reglas aplicables.

Cata:

* Posición: columna 6, fila 5.
* Rol de prueba: combatiente principalmente cuerpo a cuerpo.

Caín:

* Posición: columna 10, fila 11.
* Rol de prueba: lanzador de conjuros con capacidad ofensiva a distancia.

Cada casilla representa 5 pies. El terreno es abierto.

Estos datos son provisionales. No des por confirmadas las reglas de una edición hasta verificar las mecánicas correspondientes a D&D 5e de 2024. No mezcles reglas de distintas ediciones.

6. Acciones y movimiento

Modela por separado:

* Acciones principales.
* Acciones adicionales.
* Movimiento.
* Ataques concretos como opciones evaluables.

No asumas que cada ataque es una acción independiente en términos de reglas. Tampoco trates el movimiento normal como equivalente a la acción de Correr (Dash). La legalidad de cada combinación debe corresponder a las reglas de la edición objetivo.

7. Pruebas y calidad

Crea pruebas básicas para verificar:

* La creación de un encuentro.
* El registro de criaturas y sus posiciones.
* La representación tipada de ataques y acciones.
* La comunicación entre módulos.
* La compilación del proyecto.

No escribas pruebas que den por aprobadas decisiones tácticas todavía pendientes.

8. Límites estrictos

NO:

* Implementes el cerebro táctico definitivo.
* Inventes pesos o puntuaciones.
* Desarrolles un editor completo de personajes.
* Implementes importación de fichas.
* Añadas interpretación de lenguaje natural.
* Construyas una interfaz visual completa.
* Añadas funcionalidades no solicitadas.
* Mezcles lógica de reglas, puntuación táctica y presentación en un mismo módulo.

Si una decisión importante no está definida, crea una interfaz provisional, documenta la cuestión pendiente y continúa con las partes que no dependan de ella.

9. Entregables

Al terminar, informa:

1. Qué archivos y módulos creaste.
2. Para qué sirve cada módulo.
3. Qué decisiones técnicas tomaste.
4. Qué comandos ejecutaste para verificar el proyecto y sus resultados.
5. Qué partes están implementadas y cuáles son solamente estructuras provisionales.
6. Qué decisiones pendientes requieren aprobación antes de continuar.

No avances a la siguiente etapa por tu cuenta. Espera instrucciones antes de implementar el cerebro táctico o diseñar las pantallas definitivas.