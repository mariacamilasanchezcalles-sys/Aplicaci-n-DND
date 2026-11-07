import type { CreatureId, Encounter } from "../models";
import type { KnowledgeView } from "../perception";
import type { ExecutionOption, ReactionOpportunity, TurnState } from "../rules";
import { computeFeatures, scoreFeatures } from "./features";
import type { FeatureVector, FeatureWeights } from "./features";
import { asPlanSimulation, continueSimulation, startSimulation } from "./plan";
import type { PartialSimulation, Plan, PlanStep } from "./plan";
import type { SimulationPort } from "./simulation";

/**
 * PLANIFICADOR (etapa 4 de TACTICAL_BRAIN_DESIGN.md): busca el mejor plan de
 * turno completo entre los que el motor permite, puntuándolo con los rasgos
 * medidos y los pesos de la personalidad. Determinista: con el mismo estado
 * creído, los mismos pesos y los mismos parámetros, el mismo plan.
 *
 * Búsqueda por FASES (PROPUESTA, decisión 95). Una fase es
 *   [levantarse?] [mover a una casilla?] [capacidad completa con sus elecciones]
 * o bien [mover?] y terminar. Destrabarse y Correr van seguidos de su
 * movimiento en la misma fase (sin él no aportan nada y la poda los quitaría). Tras cada fase el plan se puntúa como si el
 * monstruo terminara ahí el turno, así que todo nodo evaluado es un plan
 * completo y legal. Se guardan los `beamWidth` mejores para la fase siguiente.
 */

/**
 * Parámetros de la búsqueda: la DIFICULTAD cambia la calidad de la búsqueda,
 * nunca las estadísticas ni la información (DECISIÓN CONFIRMADA). Los valores
 * de cada nivel de dificultad están PENDIENTES de decidir con la jugadora
 * (decisión 96); quien llama los pasa.
 */
export interface SearchParameters {
  /** Planes parciales que pasan a la fase siguiente. */
  readonly beamWidth: number;
  /** Fases como máximo (acción, acción adicional, último movimiento…). */
  readonly maxPhases: number;
  /**
   * Casillas de destino que examina en cada movimiento (null = todas). Si se
   * limita, se quedan las mejor puntuadas como "mover y terminar".
   */
  readonly maxMoveCandidates: number | null;
  /** Colocaciones de área por efecto (null = todas). */
  readonly maxAreaPlacements: number | null;
  /** Combinaciones de objetivos por efecto con varios objetivos (null = todas). */
  readonly maxTargetCombinations: number | null;
}

export interface ScoredPlan {
  readonly plan: Plan;
  readonly score: number;
  readonly features: FeatureVector;
}

export interface PlanDecision {
  readonly best: ScoredPlan;
  /** Planes completos evaluados (medida del esfuerzo de búsqueda). */
  readonly evaluated: number;
}

/** Punto de partida de la búsqueda: el turno que empieza o uno a medias (replanificar). */
export interface PlanningStart {
  readonly state: Encounter;
  readonly turn: TurnState;
}

const END: PlanStep = { kind: "end" };

/** Combinaciones de 1 a `max` elementos, en orden estable. */
function combinations<T>(items: readonly T[], max: number): T[][] {
  const out: T[][] = [];
  const walk = (start: number, current: T[]): void => {
    if (current.length > 0) out.push(current);
    if (current.length === max) return;
    for (let i = start; i < items.length; i++) walk(i + 1, [...current, items[i]!]);
  };
  walk(0, []);
  return out;
}

