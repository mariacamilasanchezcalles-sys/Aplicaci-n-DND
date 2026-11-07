# Arquitectura

Dependencias permitidas (verificadas por `tests/architecture.test.ts`):

| Módulo | Importa | Función |
|---|---|---|
| `models` | nada | Tipos de datos (ids, acciones, criaturas, encuentro). Sin reglas. |
| `rules` | models | Motor de reglas: registro de encuentros/criaturas, ocupación por tamaño, distancia y movimiento (diagonal alternada), economía de acciones del turno, dados inyectables, resolución de ataques y daño. La generación de acciones legales sigue pendiente (ver `RULES_VERIFICATION.md`). |
| `perception` | models | Contrato de conocimiento por criatura. Sin implementación. |
| `tactical-brain` | models, perception | Contrato de entrada/salida y punto de integración vacío. |
| `persistence` | models | Interfaz guardar/cargar + serialización JSON + almacén en memoria. |
| `ui-bridge` | models, rules | Fachada mínima para que una interfaz hable con el núcleo. |
| `scenarios` | models | Datos de prueba provisionales (Goblin, Cata, Caín). |

Flujo previsto: `rules` genera acciones legales → `perception` construye lo que el monstruo conoce → `tactical-brain` evalúa solo opciones legales → `rules` resuelve. Nada de esto se conecta todavía.

Comandos: `npm run typecheck`, `npm run build`, `npm test`, `npm run verify`.
