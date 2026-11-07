# Requisitos de interfaz (NO implementados)

Hoy el proyecto solo tiene la fachada mínima `ui-bridge`. No existe código de pantallas.

## Primera etapa acordada
Formato: **prototipo para probar en el celular** (aprobar diseño y manejo táctil antes de pulirlo). Pantallas:
1. **Mapa de combate** (la más importante).
2. **Panel de turno:** elegir movimiento, acción y acción adicional de una criatura; el motor de reglas (`validateTurnPlan`) dice si el turno es legal y por qué no. La interfaz no contiene reglas.
3. **Lista de encuentros:** guardar y abrir encuentros manualmente (usa la interfaz de `persistence`).

Fuera de esta etapa (no se pidió): registro de criaturas con formulario, editor de personajes, importación de fichas, pantallas del cerebro táctico.

## Mapa de combate
- **Área visible:** 5 columnas x 9 filas a zoom normal, pensada para pantalla de celular en vertical.
- **Mapa completo:** 15 columnas x 21 filas (`GridConfig.dimensions`). Es dato del núcleo.
- Navegación con los dedos como una app de mapas: arrastrar para desplazarse por el mapa.
- Zoom: se puede hacer más pequeña o más grande (pellizcar).
- El área visible, el desplazamiento y el zoom son estado de la interfaz y **no** pertenecen al núcleo de reglas.
- Coordenadas desde 0. Las criaturas Grandes o mayores ocupan varias casillas (la posición es la esquina superior izquierda).
- Ideas sin decidir: límites de zoom, si el desplazamiento se limita al borde del mapa, tamaño mínimo táctil de cada casilla, cómo mostrar el coste de diagonales (1, 2, 1, 2) al planear un movimiento.

## Restricciones
- Texto en español. Nombres visibles = etiquetas (`label`); la interfaz nunca interpreta texto libre.
- Hasta que exista el cerebro táctico, todas las criaturas se controlan a mano.
- La interfaz habla con el núcleo solo a través de `ui-bridge` (ampliarlo si hace falta). No importa `rules` directamente ni duplica reglas.
