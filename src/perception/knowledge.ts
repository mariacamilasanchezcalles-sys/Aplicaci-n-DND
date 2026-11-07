import type { CreatureId, Encounter, GridPosition } from "../models";

/**
 * Lo que un observador sabe de otra criatura. Es distinto del estado real
 * del combate (`Encounter`). PENDIENTE: qué se percibe, memoria, ocultamiento.
 */
export interface KnownCreature {
  readonly creatureId: CreatureId;
  readonly lastKnownPosition: GridPosition | null;
}

export interface KnowledgeView {
  readonly observerId: CreatureId;
  readonly knownCreatures: readonly KnownCreature[];
}

/** Punto de integración. Sin implementación hasta que se diseñe la percepción. */
export interface PerceptionProvider {
  buildKnowledge(encounter: Encounter, observerId: CreatureId): KnowledgeView;
}
