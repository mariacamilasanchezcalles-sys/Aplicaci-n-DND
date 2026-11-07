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
| **Áreas: mitad de la casilla** (`halfSquareDmg2014`) | Guía DM 2014, cap. 8, "Áreas de efecto" (p. 253 del PDF) | La guía lo dice de las áreas circulares; la jugadora aprobó aplicarlo a **todas** las formas. El origen es una intersección entre casillas. |
| **Atravesar criaturas Diminutas, Pequeñas y Medianas** | No aparece en la guía. Es propia del DM | La guía trae otras opciones para pasar por el espacio de un enemigo ("Abrirse paso" y "Rodar", ver abajo) que **no** coinciden con esta regla. |

## Confirmado por la jugadora (2026-11-07)
- Solo tiene la guía de **2014**: es la referencia de las reglas caseras de su mesa.
- **Su mesa usa** (REGLA CASERA, origen: guía 2014; **sin implementar**): **Flanquear**, **Moral**, **Daño masivo**, **Marcar** y **Encaramarse a una criatura más grande** (esta última resuelve la decisión 1, "subirse a una criatura").
- **Configuración de mesa aprobada:** cada regla casera es un interruptor por campaña o encuentro. El motor la lee y el cerebro nunca la cambia.
- Las demás opciones de la tabla (encaramiento, iniciativa por bandos, factor de velocidad, abrirse paso, desarmar, echar a un lado, rodar, impactar a la cobertura, golpear a varias criaturas, heridas) se consideran **no usadas** salvo que la jugadora diga lo contrario.

Antes de implementar cada una: leer su texto completo en la guía, anotar qué partes son reglas 2014 que chocan con las de 2024 (por ejemplo, condiciones o acciones con otro nombre o efecto) y preguntar cómo las adapta su DM.

## Reglas opcionales de la guía 2014 relacionadas con el simulador


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

## Integración (configuración de mesa: DECISIÓN CONFIRMADA; **implementada** el 2026-11-07)

Estado: `Encounter.tableRules` existe con `diagonal` (`standard` / `alternating-1-2`), `movementThroughCreatures` (`houseSmallOrMedium`) y `areaTemplate` (`halfSquareDmg2014`: áreas de la guía 2014, confirmada por la jugadora el 2026-11-07). Las reglas de la guía 2014 que usa la mesa se añadirán como interruptores **cuando se implementen**; una regla sin implementar no tiene interruptor, para que no se pueda "activar" algo que no hace nada.

1. **Configuración de mesa** (`TableRules`) por encuentro o campaña, con cada regla casera u
   opcional como un interruptor con identificador, por ejemplo `diagonal: "alternating-1-2"` o
   `flanking: false`. El motor la lee; el cerebro nunca la cambia. Hoy solo existe
   `GridConfig.diagonalRule`.
2. Cada regla activada se anota aquí y en `RULES_VERIFICATION.md` como **REGLA CASERA** con su
   origen.
3. Si la jugadora tiene la **Guía del DM 2024**, sustituiría a esta como referencia de reglas
   opcionales, para no mezclar ediciones.

## Implementadas el 2026-11-07 (interruptores en `tableRules`; activas en `TABLE_RULES_OF_THE_PLAYERS_TABLE`)
| Regla | Interruptor | Cómo se aplica | Adaptación a 2024 / PROPUESTAS |
|---|---|---|---|
| **Flanquear** | `flanking` | Ventaja en ataques cuerpo a cuerpo si el atacante y un aliado son adyacentes al enemigo y la línea entre los centros de sus casillas cruza su espacio por lados (o esquinas) opuestos. Ambos deben verlo y no estar Incapacitados. Grandes o mayores: vale cualquier casilla de su espacio | "Aliado" = mismo bando |
| **Marcar** | `mark` | Todo ataque cuerpo a cuerpo marca a su objetivo hasta el final del siguiente turno del atacante. Contra el marcado, el ataque de oportunidad tiene Ventaja y no gasta la reacción; no si está Incapacitado; uno por turno | El ataque de oportunidad también marca |
| **Daño masivo** | `massiveDamage` | Daño de un único origen ≥ mitad de los PG máximos (tras defensas) y sigue en pie → salvación de CON CD 15 (los jugadores la anotan: `resolvePendingSave`); si falla, la app tira 1d10 en la tabla de shock | Confirmado: se aplica a todos. A 0 PG un monstruo muere (2024); "0 PG y estable" → personaje Estable, monstruo muerto. "Hasta el final de su siguiente turno": si ocurre durante su propio turno, dura también el siguiente |
| **Moral** | `morale` | Disparadores (cada uno una vez por combate): sorprendido; baja de la mitad de PG por primera vez; no puede dañar a nadie en su turno; grupo sorprendido; cae el líder; grupo reducido a la mitad sin que caiga ningún rival. Salvación de SAB CD 10 (el líder por el grupo; si no puede, el de mayor Carisma). Si falla: **huyendo** (solo Correr, Destrabarse y alejarse; no se acerca a ningún enemigo). `surrender` lo rinde; `resumeFighting` lo devuelve al combate (lo decide el DM) | Solo monstruos. Grupo = monstruos del mismo bando. El DM fija por bando la oposición abrumadora: ninguna, Desventaja o fallo automático. "No puede dañar": PROPUESTA de cálculo (decisión 64) |

Sin implementar: **Encaramarse a una criatura más grande** (necesita agarrar y pruebas enfrentadas).
