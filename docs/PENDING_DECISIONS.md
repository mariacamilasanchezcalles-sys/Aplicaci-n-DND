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
16. Dónde se guarda en Android. El formato de guardado subió a la versión 3 (sin datos previos que migrar).
17. **Capacitor**: compatible (v8.6.0 exige Node >= 22; hay 22.23), pero no instalado. Faltan empaquetador web, `capacitor.config.ts`, JDK y Android SDK.
18. **Licencia y visibilidad del repositorio** (ver README): los datos del Goblin Warrior vienen de un libro que no está en el SRD.
