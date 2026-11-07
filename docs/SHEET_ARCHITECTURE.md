# Arquitectura de fichas declarativas y acciones compuestas

> **Actualización 2026-11-07:** la jugadora aprobó los puntos 0 (personalidad en el encuentro), 2 (acciones estándar como capacidades integradas), 5 (costes al iniciar; `capability` gasta recursos pero no activación) y 8 (plan + reevaluación, con renuncia voluntaria a pasos restantes). Pasan de PROPUESTA a **DECISIÓN CONFIRMADA**; ver `PENDING_DECISIONS.md`.

Estado de cada punto, con las etiquetas del proyecto:
**DECISIÓN CONFIRMADA** (aprobada por la jugadora), **PROPUESTA** (pendiente de aprobación),
**PENDIENTE DE VALIDAR** (falta verificar en fuente oficial), **REGLA OFICIAL VERIFICADA**,
**REGLA CASERA** (regla de mesa).

Implementado en esta etapa: tipos (`src/models/sheet.ts`), esquema y validación
(`src/sheets/`), carga (`loadCreatureSheet`), puente con el modelo actual del motor
(`combatantFromSheet`), ficha del Goblin en `data/sheets/goblin-warrior.json` y una ficha
de prueba compleja en `tests/fixtures/sheets/test-brute.json`. **No implementado:** ejecutor
de capacidades, efectos, condiciones, reacciones ni cerebro.

---

## 0. Principios
- **DECISIÓN CONFIRMADA:** la ficha es un dato (JSON) que *declara* capacidades; el código las
  interpreta con manejadores generales por tipo de operación y de efecto. Nunca una función por
  monstruo. Una mecánica nueva se añade como manejador general reutilizable.
- **DECISIÓN CONFIRMADA:** el motor de reglas decide la legalidad; el cerebro solo evalúa
  opciones legales y todo se revalida antes de ejecutarse.
- **PROPUESTA:** vocabulario **cerrado**. Un tipo desconocido (`op`, `kind`, tipo de daño,
  condición…) es un **error** al cargar, nunca se ignora en silencio. Lo que existe en la ficha
  pero aún no tiene representación mecánica se declara explícitamente como `unmodeled` y
  produce un **aviso**.
- **PROPUESTA:** los tipos viven en `models` (los necesitará `rules` para interpretarlos); la
  validación y la carga, en el módulo nuevo `sheets` (solo importa `models`).

## 1. Estructura de una ficha (`CreatureSheet`)
Obligatorio (mínimo para combatir): `sheetFormat`, `id`, `label`, `source`, `size`, `armorClass`,
`hitPoints.average`, `speed.walk`. Todo lo demás es opcional: una ficha sencilla no lleva
estructuras vacías.

| Campo | Contenido |
|---|---|
| `sheetFormat` | Versión del formato (hoy 2; las fichas 1 se migran tal cual). Otra versión se rechaza con `unsupportedFormatVersion`. |
| `id`, `label`, `source` | Identificador (kebab-case), etiqueta para personas, origen: `official` / `homebrew` / `testFixture` + referencia. |
| `size`, `creatureType` | Tamaño (decide la huella, ver `rules/size.ts`) y tipo de criatura. |
| `armorClass`, `hitPoints` | CA; PG medios y fórmula opcional. |
| `speed` | `walk` y opcionales `burrow`, `climb`, `fly`, `swim`, `hover`. |
| `abilities`, `savingThrows`, `skills`, `senses` | Puntuaciones; bonificadores totales cuando difieren; sentidos en pies; Percepción pasiva. |
| `damageResistances`, `damageImmunities`, `damageVulnerabilities`, `conditionImmunities` | Listas de vocabulario cerrado. |
| `resources` | Usos limitados con su recuperación (`recharge` X–6, `shortRest`, `longRest`). |
| `traits` | Rasgos pasivos con `effects` (hoy solo `unmodeled`). |
| `attacks` | Ataques concretos (Cimitarra…). **No son acciones**: se usan con la acción de Atacar o desde una capacidad. |
| `capabilities` | Acciones, acciones adicionales y reacciones propias de la ficha (Multiataque, Escapismo Ágil, alientos…). |
| `spellcasting` | Aptitud, CD, bono de ataque, espacios y conjuros (referencias a un catálogo **que aún no existe**). |

