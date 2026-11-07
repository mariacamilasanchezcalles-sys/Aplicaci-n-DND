import type { AttackId, CreatureId, Encounter, GridPosition } from "../models";
import type { AreaPlacement, CapabilitySource, EffectInput, ExecutableStandardAction, TurnCommand, TurnState } from "../rules";
import type { EffectTargetOdds, EstimatedAttackOdds, SimulationPort } from "./simulation";

/**
 * PLAN DE TURNO: secuencia de intenciones que el cerebro compara completa
 * (DECISIÓN CONFIRMADA: "comparar planes completos"). Cada paso se traduce
 * a una orden del ejecutor buscando la opción legal que coincide; si no
 * existe, el plan no es legal en ese estado.
 */
export type PlanStep =
  | { readonly kind: "move"; readonly path: readonly GridPosition[] }
  | { readonly kind: "begin"; readonly source: CapabilitySource }
  | { readonly kind: "attack"; readonly attackId: AttackId; readonly targetId: CreatureId }
  | { readonly kind: "standardAction"; readonly action: ExecutableStandardAction }
  /** Operación de efecto de la capacidad en curso, con sus objetivos o su colocación. */
  | {
      readonly kind: "effect";
      readonly targetIds?: readonly CreatureId[];
      readonly placement?: AreaPlacement;
    }
  | { readonly kind: "finish" }
  | { readonly kind: "end" };

export interface Plan {
  readonly steps: readonly PlanStep[];
}

export interface PlannedAttack {
  readonly attackId: AttackId;
  readonly targetId: CreatureId;
  readonly odds: EstimatedAttackOdds;
}

export interface PlannedEffect {
  readonly targets: readonly EffectTargetOdds[];
}

export interface ProvokedReaction {
  readonly reactorId: CreatureId;
  /** Daño esperado del ataque de oportunidad (se supone que el enemigo lo hace). */
  readonly expectedDamage: number;
}

export type PlanSimulation =
  | {
      readonly ok: true;
      readonly initial: Encounter;
      readonly final: Encounter;
      readonly turn: TurnState;
      readonly attacks: readonly PlannedAttack[];
      readonly effects: readonly PlannedEffect[];
      readonly provoked: readonly ProvokedReaction[];
    }
  | { readonly ok: false; readonly failedStep: number; readonly reason: string };

function effectInputOf(step: Extract<PlanStep, { kind: "effect" }>): EffectInput {
  return {
    ...(step.targetIds ? { targetIds: step.targetIds } : {}),
    ...(step.placement ? { placement: step.placement } : {}),
  };
}

/** Traduce un paso a una orden del ejecutor (null si no hay opción legal que coincida). */
function commandFor(port: SimulationPort, state: Encounter, turn: TurnState, step: PlanStep): TurnCommand | null {
  switch (step.kind) {
    case "move":
      return { kind: "move", path: step.path };
    case "begin":
      return { kind: "beginCapability", source: step.source };
    case "end":
      return { kind: "endTurn" };
    case "effect": {
      const option = port.getOptions(state, turn).executionOptions.find((o) => o.choice.kind === "effect");
      return option ? { kind: "chooseOption", key: option.key, effectInput: effectInputOf(step) } : null;
    }
    case "attack":
    case "standardAction":
    case "finish": {
      const option = port.getOptions(state, turn).executionOptions.find((o) => {
        if (step.kind === "attack") return o.choice.kind === "attack" && o.choice.attackId === step.attackId && o.choice.targetId === step.targetId;
        if (step.kind === "standardAction") return o.choice.kind === "standardAction" && o.choice.action === step.action;
        return o.choice.kind === "finish";
      });
      return option ? { kind: "chooseOption", key: option.key } : null;
    }
  }
}

/**
 * Ejecuta un plan sobre el estado creído (dados esperados). Registra las
 * probabilidades de cada ataque ANTES de resolverlo y los ataques de
 * oportunidad que provocaría (se supone que el enemigo los hace; la
 * simulación los deja pasar para seguir).
 */
export function simulatePlan(port: SimulationPort, actorId: CreatureId, plan: Plan, start: Encounter = port.belief): PlanSimulation {
  let state = start;
  let turn = port.startTurn(state, actorId);
  const attacks: PlannedAttack[] = [];
  const effects: PlannedEffect[] = [];
  const provoked: ProvokedReaction[] = [];
  for (const [index, step] of plan.steps.entries()) {
    const command = commandFor(port, state, turn, step);
    if (command === null) return { ok: false, failedStep: index, reason: "noMatchingOption" };
    if (step.kind === "attack") {
      const odds = port.attackOdds(state, actorId, step.attackId, step.targetId);
      if (odds) attacks.push({ attackId: step.attackId, targetId: step.targetId, odds });
    }
    let effectiveCommand = command;
    if (step.kind === "effect" && command.kind === "chooseOption") {
      const odds = port.effectOdds(state, turn, command.key, effectInputOf(step));
      if (odds === null) return { ok: false, failedStep: index, reason: "invalidEffectInput" };
      effects.push({ targets: odds });
      // Salvaciones de jugadores en la simulación: el resultado más probable (PROPUESTA, decisión 92).
      const playerSaves = Object.fromEntries(
        odds
          .filter((t) => state.combatants[t.targetId]?.definition.kind === "playerCharacter")
          .map((t) => [t.targetId, { outcome: t.saveFailChance > 0.5 ? "failure" : "success" } as const]),
      );
      effectiveCommand = { ...command, effectInput: { ...effectInputOf(step), playerSaves } };
    }
    let result = port.apply(state, turn, effectiveCommand);
    if (!result.ok) return { ok: false, failedStep: index, reason: result.reasonCode };
    // Reacciones provocadas por el movimiento: se cuentan y se dejan pasar.
    while (result.ok && result.turn.pendingReactions.length > 0) {
      const pending = result.turn.pendingReactions[0]!;
      const attackId = pending.attackIds[0];
      const odds = attackId === undefined ? null : port.attackOdds(result.encounter, pending.reactorId, attackId, actorId);
      provoked.push({ reactorId: pending.reactorId, expectedDamage: odds?.expectedDamage ?? 0 });
      result = port.apply(result.encounter, result.turn, { kind: "resolveReaction", reactorId: pending.reactorId, take: false });
    }
    // Salvaciones de jugadores pendientes (Daño masivo): en la simulación se
    // supone que la superan (PROPUESTA, decisión 87: no contar con el shock).
    while (result.ok && result.turn.pendingSaves.length > 0) {
      const save = result.turn.pendingSaves[0]!;
      result = port.apply(result.encounter, result.turn, { kind: "resolvePendingSave", creatureId: save.creatureId, playerSave: { outcome: "success" } });
    }
    if (!result.ok) return { ok: false, failedStep: index, reason: result.reasonCode };
    state = result.encounter;
    turn = result.turn;
  }
  return { ok: true, initial: start, final: state, turn, attacks, effects, provoked };
}
