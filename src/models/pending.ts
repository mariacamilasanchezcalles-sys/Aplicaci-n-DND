/**
 * Se lanza cuando se invoca una parte que está reservada pero cuyo diseño
 * todavía no ha sido aprobado. Ver docs/PENDING_DECISIONS.md.
 */
export class PendingImplementationError extends Error {
  readonly pendingDecision: string;

  constructor(pendingDecision: string) {
    super(`Pendiente de diseño: ${pendingDecision}`);
    this.name = "PendingImplementationError";
    this.pendingDecision = pendingDecision;
  }
}
