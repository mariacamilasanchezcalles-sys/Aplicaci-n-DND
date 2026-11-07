import type { StandardActionType, TurnPlan, Encounter } from "../models";
import { validatePlacement } from "./placement";
import type { PlacementReason } from "./placement";
import { advanceMovement, checkAttackTarget } from "./turnSteps";
import type { MovementProgress } from "./turnSteps";

export type IllegalReason =
  | "unknownActor"
  | "multipleActions"
  | "multipleBonusActions"
  | "bonusActionNotGranted"
  | "attackCountInvalid"
  | "unknownAttack"
  | "unknownTarget"
  | "invalidTarget"
  | "targetOutOfRange"
  | "emptyPath"
  | "notAdjacent"
  | "invalidSquare"
  | "movementExceedsSpeed"
  | "actionNotYetModeled";

export type LegalityResult =
  | { readonly legal: true }
  | {
      readonly legal: false;
      readonly reasonCode: IllegalReason;
      /** Índice del paso del plan que falla, o null si es del plan completo. */
      readonly stepIndex: number | null;
      readonly placementReason?: PlacementReason;
    };

/**
 * Acciones cuya definición está completa con solo su tipo (verificadas en
 * SRD 5.2.1 / Basic Rules 2024). El resto necesita datos que aún no se
 * modelan (conjuros, disparador de Ready, pruebas) y se rechaza con
 * `actionNotYetModeled` en lugar de aceptarse a ciegas.
 */
const FULLY_MODELED_ACTIONS: ReadonlySet<StandardActionType> = new Set([
  "attack",
  "dash",
  "disengage",
  "dodge",
  "hide",
]);

function illegal(
  reasonCode: IllegalReason,
  stepIndex: number | null,
  placementReason?: PlacementReason,
): LegalityResult {
  return placementReason === undefined
    ? { legal: false, reasonCode, stepIndex }
    : { legal: false, reasonCode, stepIndex, placementReason };
}

/**
 * Valida un TURNO COMPLETO en orden (reglas verificadas, ver
 * docs/RULES_VERIFICATION.md). El plan empieza con la cuenta de diagonales y
 * el movimiento gastado en cero, y la posición real de la criatura.
 *
 * - Máximo una acción y una acción adicional; la adicional debe estar entre
 *   las `bonusActions` de la criatura.
 * - Movimiento: pasos a casillas adyacentes; coste según la convención
 *   diagonal del encuentro (la cuenta de diagonales sigue entre pasos del
 *   mismo turno); no supera la Velocidad (más la Velocidad de cada Correr
 *   ya realizado); su espacio no se sale del mapa en ningún paso. Regla de
 *   mesa: se puede pasar, detenerse y actuar en casillas ocupadas por
 *   criaturas Diminutas, Pequeñas o Medianas (coste normal, sin terreno
 *   difícil); las Grandes o mayores bloquean; el turno no puede TERMINAR en un
 *   espacio ocupado.
 * - Ataque: ataques conocidos, objetivo existente y distinto del atacante,
 *   dentro de alcance (cuerpo a cuerpo) o de alcance largo (a distancia)
 *   desde la posición que tiene en ese punto del turno.
 *
 * Si la criatura no tiene Velocidad registrada, no se valida el presupuesto
 * de movimiento. NO valida: ventaja/desventaja (alcance largo, enemigo
 * adyacente), visibilidad ni ataques de oportunidad.
 */
export function validateTurnPlan(encounter: Encounter, plan: TurnPlan): LegalityResult {
  const actor = encounter.combatants[plan.actorId];
  if (!actor) return illegal("unknownActor", null);

  const { definition } = actor;
  const speedFeet = definition.stats.speedFeet;

  let progress: MovementProgress = { position: actor.state.position, diagonalCount: 0, spentFeet: 0 };
  let budgetFeet: number | null = speedFeet ?? null;
  let actionsUsed = 0;
  let bonusActionsUsed = 0;
  let lastMovementStepIndex: number | null = null;

  const grantDash = (): void => {
    if (budgetFeet !== null && speedFeet !== undefined) budgetFeet += speedFeet;
  };

  for (const [stepIndex, step] of plan.steps.entries()) {
    switch (step.slot) {
      case "movement": {
        // Regla casera: se puede pasar (y detenerse a actuar) en casillas
        // ocupadas por criaturas Diminutas, Pequeñas o Medianas; la
        // ocupación solo se exige al final del turno (ver más abajo).
        const moved = advanceMovement(encounter, actor, progress, step.path, budgetFeet);
        if (!moved.ok) return illegal(moved.reasonCode, stepIndex, moved.placementReason);
        progress = moved.progress;
        lastMovementStepIndex = stepIndex;
        break;
      }

      case "action": {
        if (++actionsUsed > 1) return illegal("multipleActions", stepIndex);
        if (!FULLY_MODELED_ACTIONS.has(step.actionType)) {
          return illegal("actionNotYetModeled", stepIndex);
        }
        if (step.actionType === "dash") {
          grantDash();
          break;
        }
        if (step.actionType !== "attack") break;

        const maxAttacks = definition.stats.attacksPerAttackAction ?? 1;
        if (step.attacks.length < 1 || step.attacks.length > maxAttacks) {
          return illegal("attackCountInvalid", stepIndex);
        }
        for (const use of step.attacks) {
          const check = checkAttackTarget(encounter, actor, progress.position, use.attackId, use.targetId);
          if (!check.ok) return illegal(check.reasonCode, stepIndex);
        }
        break;
      }

      case "bonusAction": {
        if (++bonusActionsUsed > 1) return illegal("multipleBonusActions", stepIndex);
        const granted = definition.bonusActions.some(
          (bonus) =>
            bonus.id === step.bonusActionId && bonus.allowedActions.includes(step.actionType),
        );
        if (!granted) return illegal("bonusActionNotGranted", stepIndex);
        if (!FULLY_MODELED_ACTIONS.has(step.actionType)) {
          return illegal("actionNotYetModeled", stepIndex);
        }
        if (step.actionType === "dash") grantDash();
        break;
      }
    }
  }

  // El turno no puede terminar en un espacio ocupado por otra criatura.
  const finalPlacement = validatePlacement(encounter, progress.position, definition.size, {
    ignoreCreatureId: plan.actorId,
  });
  if (!finalPlacement.valid) {
    return illegal("invalidSquare", lastMovementStepIndex, finalPlacement.reason);
  }

  return { legal: true };
}
