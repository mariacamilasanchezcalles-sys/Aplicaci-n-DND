import type { GridPosition, StandardActionType, TurnPlan, Encounter } from "../models";
import { footprintDistanceSquares } from "./distance";
import { stepCost } from "./movement";
import { validateGridSquare, validatePassage, validatePlacement } from "./placement";
import type { PlacementReason } from "./placement";

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
  const { feetPerSquare, diagonalRule } = encounter.grid;
  const speedFeet = definition.stats.speedFeet;

  let position: GridPosition = actor.state.position;
  let diagonalCount = 0;
  let spentFeet = 0;
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
        if (step.path.length === 0) return illegal("emptyPath", stepIndex);

        let from = position;
        let squares = 0;
        let count = diagonalCount;
        for (const square of step.path) {
          const bounds = validateGridSquare(encounter, square);
          if (!bounds.valid) return illegal("invalidSquare", stepIndex, bounds.reason);

          const move = stepCost(from, square, diagonalRule, count);
          if (!move.valid) return illegal("notAdjacent", stepIndex);

          // Se puede pasar (y detenerse a actuar) en casillas ocupadas por
          // criaturas Diminutas, Pequeñas o Medianas, a coste normal. Las
          // Grandes o mayores bloquean. La ocupación solo se exige al final
          // del turno (ver más abajo).
          const passage = validatePassage(encounter, square, definition.size, {
            ignoreCreatureId: plan.actorId,
          });
          if (!passage.valid) return illegal("invalidSquare", stepIndex, passage.reason);

          squares += move.cost;
          count = move.diagonalCount;
          from = square;
        }

        const newSpent = spentFeet + squares * feetPerSquare;
        if (budgetFeet !== null && newSpent > budgetFeet) {
          return illegal("movementExceedsSpeed", stepIndex);
        }
        spentFeet = newSpent;
        diagonalCount = count;
        position = from;
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
          const attack = definition.attacks.find((a) => a.id === use.attackId);
          if (!attack) return illegal("unknownAttack", stepIndex);

          const target = encounter.combatants[use.targetId];
          if (!target) return illegal("unknownTarget", stepIndex);
          if (use.targetId === plan.actorId) return illegal("invalidTarget", stepIndex);

          const distanceFeet =
            footprintDistanceSquares(
              position,
              definition.size,
              target.state.position,
              target.definition.size,
              diagonalRule,
            ) * feetPerSquare;
          const maxFeet =
            attack.mode === "melee"
              ? attack.rangeFeet.normal
              : (attack.rangeFeet.long ?? attack.rangeFeet.normal);
          if (distanceFeet > maxFeet) return illegal("targetOutOfRange", stepIndex);
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
  const finalPlacement = validatePlacement(encounter, position, definition.size, {
    ignoreCreatureId: plan.actorId,
  });
  if (!finalPlacement.valid) {
    return illegal("invalidSquare", lastMovementStepIndex, finalPlacement.reason);
  }

  return { legal: true };
}
