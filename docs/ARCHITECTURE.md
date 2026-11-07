# Arquitectura

Dependencias permitidas (verificadas por `tests/architecture.test.ts`):

| Módulo | Importa | Función |
|---|---|---|
| `models` | nada | Tipos de datos (ids, acciones, criaturas, encuentro). Sin reglas. |
| `rules` | models | Motor de reglas (incluye el ejecutor de turno paso a paso `turnExecution.ts`, las comprobaciones compartidas `turnSteps.ts`, los recursos y la Recarga `resources.ts`, las defensas contra el daño `damage.ts`, áreas, efectos, condiciones, 0 PG, iniciativa y las reglas caseras `houseRules.ts`): registro de encuentros/criaturas, ocupación por tamaño, distancia y movimiento (diagonal alternada), economía de acciones del turno, dados inyectables, resolución de ataques y daño. La generación de acciones legales sigue pendiente (ver `RULES_VERIFICATION.md`). |
| `perception` | models, rules | Memoria compartida por bando y `KnowledgeView` (percibido, recordado, estimado). Usa la visibilidad del motor. |
| `tactical-brain` | models, perception | Contrato de entrada/salida y punto de integración vacío. |
| `persistence` | models | Interfaz guardar/cargar + serialización JSON + almacén en memoria. |
| `ui-bridge` | models, rules, persistence, scenarios | Fachada para la interfaz: vistas de mapa y menú de turno, validación de turno, escenario provisional y biblioteca de encuentros sobre `EncounterStore`. |
| `scenarios` | models | Datos de prueba provisionales (Goblin, Cata, Caín). |
| `sheets` | models | Fichas declarativas: esquema con combinadores propios, validación (estructura y coherencia), carga desde JSON y puente temporal `combatantFromSheet`. Diseño: `SHEET_ARCHITECTURE.md`. |

Datos: `data/sheets/*.json` (fichas). Los tipos de la ficha están en `models/sheet.ts` porque `rules` los interpretará.

Flujo previsto: `sheets` carga y valida fichas → `rules` genera acciones legales → `perception` construye lo que el monstruo conoce → `tactical-brain` evalúa solo opciones legales → `rules` resuelve. Nada de esto se conecta todavía.

Comandos: `npm run typecheck`, `npm run build`, `npm test`, `npm run verify`.