- **PROPUESTA:** la **personalidad** y la **habilidad táctica** no van en la ficha; se asignan en
  el encuentro (`combatantFromSheet({ personality, … })`). Así un mismo Goblin puede ser agresivo
  o pragmático, y la personalidad es independiente de la habilidad, como pide la especificación.
- **PROPUESTA:** los PG provisionales de un escenario se aplican con `maxHitPointsOverride`; la
  ficha del Goblin Warrior conserva los **10 PG** oficiales y el escenario de prueba usa 7.

## 2. Tipos de acciones
Tres niveles (**DECISIÓN CONFIRMADA**, de la especificación):
1. **Operación atómica**: `attack` (una tirada con un ataque de la ficha), `standardAction`
   (realizar Correr, Destrabarse…), `effect` (efectos sin tirada de ataque, con salvación
   opcional), `castSpell`, `capability` (usar el cuerpo de otra capacidad) y `unmodeled`.
2. **Capacidad** (`Capability`): una entrada de la ficha con `activation` (`action`,
   `bonusAction`, `reaction`), costes, requisitos, desencadenante (solo reacciones) y un cuerpo
   que es un árbol de operaciones.
3. **Plan táctico**: lo construye el cerebro combinando movimiento y capacidades. No es dato de
   la ficha.

**PROPUESTA:** las acciones estándar (Atacar, Correr, Destrabarse…) y el ataque de oportunidad se
expresan con el **mismo formato**, como capacidades integradas del motor y no de cada ficha:
- Atacar = `activation: action`, cuerpo `repeat(n) { choice(ataques de la ficha) }`.
- Ataque de oportunidad = `activation: reaction`, `trigger: creatureLeavesReach`, cuerpo
  `choice(ataques cuerpo a cuerpo)`.

Así hay un único ejecutor para todo.

**Reacciones de ficha que el motor ejecuta hoy** (decisión 107): desencadenante `selfHitByAttack`
o `selfTakesDamage`, y cuerpo `attack` o `choice` de ataques (el objetivo lo elige quien reacciona).
Se ofrecen al terminar el ataque o el efecto que las provoca, con sus requisitos y costes, si la
criatura puede actuar y tiene la reacción disponible. Los demás desencadenantes
(`selfTargetedByAttack`, `creatureLeavesReach`, `creatureEntersArea`, `selfDropsToZeroHitPoints`,
`creatureTakesAction`) y otros cuerpos siguen como `reactionsNotModeled`.

## 3. Catálogo de efectos (`EffectSpec`)
`damage` (dados opcionales, bonificador, tipo, condición `attackRollHadAdvantage`), `heal`,
`tempHitPoints`, `applyCondition` (con `DurationSpec` y, desde el formato 2, `targetMaxSize`
opcional: "si es Grande o menor"), `removeCondition` y `forcedMovement` (empujar o atraer).

En un ataque (`onHit`), el motor ejecuta el daño y las condiciones con duración (p. ej. Agarrado con
CD de escape). Los ataques con otros efectos (empujón, PG temporales, efectos al fallar) se omiten de
la criatura como hueco (`attackEffectNotSupported`).

Duraciones: `instantaneous`, `rounds`, `minutes`, `untilTurnBoundary` (inicio o fin del turno de
la fuente o del objetivo) y `untilEscape` (con CD).

Áreas (`TargetingSpec.area`): `cone`, `cube`, `cylinder`, `emanation`, `line`, `sphere`.

- **PENDIENTE DE VALIDAR:** cotejar con SRD 5.2.1 las listas de tipos de daño (13), condiciones
  (15), formas de área y tipos de criatura. Están en el código como vocabulario cerrado.
- **PROPUESTA:** cada condición será un conjunto de efectos mecánicos en el motor (por ejemplo,
  Derribado: desventaja en sus ataques, cuesta movimiento levantarse…), no una etiqueta. No
  implementado.