export function planTurn(
  port: SimulationPort,
  view: KnowledgeView,
  actorId: CreatureId,
  weights: FeatureWeights,
  params: SearchParameters,
  start?: PlanningStart,
): PlanDecision | null {
  let evaluated = 0;
  let best: ScoredPlan | null = null;

  /** Puntúa una simulación parcial terminando el turno ahí (null si no puede terminar). */
  const evaluate = (partial: PartialSimulation): ScoredPlan | null => {
    const ended = continueSimulation(port, actorId, partial, [END]);
    if (!ended.ok) return null;
    evaluated++;
    const features = computeFeatures(port, view, actorId, asPlanSimulation(ended.partial));
    const scored = { plan: { steps: ended.partial.steps }, score: scoreFeatures(features, weights), features };
    // Desempate determinista: gana el primero generado.
    if (best === null || scored.score > best.score) best = scored;
    return scored;
  };

  const extend = (partial: PartialSimulation, steps: readonly PlanStep[]): PartialSimulation | null => {
    const result = continueSimulation(port, actorId, partial, steps);
    return result.ok ? result.partial : null;
  };

  /** Variantes de los datos de una opción de efecto (objetivos o colocación). */
  const effectVariants = (partial: PartialSimulation, option: ExecutionOption): PlanStep[] => {
    if (option.choice.kind !== "effect") return [];
    switch (option.choice.targeting) {
      case "self":
        return [{ kind: "effect" }];
      case "creatures": {
        const operation = option.choice.operation;
        const max = operation.targeting.kind === "creatures" ? operation.targeting.count : 1;
        const combos = combinations(port.effectTargets(partial.state, partial.turn, option.key), max);
        const limited = params.maxTargetCombinations === null ? combos : combos.slice(0, params.maxTargetCombinations);
        return limited.map((targetIds) => ({ kind: "effect", targetIds }));
      }
      case "area":
        // Un área que no alcanza a nadie no se considera (gastaría la acción sin efecto).
        return port
          .areaPlacements(partial.state, partial.turn, option.key, params.maxAreaPlacements ?? undefined)
          .filter((c) => c.affected.length > 0)
          .map((c) => ({ kind: "effect", placement: c.placement }));
    }
  };

  const attackTargets = (partial: PartialSimulation): CreatureId[] =>
    port
      .getOptions(partial.state, partial.turn)
      .executionOptions.flatMap((o) => (o.choice.kind === "attack" ? [o.choice.targetId] : []));

  /**
   * Moverse entre ataques (acción de Atacar o Multiataque que se realiza como
   * ella; PROPUESTA, decisión 101): solo tras un ataque, y solo a la casilla
   * más barata desde la que alcanza a cada objetivo que no alcanza ya.
   */
  const movesBetweenAttacks = (partial: PartialSimulation): PartialSimulation[] => {
    if (partial.steps.at(-1)?.kind !== "attack" || !port.getOptions(partial.state, partial.turn).canMove) return [];
    const reachableNow = new Set(attackTargets(partial));
    const nearest = new Map<CreatureId, PartialSimulation>();
    const squares = port
      .reachable(partial.state, partial.turn)
      .map((r, order) => ({ r, order }))
      .sort((a, b) => a.r.costFeet - b.r.costFeet || a.order - b.order);
    for (const { r } of squares) {
      const moved = extend(partial, [{ kind: "move", path: r.path }]);
      if (!moved) continue;
      for (const target of attackTargets(moved)) if (!reachableNow.has(target) && !nearest.has(target)) nearest.set(target, moved);
    }
    return [...new Set(nearest.values())];
  };

  /**
   * Completa la capacidad en curso probando cada opción en cada punto de
   * decisión (y moverse entre ataques, ver arriba).
   */
  const completeCapability = (partial: PartialSimulation): PartialSimulation[] => {
    if (partial.turn.execution === null) return [partial];
    const between = movesBetweenAttacks(partial).flatMap(completeCapability);
    const options = port.getOptions(partial.state, partial.turn).executionOptions;
    const steps: PlanStep[] = [];
    for (const option of options) {
      const choice = option.choice;
      if (choice.kind === "attack") steps.push({ kind: "attack", attackId: choice.attackId, targetId: choice.targetId });
      else if (choice.kind === "standardAction") steps.push({ kind: "standardAction", action: choice.action });
      else if (choice.kind === "finish") steps.push({ kind: "finish" });
      else steps.push(...effectVariants(partial, option));
    }
    if (steps.length === 0) steps.push({ kind: "forfeit" });
    return [
      ...steps.flatMap((step) => {
        const next = extend(partial, [step]);
        // Un paso que no avanza (no cambia el número de serie) cortaría la búsqueda.
        return next && next.turn.serial !== partial.turn.serial ? completeCapability(next) : [];
      }),
      ...between,
    ];
  };

  /** Movimientos de una fase: quedarse o ir a cada casilla donde pueda terminar el turno. */
  const moveVariants = (partial: PartialSimulation): PartialSimulation[] => {
    const stay = [partial];
    if (!port.getOptions(partial.state, partial.turn).canMove) return stay;
    const squares = port.reachable(partial.state, partial.turn).filter((r) => r.canEndTurnHere);
    const moved = squares.flatMap((r) => {
      const next = extend(partial, [{ kind: "move", path: r.path }]);
      return next ? [next] : [];
    });
    if (params.maxMoveCandidates === null || moved.length <= params.maxMoveCandidates) return [...stay, ...moved];
    const ranked = moved
      .map((m, order) => ({ m, order, score: evaluate(m)?.score ?? Number.NEGATIVE_INFINITY }))
      .sort((a, b) => b.score - a.score || a.order - b.order)
      .slice(0, params.maxMoveCandidates)
      .sort((a, b) => a.order - b.order);
    return [...stay, ...ranked.map((r) => r.m)];
  };

  /** ¿La capacidad solo cambió cómo puede moverse (Destrabarse, Correr)? */
  const enablesMovement = (before: PartialSimulation, after: PartialSimulation): boolean =>
    (after.turn.disengaged && !before.turn.disengaged) || (after.turn.budgetFeet ?? 0) > (before.turn.budgetFeet ?? 0);

  /** Hijos de un nodo: cada fase posible a partir de él. */
  const expand = (node: PartialSimulation): { open: PartialSimulation[] } => {
    const open: PartialSimulation[] = [];
    let bases = [node];
    // Levantarse primero si está Derribado (opcional).
    const me = node.state.combatants[actorId];
    if (me?.state.conditions.some((c) => c.condition === "prone")) {
      const stood = extend(node, [{ kind: "standUp" }]);
      if (stood) bases = [...bases, stood];
    }
    // Regla casera Moral: si huye, rendirse es una opción (termina el turno).
    if (me?.state.morale.fleeing && !me.state.morale.surrendered) {
      const surrendered = extend(node, [{ kind: "surrender" }]);
      if (surrendered) evaluate(surrendered);
    }
    for (const base of bases) {
      for (const moved of [...completeCapability(base).flatMap(moveVariants)]) {
        // Mover (o no) y terminar: plan completo, sin más fases.
        if (moved !== node) evaluate(moved);
        for (const source of port.getOptions(moved.state, moved.turn).capabilities) {
          const begun = extend(moved, [{ kind: "begin", source }]);
          if (!begun) continue;
          for (const done of completeCapability(begun)) {
            if (!enablesMovement(moved, done)) {
              open.push(done);
              continue;
            }
            // Destrabarse o Correr solo valen por el movimiento que permiten:
            // se exploran junto con el movimiento siguiente, en la misma fase.
            // Desde la casilla de inicio de la fase (mover antes no añade nada).
            if (moved !== base) continue;
            open.push(...moveVariants(done));
          }
        }
        // Escapar de un agarre gasta la acción; vale por el movimiento que permite después.
        if (moved === base) {
          for (const grapplerId of port.getOptions(moved.state, moved.turn).escapeFrom) {
            const escaped = extend(moved, [{ kind: "escape", grapplerId }]);
            if (escaped) open.push(...moveVariants(escaped));
          }
        }
      }
    }
    return { open };
  };

  const root = startSimulation(port, actorId, start?.state ?? port.belief, start?.turn);
  evaluate(root);
  let frontier = [root];
  for (let phase = 0; phase < params.maxPhases && frontier.length > 0; phase++) {
    const children: { node: PartialSimulation; score: number; order: number }[] = [];
    for (const node of frontier) {
      for (const child of expand(node).open) {
        const scored = evaluate(child);
        if (scored) children.push({ node: child, score: scored.score, order: children.length });
      }
    }
    frontier = children
      .sort((a, b) => b.score - a.score || a.order - b.order)
      .slice(0, params.beamWidth)
      .map((c) => c.node);
  }
  const chosen = best as ScoredPlan | null;
  return chosen === null ? null : { best: chosen, evaluated };
}

