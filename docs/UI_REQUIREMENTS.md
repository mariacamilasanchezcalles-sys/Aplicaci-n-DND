# Interfaz: requisitos y estado (2026-11-09)

## Dirección visual (DECISIÓN CONFIRMADA por la jugadora, 2026-11-09)
**Fantasía oscura naturalista:** negro carbón, rojo carmesí, metal envejecido, piedra, raíces, hojas y runas. Mucha atmósfera, sin sacrificar la claridad para jugar.

| Ficha de color | Valor | Uso |
|---|---|---|
| Negro carbón | `#101010` | Fondos |
| Rojo sangre | `#701C25` | Botones principales, selección, peligro, elementos activos |
| Verde musgo | `#292B25` | Detalles ambientales (nunca dominante) |
| Oro antiguo | `#B59A70` | Marcos finos de bronce, como un grimorio |

- Tipografía decorativa para títulos (**Cinzel**) y sencilla para estadísticas (**Alegreya Sans**, cifras alineadas y tabulares). Licencia OFL, incluidas en la app (sin conexión).
- Iconos de espadas, escudos, dados, calaveras, árboles y runas.
- **Regla:** la atmósfera va en fondos, marcos e ilustraciones; números y controles, muy legibles.
- Un mismo mundo en todas las pantallas: el inicio es la entrada; el bestiario, un libro antiguo; los personajes, los aventureros que se preparan; la dificultad, un ritual; el combate, el mundo convertido en tablero.
- **Arte propio en SVG** (decisión de la jugadora): emblema, bosque con ruinas, retrato del Goblin, iconos y runas (`app/art/art.ts`). No se usa arte con derechos.

## Recorrido (implementado, `app/`)
Sin barra inferior. La preparación tiene un indicador superior ("Paso 2 de 4": Enemigos, Personajes, Dificultad y Combate), el resumen del encuentro actual ("2 Goblins · 2 Aventureros · Dificultad pendiente") y "Selección guardada". Se puede volver a cualquier paso sin perder lo elegido: el borrador se guarda en el dispositivo.

1. **Inicio:** emblema, bosque con ruinas y luna rojiza, brasas y niebla animadas. "ENTRAR AL COMBATE"; accesos secundarios a partidas guardadas y configuración.
2. **Bestiario:** buscador, filtros por tipo, tamaño y Valor de Desafío, y tarjetas con ilustración y estadísticas (CA, PG, Velocidad, VD y ataques).
   - Los elegidos aparecen con cantidad editable y personalidad.
   - Cada criatura es una **instancia independiente** (PG, posición, condiciones y recursos propios).
   - Hoy solo está el Goblin Warrior (decisión de la jugadora: ampliar más adelante, verificando cada ficha).
3. **Personajes:** tarjetas guardadas y reutilizables entre partidas, con solo lo que usa el motor:
   - nombre, clase o descripción opcional, tamaño, PG actuales y máximos, CA y Velocidad;
   - ataques (nombre, cuerpo a cuerpo o distancia, alcance y tipo de daño);
   - el nivel del grupo.

   Cata y Caín vienen con su nombre: sus datos los completa la jugadora (no se inventan).
4. **Dificultad:** Fácil, Normal, Difícil y Personalizada. La Personalizada configura alternativas, profundidad, posiciones evaluadas, coordinación, moverse entre ataques y replanificación. Nunca cambia tiradas, estadísticas ni información.
5. **Combate:** las zonas son:
   - barra superior: pausa, asalto, de quién es el turno, zoom y registro;
   - orden de iniciativa;
   - tablero con arrastre y pellizco (5 x 9 casillas visibles en vertical);
   - panel de la criatura elegida (PG, CA, Velocidad, condiciones y estado);
   - acciones **legales** del turno (las da el motor; no se muestran las ilegales);
   - registro ("Crónica del combate").

   Fases: despliegue (recolocar), iniciativa (los jugadores anotan sus totales y desempatan), turnos y final (victoria o derrota).
   - Los monstruos juegan solos con el cerebro.
   - Las tiradas de los jugadores se anotan: ataques (d20, total y daño), salvaciones, reacciones, Daño masivo y salvaciones contra la muerte.
   - En pantalla ancha, el panel pasa al lateral.

## Restricciones (vigentes)
- Texto en español; la interfaz nunca interpreta texto libre (el buscador solo filtra nombres).
- La interfaz habla con el núcleo solo a través de `ui-bridge`; no contiene reglas.
- Sin conexión: tipografías, arte y fichas van en el paquete. El guardado es local (`localStorage`).

## Pendiente (ver `PENDING_DECISIONS.md`)
- Firebase opcional (decisión 16): no está incluido; el guardado es solo local.
- Animar los movimientos y ataques de los monstruos (hoy su turno se resuelve de golpe y se lee en el registro).
- Contenido de "Configuración" (hoy solo "Reducir animaciones").
- Probar en el teléfono y empaquetar con Capacitor.