- **PENDIENTE DE VALIDAR:** orden de aplicación de resistencia, vulnerabilidad e inmunidad en 2024.

## 4. Requisitos y condiciones de legalidad
Dos fuentes, sin solaparse (**PROPUESTA**):
- **Implícitos, siempre los aplica el motor**: tener libre la ranura de activación, alcance del
  ataque, objetivo válido, recursos suficientes, no estar Incapacitado para acciones y
  reacciones, etc. **La ficha no los repite.**
- **Declarados en la ficha** (`requirements`, `conditional.when`): predicados cerrados
  (`SheetPredicate`) como `resourceAvailable`, `selfHasCondition`, `selfLacksCondition`,
  `targetHasCondition`, `selfBloodied` (Maltrecha), `previousAttackHit`, más `not`, `all` y `any`.

## 5. Costes y recursos
- Activación (`action`, `bonusAction` o `reaction`): se paga **una sola vez** por capacidad,
  aunque contenga varias operaciones (**DECISIÓN CONFIRMADA**: el Multiataque no son dos acciones).
- `costs`: `resource` (por ejemplo, la carga del aliento) y `spellSlot` (nivel mínimo).
- **PROPUESTA:** los costes se pagan de forma atómica al **iniciar** la capacidad: todos o
  ninguno. Si después un paso queda sin opción legal, el coste no se devuelve.
- **PROPUESTA:** una operación `capability` (por ejemplo, un Multiataque que incluye otra
  capacidad) no paga la activación de la capacidad referida, pero **sí** sus costes de recursos.
- Recarga: al inicio del turno de la criatura se tira 1d6 con el dado virtual. **PENDIENTE DE
  VALIDAR** el texto exacto de Recharge en 2024.

## 6 y 7. Acciones compuestas y estructuras
| Estructura | Significado | Límites (PROPUESTA) |
|---|---|---|
| `sequence` | Ejecutar `steps` en orden. | 1–20 pasos |
| `choice` | Elegir una de `options` (la elección es del cerebro o de la persona). | 2–20 opciones |
| `repeat` | Ejecutar `body` `times` veces; cada repetición se elige y se valida por separado. | 1–10 |
| `optional` | Se puede omitir `body`. | — |
| `conditional` | Si `when` se cumple **en el estado actual**, `then`; si no, `otherwise` (opcional). | — |

Son herramientas de representación, **no reglas de D&D**. El validador comprueba además que la
profundidad no pase de 8, que no haya ciclos entre capacidades (directos ni indirectos) y que
todas las referencias existan.

Ejemplo (ficha de prueba `test-brute.json`, **no oficial**): "dos ataques, cada uno con Garra o
Roca; después, si el último impactó, puede añadir un Mordisco":
```json
{ "op": "sequence", "steps": [
  { "op": "repeat", "times": 2, "body": { "op": "choice", "options": [
    { "op": "attack", "attackRef": "claw" }, { "op": "attack", "attackRef": "rock" } ] } },
  { "op": "conditional", "when": { "kind": "previousAttackHit" },
    "then": { "op": "optional", "body": { "op": "attack", "attackRef": "bite" } } } ] }
```

## 8. Ejecución y reevaluación (DECISIÓN CONFIRMADA; implementada para ataques y acciones estándar en `rules/turnExecution.ts`)

Implementación: el `TurnState` es serializable y está separado del encuentro, porque la iniciativa aún no existe. Las órdenes son `move`, `beginCapability`, `chooseOption`, `forfeitRemaining` y `endTurn`. Las opciones llevan una clave de un solo uso (`serial:índice`): una clave antigua se rechaza (`staleOption`), así que nada se ejecuta dos veces. Una capacidad sin ninguna operación legal al empezar no se paga (`noLegalOptions`). Un ataque cuyos efectos el motor no sabe aplicar no se incluye en la criatura. Las ramas con acciones estándar no modeladas, como Esconderse, no se ofrecen.

El diseño original sigue a continuación:
Responde en parte a la decisión pendiente 12 (¿pasos sueltos o turnos completos?): **se planea el
turno completo y se ejecuta paso a paso**.

