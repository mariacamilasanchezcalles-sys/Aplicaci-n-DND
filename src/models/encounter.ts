import type { CreatureId, EncounterId } from "./ids";
import type { CombatantRecord } from "./creature";
import type { GridConfig } from "./position";

/**
 * Política de ocupación de casillas, como DATO del encuentro para que el
 * motor de reglas pueda validarla.
 *
 * - `one-creature-per-space`: el espacio de una criatura (su huella según el
 *   tamaño: Pequeña/Mediana 1x1, Grande 2x2, Enorme 3x3, Gargantuesca 4x4)
 *   no puede solaparse con el de otra. PENDIENTE: las criaturas Diminutas
 *   (el manual permite 4 por casilla) se tratan como 1 casilla exclusiva.
 */
export type OccupancyPolicy = "one-creature-per-space";

/**
 * Estado real y completo del combate. Es serializable a JSON (sin Map/Set).
 * Lo que cada monstruo CONOCE se modela aparte en el módulo `perception`.
 */
export interface Encounter {
  readonly id: EncounterId;
  readonly label: string;
  readonly grid: GridConfig;
  readonly occupancyPolicy: OccupancyPolicy;
  readonly combatants: Readonly<Record<string, CombatantRecord>>;
  /** PENDIENTE: reglas de iniciativa. Vacío hasta que se diseñen. */
  readonly initiativeOrder: readonly CreatureId[];
  readonly round: number;
}
