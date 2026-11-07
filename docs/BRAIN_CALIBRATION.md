# Calibración del cerebro táctico

## 1. Supuesto inicial de CA y PG por nivel (APROBADO por la jugadora el 2026-11-07)
Decisión 73: antes de observar nada, un monstruo supone la CA y los PG de un personaje según el
**nivel del grupo**. No hay en el SRD una tabla de "CA típica por nivel"; esta se **deriva** de
reglas del SRD 5.2.1 verificadas el 2026-11-07:

- **PG** ("Level 1 Hit Points by Class" y "Fixed Hit Points by Class"): en nivel 1, el máximo del
  dado de golpe más el modificador de CON; en cada nivel siguiente, el valor fijo más el modificador
  de CON.
- **CON y DES** ("Standard Array by Class", sin el aumento del trasfondo).
- **CA de nivel 1**: equipo inicial A de cada clase, tabla "Armor" (Cuero 11 + DES; Cuero tachonado
  12 + DES; Camisote de mallas 13 + DES (máx. 2); Cota de mallas 16; Escudo +2) y Defensa sin
  armadura (Bárbaro: 10 + DES + CON; Monje: 10 + DES + SAB).

| Clase | Dado | CON | PG nivel 1 | PG por nivel | Equipo A | CA nivel 1 |
|---|---|---|---|---|---|---|
| Bárbaro | d12 | 14 (+2) | 14 | 9 | sin armadura | 13 |
| Bardo | d8 | 12 (+1) | 9 | 6 | Cuero | 13 |
| Clérigo | d8 | 13 (+1) | 9 | 6 | Camisote + Escudo | 14 |
| Druida | d8 | 14 (+2) | 10 | 7 | Cuero + Escudo | 14 |
| Guerrero | d10 | 13 (+1) | 11 | 7 | Cota de mallas | 16 |
| Monje | d8 | 13 (+1) | 9 | 6 | sin armadura | 14 |
| Paladín | d10 | 13 (+1) | 11 | 7 | Cota de mallas + Escudo | 18 |
| Explorador | d10 | 13 (+1) | 11 | 7 | Cuero tachonado | 14 |
| Pícaro | d8 | 13 (+1) | 9 | 6 | Cuero | 13 |
| Hechicero | d6 | 14 (+2) | 8 | 6 | sin armadura | 11 |
| Brujo | d8 | 13 (+1) | 9 | 6 | Cuero | 13 |
| Mago | d6 | 13 (+1) | 7 | 5 | sin armadura | 11 |
| **Media (12 clases)** | | | **9,75** | **6,5** | | **13,7** (de 11 a 18) |

Supuesto aprobado:
- **PG máximos** ≈ 9,75 + 6,5 × (nivel − 1), redondeado. Por ejemplo: nivel 1 → 10, nivel 3 → 23,
  nivel 5 → 36.
- **CA:** el **intervalo 11–18** de la tabla, para promediar probabilidades, con valor central 14.
  Es igual en todos los niveles porque el SRD no da una progresión de CA por nivel (solo oro y
  objetos mágicos en "Starting Equipment at Higher Levels").

## 2. Escenarios de calibración (borrador para que la jugadora decida)
Cada escenario fija una situación y la decisión correcta según ella. Se convierten en pruebas
automáticas, y los pesos se ajustan hasta cumplirlas (decisión 71).

| # | Situación | Opciones |
|---|---|---|
| E1 | Goblin junto a Cata (cuerpo a cuerpo, amenaza inmediata). Caín a 40 pies, a la vista. El goblin está sano. | (a) Cimitarra a Cata y quedarse. (b) Cimitarra a Cata y Escapismo Ágil (Destrabarse) para alejarse. (c) Destrabarse, alejarse y disparar a Caín. (d) Disparar a Caín sin moverse (Desventaja por tener a Cata al lado). |
| E2 | Caín acaba de dejar Maltrecho a otro goblin y está a 50 pies, al alcance del arco. Cata a 20 pies del goblin. | (a) Disparar a Caín. (b) Acercarse a Cata y atacarla. (c) Ponerse a cubierto o lejos. |
| E3 | Goblin con 2 PG (Maltrecho), Cata a su lado. | (a) Atacar a Cata. (b) Destrabarse y huir. (c) Esquivar. |
| E4 | Dos goblins contra Cata sola; Caín lejos. | (a) Los dos rodean a Cata (flanqueo, Ventaja). (b) Uno va por Caín. |

