# Simulador táctico de combate de D&D

Aplicación (en fase inicial) para simular combates de Dungeons & Dragons 5e (edición 2024) con monstruos que deciden de forma algorítmica. No usa IA generativa. Objetivo: app Android instalable (APK), sin conexión a internet, en TypeScript.

> **Estado:** estructura base y motor de reglas parcial. El cerebro táctico, la percepción y la interfaz son solo contratos; no hay pantallas.

## Requisitos
- Node.js 22 o superior (probado con 22.23)
- npm 10 o superior

## Comandos
```bash
npm ci            # instalar dependencias exactas
npm run verify    # typecheck + build + pruebas
npm run typecheck
npm run build
npm test
```

## Estructura
```
src/
  models/          tipos de datos (ids, acciones, criaturas, encuentro); sin reglas
  rules/           motor de reglas: colocación, ocupación, economía de acciones
  tactical-brain/  contrato de entrada/salida (sin algoritmo)
  perception/      contrato de conocimiento por criatura (sin implementación)
  persistence/     interfaz de guardado/carga y serialización JSON
  ui-bridge/       fachada mínima entre una interfaz y el núcleo
  scenarios/       datos de prueba provisionales (Goblin, Cata, Caín)
  sheets/          fichas declarativas: validación y carga
data/sheets/       fichas de criaturas en JSON
tests/             pruebas automatizadas (Vitest)
docs/              arquitectura, reglas verificadas y decisiones pendientes
```

Cada módulo solo puede importar los permitidos en `docs/ARCHITECTURE.md`; `tests/architecture.test.ts` lo comprueba.

## Documentación
- [`CLAUDE.md`](CLAUDE.md): reglas de trabajo, arquitectura y decisiones para quien continúe el desarrollo (incluido Claude Code).
- [`docs/STATUS.md`](docs/STATUS.md): estado actual y siguiente etapa.
- [`docs/PROJECT_SPEC.md`](docs/PROJECT_SPEC.md): especificación ampliada vigente.
- [`docs/SHEET_ARCHITECTURE.md`](docs/SHEET_ARCHITECTURE.md): fichas declarativas y acciones compuestas.
- [`docs/PROJECT_BRIEF.md`](docs/PROJECT_BRIEF.md): brief original.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): módulos y dependencias.
- [`docs/RULES_VERIFICATION.md`](docs/RULES_VERIFICATION.md): reglas 2024 verificadas, implementadas y pendientes.
- [`docs/PENDING_DECISIONS.md`](docs/PENDING_DECISIONS.md): decisiones que requieren aprobación.
- [`docs/UI_REQUIREMENTS.md`](docs/UI_REQUIREMENTS.md): requisitos de interfaz registrados (aún sin implementar).

## Atribución
Parte de las reglas se basa en el System Reference Document 5.2.1 de Wizards of the Coast, disponible bajo licencia [Creative Commons Attribution 4.0 (CC-BY-4.0)](https://creativecommons.org/licenses/by/4.0/). Este proyecto no está afiliado a Wizards of the Coast.

Los datos del escenario de prueba (Goblin, Cata, Caín) son provisionales y no son estadísticas oficiales.
