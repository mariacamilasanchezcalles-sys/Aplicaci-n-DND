# Verificación de reglas (D&D 5e, edición 2024)

Edición objetivo: **D&D 2024**. No se usan estadísticas ni mecánicas de 2014.

## Fuentes oficiales consultadas
- SRD 5.2.1 (Wizards of the Coast, CC-BY-4.0), PDF oficial enlazado desde <https://www.dndbeyond.com/srd>.
- Basic Rules 2024 en D&D Beyond: [Rules Glossary](https://www.dndbeyond.com/sources/dnd/br-2024/rules-glossary) y [Playing the Game](https://www.dndbeyond.com/sources/dnd/br-2024/playing-the-game).
- Ficha oficial del Goblin Warrior (Monster Manual 2024, p. 142): <https://www.dndbeyond.com/monsters/5195050-goblin-warrior>.

Limitaciones: el texto se extrajo con una herramienta de lectura web, no leyendo los PDF directamente, y las dos páginas de las Basic Rules son más largas que lo que la herramienta devuelve (quedaron sin leer los últimos ~300 y ~14 000 caracteres). Conviene una revisión humana puntual antes de dar estas reglas por definitivas. El Goblin Warrior no está en el SRD (solo Goblin Boss y Goblin Minion); su ficha se verificó en D&D Beyond.

## Reglas verificadas e implementadas
| Regla | Fuente | Dónde se aplica |
|---|---|---|
| Acciones: Attack, Dash, Disengage, Dodge, Help, Hide, Influence, Magic, Ready, Search, Study, Utilize | SRD, tabla de acciones | `StandardActionType` |
| En tu turno: moverte hasta tu Velocidad y realizar **una** acción; el movimiento se puede dividir antes y después de la acción | SRD, "Your Turn" | `multipleActions`, movimiento y acción en ranuras distintas |
| Acción adicional: solo si una regla la concede; **una** por turno | SRD / Glosario | `bonusActionNotGranted`, `multipleBonusActions` |
| La acción de Atacar permite **un** ataque; más ataques los dan rasgos o la ficha | Glosario, "Attack [Action]" | `attacksPerAttackAction` (por defecto 1) |
| **Dash**: movimiento extra igual a la Velocidad durante el resto del turno | SRD / Glosario | Aumenta el presupuesto de movimiento |
| **Disengage**: el movimiento no provoca ataques de oportunidad ese turno | SRD / Glosario | Aceptada como acción; sin efecto aún (no hay ataques de oportunidad) |
| Casilla = 5 pies; Velocidad / 5 = casillas | SRD, "Playing on a Grid" | `feetPerSquare`, presupuesto de movimiento |
| **Tamaño y espacio**: Pequeña y Mediana 1x1; Grande 2x2; Enorme 3x3; Gargantuesca 4x4; 4 Diminutas por casilla | SRD, "Creature Size and Space" | `FOOTPRINT_SIDE` (Diminuta: ver pendientes) |
| No se puede terminar el movimiento voluntariamente en un espacio ocupado | SRD, "Moving around Other Creatures" | `validatePlacement` en cada paso |
| Alcance cuerpo a cuerpo estándar: 5 pies | Basic Rules, "Reach" | `AttackDefinition.rangeFeet.normal` (melee) |
| Ataque a distancia: desventaja más allá del alcance normal; no se puede atacar más allá del largo | Basic Rules, "Ranged Attacks" | Legalidad: hasta el alcance largo. La desventaja aún no se calcula sola |
| Ventaja = dos d20, el mayor; desventaja = el menor; no se acumulan; se cancelan entre sí | Glosario | `combineRollModes`, `resolveAttack` |
| 20 natural: impacta siempre y es crítico; 1 natural: falla siempre | Basic Rules, "Rolling 20 or 1" | `resolveAttack` |
| Crítico: todos los dados de daño se tiran dos veces; los modificadores se suman una vez | Basic Rules, "Critical Hits" | `resolveAttack` |
| Los PG no bajan de 0 | Glosario, "Hit Points" | `applyDamage` |
| Goblin Warrior: Pequeño, CA 15, **10 PG**, Velocidad 30, Cimitarra +4 (1d6+2 cortante, +1d4 con ventaja), Arco corto +4 80/320 (1d6+2 perforante, +1d4 con ventaja), sin Multiattack | Ficha MM 2024 | ataques, tamaño y daño condicionado de `goblin` |
| Nimble Escape: acción adicional; el goblin ejecuta Destrabarse o Esconderse | Ficha MM 2024 | `BonusActionDefinition` (no es un rasgo) |

## Decisiones tuyas aplicadas (no son reglas del manual)
- **Diagonal alternada (1, 2, 1, 2).** La regla base verificada (SRD 5.2.1 y Basic Rules 2024) dice que entrar en una casilla adyacente, también en diagonal, cuesta 1 casilla. La alternancia es una regla de mesa impuesta por el DM de la jugadora y confirmada para el proyecto; está identificada como `DiagonalRule = "alternating-1-2"` para poder cambiarla.
- **Mapa de 15 columnas x 21 filas**; el área visible en pantalla es de 5 x 9 (requisito de interfaz).
- **Atravesar casillas ocupadas (regla de mesa):** se puede pasar, y también detenerse a actuar, en una casilla ocupada por una criatura Diminuta, Pequeña o Mediana (cuenta el tamaño de la criatura atravesada), a coste normal de movimiento: no es terreno difícil. Las criaturas Grandes o mayores bloquean el paso. El turno no puede terminar en un espacio ocupado. Difiere del manual, que solo permite atravesar a criaturas no hostiles, Diminutas o dos tamaños mayores o menores, y trata el espacio de otra criatura como terreno difícil. Subirse a una criatura no está modelado.
- Coordenadas desde 0; mapa con dimensiones explícitas; el espacio de una criatura no se solapa con el de otra al detenerse.
- Los **7 PG** del goblin son un dato provisional del escenario de prueba; la ficha oficial dice 10. Están en `PROVISIONAL_FIELDS`.
- La aleatoriedad existe solo al tirar dados (`RandomSource`); todo lo demás es determinista.
- Escapismo Ágil se trata como acción adicional; en un turno la criatura puede mover, hacer una acción y una adicional.

## Suposiciones de implementación (requieren tu confirmación)
1. **Cuenta de diagonales:** continúa entre pasos rectos y entre pasos de movimiento del mismo turno, y vuelve a cero al empezar cada turno (cada plan validado es un turno).
2. **Medir con criaturas de varias casillas:** se usa la distancia entre las casillas más cercanas de cada espacio.
3. **Ancla de la posición:** para criaturas grandes, la posición es la esquina superior izquierda de su espacio.
4. **Quién bloquea:** cuenta el tamaño de la criatura atravesada, no el de quien se mueve (una criatura Grande puede atravesar a una Pequeña, pero no a otra Grande).
5. **Atacarse a uno mismo:** se rechaza (decisión de modelado, no regla verificada).
6. **Sin Velocidad registrada** (registro simplificado de personajes): no se valida el presupuesto de movimiento.
7. **Impacto:** se decide con "total >= CA". No pude confirmar el texto exacto en las páginas leídas.

## Verificado pero NO implementado
- **Ataques de oportunidad** (reacción cuando una criatura sale de tu alcance) y su evitación con Destrabarse.
- **Hide**: tirada de Sigilo DC 15, muy oscurecido o cobertura de tres cuartos/total y fuera de la línea de visión de todo enemigo; al ocultarse eres Invisible. El motor acepta *tomar* la acción; no la resuelve.
- **Invisible**: tiradas contra ti con desventaja, tuyas con ventaja. No hay estado de condiciones todavía.
- **Ataque a distancia con un enemigo a menos de 5 pies que te ve y no está Incapacitado:** desventaja. Requiere visibilidad y condiciones.
- **Terreno difícil** del mapa (cada casilla cuesta el doble) y subirse a una criatura.
- **Llegar a 0 PG:** salvaciones de muerte de personajes jugadores; qué ocurre con monstruos no apareció en el texto leído.
- **Iniciativa**: prueba de Destreza, sorpresa, empates.

## Pendiente de verificar
- Texto general de Extra Attack y Multiattack.
- Acciones Help, Influence, Magic, Ready, Search, Study, Utilize: el motor las rechaza con `actionNotYetModeled` porque faltan datos (conjuros, disparador de Ready, objetivos).

## Vocabulario de las fichas (PENDIENTE DE VALIDAR)
Las fichas declarativas (`src/models/sheet.ts`) usan listas cerradas que deben cotejarse con SRD 5.2.1: 13 tipos de daño, 15 condiciones, 14 tipos de criatura, 6 formas de área, 18 habilidades y la mecánica de Recharge. Se escribieron a partir de la especificación de la jugadora y del conocimiento general de las reglas 2024, **sin** leer la fuente en esta etapa.

La ficha `data/sheets/goblin-warrior.json` contiene solo datos ya verificados en la tabla de arriba (tamaño, CA, 10 PG, Velocidad, ataques y Nimble Escape). Se omitieron a propósito las puntuaciones de característica, el tipo de criatura y la fórmula de PG porque no se verificaron.