Escenarios añadidos (2026-11-07):

| # | Situación | Opciones |
|---|---|---|
| E5 | Goblin con 3 PG, Cata y Caín pegados a él. | (a) Atacar (a Caín). (b) Destrabarse y alejarse 30 pies. (c) Esquivar. |
| E6 | Goblin sano arrinconado en una esquina, Cata pegada a él. | (a) Atacar a Cata. (b) Esquivar. (c) Destrabarse y moverse lo que pueda. |

"Destrabarse y huir" (E3, E5, E6) = Escapismo Ágil y mover 30 pies, **sin Correr** (respuesta de la jugadora).

### Decisiones de la jugadora (2026-11-07)
| # | Pragmático | Agresivo | Pacifista |
|---|---|---|---|
| E1 | (b) Cimitarra a Cata y alejarse | (a) Cimitarra a Cata y quedarse | (b) Cimitarra a Cata y alejarse |
| E2 | (a) Disparar a Caín | (a) Disparar a Caín | (c) Ponerse a salvo |
| E3 | (c) Esquivar | (a) Atacar a Cata | (b) Destrabarse y huir |
| E4 | (a) Rodear a Cata (flanqueo) | (a) Rodear a Cata (flanqueo) | (b) Ir por Caín |
| E5 | — | (a) Atacar igualmente | — |
| E6 | — | — | (b) Esquivar |

## 3. Rasgos que se miden (etapa 3, `tactical-brain/features.ts`)
Todos en unidades naturales, calculados sobre el estado creído (sin datos ocultos):

| Rasgo | Qué mide |
|---|---|
| `damageDealt` | Daño esperado que causa el plan (PG) |
| `threatReduction` | Daño esperado × parte del daño que se le ha **visto** causar a ese objetivo |
| `immediateThreatReduction` | Daño esperado × parte de la amenaza **inmediata** de ese objetivo (quién puede atacarle antes de su próximo turno) |
| `finishingChance` | min(1, daño esperado / PG estimados) por objetivo |
| `damageTaken` | Daño esperado que recibirá hasta su próximo turno (con los ataques de oportunidad que provoque) |
| `deathRisk` | min(1, daño recibido / PG actuales) |
| `adjacentEnemies` | Enemigos a 5 pies al terminar |
| `flankingPairs` | Flanqueos de su bando al terminar (regla casera) |
| `resourcesSpent` | Usos limitados gastados |
| `conditionsInflicted` | Condiciones nuevas en enemigos |

Supuestos para medir el riesgo (PROPUESTA, decisión 85; derivados del SRD): un enemigo del que no
se conocen ataques ataca con +(bonificador por competencia + 3) y 1d8 + 3 a 5 pies, con Velocidad 30.

## 4. Pesos calculados (2026-11-07, 15 decisiones) — PENDIENTES DE APROBACIÓN
Obtenidos con `npm run calibrate` a partir de las 15 decisiones y de los signos que exige la
descripción de cada personalidad (decisión 88). Guardados en `src/tactical-brain/personalities.json`;
`tests/calibration/decisions.test.ts` comprueba que cada personalidad elige lo decidido.

| Rasgo | Pragmático | Agresivo | Pacifista |
|---|---|---|---|
| damageDealt | 0 | 1,466 | −5,209 |
| threatReduction | 9,188 | 3,063 | −3,062 |
| immediateThreatReduction | 1,1 | 0 | 2,513 |
| finishingChance | 0 | 0,147 | −0,521 |
| damageTaken | −4,14 | 0 | −0,42 |
| deathRisk | 0 | 0 | −34,611 |
| adjacentEnemies | −1 | 1 | −7 |
| flankingPairs | 8 | 0 | −2 |
| resourcesSpent | 0 | 0 | 0 |
| conditionsInflicted | 0 | 0 | 0 |

Lectura:
- **Pragmático:** valora sobre todo golpear a quien ha demostrado ser peligroso, evita el daño y
  coopera (flanqueos).
- **Agresivo:** valora el daño y castigar a quien hace daño; le gusta estar pegado al enemigo; **hoy
  ignora el riesgo** (pesos 0) porque ningún caso le pide evitarlo (E5 pide lo contrario).
- **Pacifista:** evita causar daño y quedarse junto a enemigos, teme mucho morir, y aun así golpea a
  quien le amenaza de inmediato (defensa propia, E1).
- Recursos y condiciones siguen sin casos: pesos 0.