/**
 * ¿Hace el ataque de oportunidad? (PROPUESTA, decisión 97). Compara el plan
 * "atacar ahora" con "dejarlo pasar" con los mismos rasgos y pesos: solo
 * cambian los rasgos de daño causado. Elige el ataque mejor puntuado si mejora
 * a no atacar; null = dejarlo pasar.
 */
export function decideOpportunityAttack(
  port: SimulationPort,
  view: KnowledgeView,
  opportunity: ReactionOpportunity,
  weights: FeatureWeights,
  state: Encounter = port.belief,
): { readonly attackId: ReactionOpportunity["attackIds"][number]; readonly score: number } | null {
  const reactorId = opportunity.reactorId;
  const turn = port.startTurn(state, reactorId);
  const base = { ok: true as const, initial: state, final: state, turn, effects: [], provoked: [] };
  const decline = scoreFeatures(computeFeatures(port, view, reactorId, { ...base, attacks: [] }), weights);
  let chosen: { attackId: ReactionOpportunity["attackIds"][number]; score: number } | null = null;
  for (const attackId of opportunity.attackIds) {
    const odds = port.attackOdds(state, reactorId, attackId, opportunity.moverId);
    if (!odds) continue;
    const take = scoreFeatures(
      computeFeatures(port, view, reactorId, { ...base, attacks: [{ attackId, targetId: opportunity.moverId, odds }] }),
      weights,
    );
    if (take > decline && (chosen === null || take - decline > chosen.score)) chosen = { attackId, score: take - decline };
  }
  return chosen;
}
