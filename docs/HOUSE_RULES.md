# Reglas caseras y reglas opcionales candidatas

## Fuente analizada: Guía del Dungeon Master (edición **2014**)
La jugadora compartió la *Guía del Dungeon Master* en español (Edge Entertainment; créditos de
Mearls, Crawford, Perkins y Wyatt). Es la guía de **2014**, no la de 2024.

- **No sirve para verificar reglas del motor.** El proyecto usa solo D&D 2024 (SRD 5.2.1 y Basic
  Rules 2024). Ninguna regla de esta guía entra en el motor como "regla oficial".
- **Sí sirve para documentar el origen de las reglas caseras** del DM de la jugadora, y como
  catálogo de reglas **opcionales** que el DM podría usar. Cada una solo se implementaría si la
  jugadora confirma que su mesa la usa, y siempre como **REGLA CASERA** configurable.
- **No se copia al repositorio** (material con derechos de autor y decisión 18 sobre la
  visibilidad del repositorio). Aquí solo hay resúmenes breves y la página del PDF.

## Reglas caseras ya vigentes: origen identificado
| Regla del proyecto | Origen | Coincidencia |
|---|---|---|
| **Diagonal alternada 1-2-1-2** (`alternating-1-2`) | Guía DM 2014, cap. 8, "Regla opcional: Diagonales" (p. 251-252 del PDF) | **Total.** La 1.ª diagonal cuenta 5 pies y la 2.ª 10, y el patrón se repite. La cuenta **sigue aunque haya pasos rectos entre diagonales**, y se aplica también **al medir alcances** (`squareDistance`). La guía no dice cuándo se reinicia la cuenta; el proyecto la reinicia cada turno (suposición 1 de `RULES_VERIFICATION.md`). |
| **Atravesar criaturas Diminutas, Pequeñas y Medianas** | No aparece en la guía. Es propia del DM | La guía trae otras opciones para pasar por el espacio de un enemigo ("Abrirse paso" y "Rodar", ver abajo) que **no** coinciden con esta regla. |

## Reglas opcionales de la guía 2014 relacionadas con el simulador (candidatas)
Ninguna está implementada. Para cada una hay que saber si la mesa de la jugadora la usa.

| Regla opcional | Página PDF | Resumen | Qué afectaría |
|---|---|---|---|
| Flanquear | 251 | Dos aliados en lados opuestos de un enemigo que ven tienen Ventaja en sus ataques cuerpo a cuerpo contra él | Tiradas de ataque; táctica de posicionamiento del cerebro |
| Encaramiento | 251-252 | Arcos frontal, laterales y trasero; Ventaja al atacar por la espalda | Posición y orientación de cada criatura (dato nuevo) |
| Iniciativa por bandos | 270 | Una tirada por bando; cada bando actúa entero | Iniciativa (decisión 9) |
| Factor de velocidad | 270-271 | Iniciativa en cada asalto con modificadores por acción y tamaño | Iniciativa (decisión 9) |
| Abrirse paso | 271 | Acción o acción adicional: prueba enfrentada de Atletismo para pasar por el espacio de un enemigo | Movimiento |
| Desarmar | 271 | Tirada de ataque enfrentada a una prueba para hacer soltar un objeto | Acción nueva |
| Echar a un lado | 271 | Empujar en diagonal en lugar de hacia atrás | Desplazamiento forzado |
| **Encaramarse a una criatura más grande** | 271 | Prueba enfrentada; el pequeño entra en el espacio del grande, se mueve con él y tiene Ventaja; dentro de ese espacio es terreno difícil | **Decisión 1 ("subirse a una criatura")**: puede ser lo que quiso decir el DM |
| Marcar | 271-272 | Tras un ataque cuerpo a cuerpo, Ventaja en ataques de oportunidad contra el marcado, sin gastar la reacción | Ataques de oportunidad (decisión 7) |
| Rodar | 272 | Prueba enfrentada de Acrobacias para atravesar una vez el espacio de un enemigo | Movimiento |
| Impactar a la cobertura | 272 | Un ataque a distancia fallado por la cobertura golpea a lo que la da | Cobertura |
| Golpear a varias criaturas | 272 | El daño sobrante pasa a otra criatura cercana | Daño |
| Heridas y secuelas | 272 | Tabla de heridas permanentes | Fuera del combate táctico |
| Daño masivo | 273 | Daño ≥ mitad de los PG máximos: salvación de CON CD 15 o tabla de shock | Daño y estados |
| **Moral** | 273 | Los monstruos pueden huir según ciertas circunstancias y una salvación | **Cerebro** ("cuándo huir"); ver nota |

**Nota sobre Moral:** decidir huir es una decisión del cerebro táctico (personalidad y riesgo).
Una regla de moral convierte esa decisión en una **tirada** que obliga a huir. Si la mesa la usa,
iría en el motor como regla casera que **restringe** las opciones legales (por ejemplo, "debe
huir"). El cerebro nunca la evaluaría como un peso más.

## Propuesta de integración (pendiente de aprobación)
1. **Configuración de mesa** (`TableRules`) por encuentro o campaña, con cada regla casera u
   opcional como un interruptor con identificador, por ejemplo `diagonal: "alternating-1-2"` o
   `flanking: false`. El motor la lee; el cerebro nunca la cambia. Hoy solo existe
   `GridConfig.diagonalRule`.
2. Cada regla activada se anota aquí y en `RULES_VERIFICATION.md` como **REGLA CASERA** con su
   origen.
3. Si la jugadora tiene la **Guía del DM 2024**, sustituiría a esta como referencia de reglas
   opcionales, para no mezclar ediciones.