1. `beginCapability(estado, actor, capacidad)`: el motor valida la activación, los requisitos y
   los costes, los paga y crea una **ejecución en curso** dentro del estado del encuentro. Es
   serializable, así que se puede guardar a mitad de turno. Contiene un cursor sobre el árbol y
   el historial de lo resuelto (por ejemplo, impacto o fallo, para `previousAttackHit`).
2. `pendingOptions(estado, ejecución)`: el motor despliega el cursor **con el estado actual** y
   devuelve las operaciones atómicas legales ahora mismo, ya con objetivos concretos. `choice`
   aporta una opción por rama, `optional` añade "omitir", `conditional` se evalúa en ese momento
   y `repeat` lleva su contador.
3. El cerebro (o la persona) elige una opción **legal**. El cerebro puede simular el resto del
   árbol con valores esperados, nunca con los dados reales.
4. `resolveOperation(estado, ejecución, opción, dados)`: el motor **revalida**, resuelve, emite
   eventos (que pueden disparar reacciones y la interrupción correspondiente), actualiza el estado
   y avanza el cursor.
5. Se vuelve al paso 2 con el estado nuevo; el cerebro puede cambiar su plan sin salirse de la
   capacidad original.

Invariantes:
- La activación y los costes se pagan una sola vez.
- Cada operación tiene un identificador de instancia (ejecución + ruta + iteración), así que
  **no se ejecuta dos veces**.
- Nunca se resuelve algo que no supere la revalidación.
- Si un paso obligatorio no tiene ninguna opción legal (por ejemplo, el objetivo cayó), ese paso
  se pierde y queda registrado.

Pendiente:
- **VERIFICADO (2026-11-07):** el Multiataque se hace como parte de la acción de Atacar (SRD 5.2.1), así que se puede mover entre sus ataques ("Moving between Attacks"). Se marca con `takenAs: "attack"`. En las demás capacidades no se mueve entre operaciones.
- **PROPUESTA pendiente de aprobar:** si se puede renunciar voluntariamente a los pasos
  restantes de una capacidad.

## 9. Validación de fichas (implementado)
`loadCreatureSheet(texto | valor)` nunca lanza una excepción. Devuelve `{ valid, sheet | errors,
warnings }` con **códigos** (`SheetIssueCode`) y la **ruta** del dato (por ejemplo,
`capabilities[0].body.steps[1].attackRef`):
- **Estructura:** tipos, rangos, vocabulario cerrado, identificadores en kebab-case, campos
  obligatorios y **campos desconocidos** (detecta erratas como `armourClass`).
- **Coherencia:**
  - identificadores duplicados;
  - referencias a ataques, capacidades, recursos y conjuros;
  - ciclos entre capacidades y profundidad máxima;
  - reacción ⇔ desencadenante;
  - alcances coherentes (cuerpo a cuerpo sin alcance largo; largo ≥ normal);
  - `dc: "spellSaveDc"` exige `spellcasting.saveDc`.
- **Avisos:** `unmodeledMechanic` y `spellCatalogMissing`.

El esquema se escribe con combinadores propios (`src/sheets/schema.ts`), sin dependencias. Cada
esquema se declara con el tipo de `models` (`Schema<CreatureSheet>`): si se desalinean, **falla la
compilación**.

## 10. Compatibilidad futura
- Mecánica nueva: se añade un miembro a la unión (`Operation`, `EffectSpec`, `SheetPredicate`,
  `TriggerSpec`) y su esquema. El compilador obliga a tratarla en todos los `switch`.
- Las fichas antiguas siguen siendo válidas mientras no cambie `sheetFormat`. Un cambio
  incompatible sube la versión y requiere un migrador explícito.
- Hasta que exista el ejecutor, `combatantFromSheet` convierte la ficha al modelo que el motor ya
  valida (ataques y acciones adicionales simples). Todo lo demás lo devuelve como **huecos**
  (`gaps`) con un motivo, sin aproximarlo. En particular, el Multiataque **no** se convierte en
  `attacksPerAttackAction`.
- Comprobado: la ficha JSON del Goblin produce exactamente la criatura del escenario provisional
  (`tests/sheets.test.ts`).
