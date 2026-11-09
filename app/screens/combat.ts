import { h, button, numberField, svg } from "../dom";
import { iconSvg } from "../art/art";
import { Board } from "../map/board";
import type { PlaybackStep } from "../map/board";
import {
  ABILITY_LABEL,
  ACTION_LABEL,
  COMMAND_ERROR,
  CONDITION_LABEL,
  DIFFICULTY_LABEL,
  OUTCOME_LABEL,
  PERSONALITY_LABEL,
  PLACEMENT_REASON,
  describeLogEntry,
  nameOf,
} from "../i18n/es";
import type { AppModel } from "../state";
import { storage } from "../storage";
import {
  beginCombat,
  canAdvance,
  mathRandomSource,
  deathSave,
  nextTurn,
  playerCommand,
  playerTurnView,
  redeploy,
  respond,
  rollInitiative,
} from "../../src/ui-bridge";
import type {
  CapabilitySource,
  CombatSnapshot,
  CreatureId,
  ExecutionChoice,
  GridPosition,
  PlayerInput,
  PlayerTurnView,
  TurnCommand,
} from "../../src/ui-bridge";

/** Dados reales del combate: la única fuente de azar de la app. */
const dice = mathRandomSource;

type Mode = { kind: "none" } | { kind: "move" } | { kind: "attackTarget"; attackId: string };

/**
 * Pantalla 5 — El campo de batalla. Tablero, iniciativa, criatura elegida,
 * acciones LEGALES del turno (las da el motor) y registro. Las tiradas de
 * los jugadores se anotan; las de los monstruos las hace la app.
 */
export class CombatView {
  readonly element: HTMLElement;
  private board: Board | null = null;
  private selectedId: CreatureId | null = null;
  private mode: Mode = { kind: "none" };
  private toast: string | null = null;
  private busy = false;
  private logOpen = false;
  private paused = false;
  private lastActor: CreatureId | null = null;
  private readonly top = h("header", { class: "combat-top" });
  private readonly initiative = h("nav", { class: "initiative", ariaLabel: "Orden de iniciativa" });
  private readonly boardSlot = h("div", { class: "board-slot" });
  private readonly panel = h("section", { class: "combat-panel" });
  private readonly overlay = h("div", { class: "overlay-slot" });
  private readonly logDrawer = h("aside", { class: "log-drawer", ariaLabel: "Registro de combate" });

  constructor(private readonly model: AppModel) {
    this.element = h("div", { class: "screen combat" }, this.top, this.initiative, this.boardSlot, this.panel, this.logDrawer, this.overlay);
  }

  destroy(): void {
    this.board?.destroy();
  }

  private get s(): CombatSnapshot {
    return this.model.combat!;
  }

  private set(next: CombatSnapshot, message: string | null = null): void {
    this.toast = message;
    this.mode = { kind: "none" };
    this.model.setCombat(next);
  }

  /**
   * Ejecuta trabajo del cerebro dejando que la pantalla muestre "pensando" y,
   * después, reproduce lo que hicieron los monstruos antes de mostrar el
   * estado final (salvo con "Reducir animaciones").
   */
  private think(work: () => CombatSnapshot): void {
    const before = this.model.combat;
    this.busy = true;
    this.render();
    setTimeout(() => {
      const next = work();
      const steps = before && !this.model.settings.reduceMotion ? playbackSteps(before, next) : [];
      const finish = (): void => {
        this.busy = false;
        this.set(next);
      };
      if (steps.length === 0 || this.board === null) return finish();
      void this.board.playback(steps).then(finish, finish);
    }, 30);
  }

  render(): void {
    const s = this.model.combat;
    if (s === null) return;
    if (this.board === null) {
      this.board = new Board(s.encounter, (square, creatureId) => this.onBoardTap(square, creatureId));
      this.boardSlot.append(this.board.element);
    }
    const view = playerTurnView(s);
    const actorId = s.turn && !s.turn.ended ? s.turn.actorId : null;
    if (this.selectedId === null || !s.encounter.combatants[this.selectedId]) {
      // Sin turno (despliegue): el primer aventurero, para centrar la vista en el grupo.
      this.selectedId = actorId ?? (Object.values(s.encounter.combatants).find((r) => r.definition.kind === "playerCharacter")?.definition.id ?? null);
    }
    // Al cambiar de turno se pasa a mostrar a quien actúa.
    if (actorId !== null && actorId !== this.lastActor) {
      this.lastActor = actorId;
      this.selectedId = actorId;
    }
    this.renderTop(s);
    this.renderInitiative(s, actorId);
    this.board.update(s.encounter, {
      reachable: this.reachableSquares(s, view),
      targets: this.mode.kind === "attackTarget" && view ? this.targetsFor(view, this.mode.attackId) : [],
      currentActorId: actorId,
      selectedId: this.selectedId,
      focus: s.turn !== null
        ? { id: s.turn.actorId, key: `${s.encounter.round}:${s.encounter.turnIndex}:${s.turn.ended}` }
        : this.selectedId !== null
          ? { id: this.selectedId, key: `deploy:${this.selectedId}` }
          : null,
    });
    this.renderPanel(s, view);
    this.renderLog(s);
    this.renderOverlay(s);
  }

  // ---------------------------------------------------------------------------

  private renderTop(s: CombatSnapshot): void {
    const actor = s.turn && !s.turn.ended ? nameOf(s.encounter, s.turn.actorId) : null;
    const phase =
      s.phase === "deployment" ? "Despliegue" : s.phase === "initiative" ? "Iniciativa" : s.phase === "finished" ? OUTCOME_LABEL[s.outcome!] : actor ? `Turno de ${actor}` : "Fin de turno";
    this.top.replaceChildren(
      button("", () => ((this.paused = true), this.render()), { class: "btn-ghost btn-icon", icon: svg(iconSvg("pause")), ariaLabel: "Pausa" }),
      h("div", { class: "combat-title" }, h("span", { class: "eyebrow", text: s.encounter.round > 0 ? `Asalto ${s.encounter.round}` : "Preparación" }), h("span", { class: "title", text: phase })),
      h(
        "div",
        { class: "row" },
        button("", () => this.board?.zoomBy(1 / 1.25), { class: "btn-ghost btn-icon", icon: svg(iconSvg("zoomOut")), ariaLabel: "Alejar" }),
        button("", () => this.board?.zoomBy(1.25), { class: "btn-ghost btn-icon", icon: svg(iconSvg("zoomIn")), ariaLabel: "Acercar" }),
        button("", () => ((this.logOpen = !this.logOpen), this.render()), { class: `btn-ghost btn-icon ${this.logOpen ? "selected" : ""}`, icon: svg(iconSvg("scroll")), ariaLabel: "Registro" }),
      ),
    );
  }

  private renderInitiative(s: CombatSnapshot, actorId: CreatureId | null): void {
    const order = s.encounter.initiativeOrder.length > 0 ? s.encounter.initiativeOrder : (Object.keys(s.encounter.combatants) as CreatureId[]);
    this.initiative.replaceChildren(
      ...order.map((id) => {
        const r = s.encounter.combatants[id]!;
        const total = s.encounter.initiativeTotals[id];
        const out = r.state.lifeState === "dead" || r.state.morale.surrendered;
        return h(
          "button",
          {
            class: `init-chip ${r.definition.kind === "monster" ? "foe" : "hero"} ${id === actorId ? "current" : ""} ${id === this.selectedId ? "selected" : ""} ${out ? "out" : ""}`,
            type: "button",
            onClick: () => {
              this.selectedId = id;
              this.board?.centerOn(r.state.position);
              this.render();
            },
          },
          total === undefined ? null : h("span", { class: "num init-total", text: String(total) }),
          h("span", { class: "init-name", text: r.definition.label }),
          h("span", { class: "num init-hp", text: r.state.currentHitPoints === null ? "" : `${r.state.currentHitPoints}` }),
        );
      }),
    );
  }

  private renderPanel(s: CombatSnapshot, view: PlayerTurnView | null): void {
    const parts: (HTMLElement | null)[] = [this.creatureCard(s)];
    if (this.toast) parts.push(h("div", { class: "toast", text: this.toast }));
    if (this.busy) parts.push(h("div", { class: "thinking" }, svg(iconSvg("rune", 18)), h("span", { text: "El enemigo actúa…" })));
    else parts.push(this.actions(s, view));
    this.panel.replaceChildren(...parts.filter((p): p is HTMLElement => p !== null));
  }

  private creatureCard(s: CombatSnapshot): HTMLElement | null {
    if (this.selectedId === null) return null;
    const r = s.encounter.combatants[this.selectedId];
    if (!r) return null;
    const hp = r.state.currentHitPoints;
    const max = r.definition.stats.maxHitPoints ?? null;
    const ratio = hp !== null && max ? Math.max(0, Math.min(1, hp / max)) : 1;
    const life =
      r.state.lifeState === "dying" ? "Moribundo" : r.state.lifeState === "stable" ? "Estable" : r.state.lifeState === "dead" ? "Muerto" : r.state.morale.surrendered ? "Rendido" : r.state.morale.fleeing ? "Huyendo" : null;
    const conditions = [
      ...new Set(r.state.conditions.map((c) => CONDITION_LABEL[c.condition])),
      ...(r.state.exhaustionLevel > 0 ? [`${CONDITION_LABEL.exhaustion} ${r.state.exhaustionLevel}`] : []),
      ...(r.state.dodging ? ["Esquivando"] : []),
    ];
    const monster = r.definition.kind === "monster" ? r.definition : null;
    const difficulty = monster ? s.encounter.brainSettings.difficultyByCreature[monster.id] : undefined;
    return h(
      "div",
      { class: `creature-panel ${r.definition.kind === "monster" ? "foe" : "hero"}` },
      h(
        "div",
        { class: "cp-head" },
        h("span", { class: "title", text: r.definition.label }),
        h("span", { class: "chip small", text: monster ? `Enemigo · ${PERSONALITY_LABEL[monster.personality]}${difficulty ? ` · ${DIFFICULTY_LABEL[difficulty]}` : ""}` : "Aventurero" }),
      ),
      h(
        "div",
        { class: "cp-stats" },
        h("div", { class: "hp-bar", style: `--hp:${ratio}` }, h("span", { class: "num", text: hp === null ? "—" : `${hp} / ${max ?? "?"} PG` })),
        h("span", { class: "stat" }, svg(iconSvg("shield", 16)), h("span", { class: "num", text: `CA ${r.definition.stats.armorClass ?? "—"}` })),
        h("span", { class: "stat" }, svg(iconSvg("boot", 16)), h("span", { class: "num", text: `${r.definition.stats.speedFeet ?? "—"} p` })),
      ),
      conditions.length > 0 || life
        ? h("div", { class: "cp-conditions" }, ...(life ? [h("span", { class: "chip danger", text: life })] : []), ...conditions.map((c) => h("span", { class: "chip", text: c })))
        : null,
    );
  }

  // ---------------------------------------------------------------------------
  // Acciones según la fase y el turno

  private actions(s: CombatSnapshot, view: PlayerTurnView | null): HTMLElement {
    const box = h("div", { class: "actions" });
    if (s.phase === "deployment") {
      box.append(
        h("p", { class: "muted small", text: "Despliegue: toca una criatura y después una casilla libre para recolocarla." }),
        button("Tirar iniciativa", () => {
          const rolled = rollInitiative(s, dice);
          if (rolled.ok) this.set(rolled.session);
          else this.set(s, "Falta el bonificador de iniciativa de algún monstruo.");
        }, { class: "btn-primary btn-wide", icon: svg(iconSvg("dice")) }),
      );
      return box;
    }
    if (s.phase === "initiative") {
      box.append(h("p", { class: "muted small", text: "Anota la iniciativa de los aventureros." }));
      return box;
    }
    if (s.phase === "finished") return box;
    if (s.pending !== null) return box;
    if (view === null) {
      if (canAdvance(s)) {
        box.append(button("Siguiente turno", () => this.think(() => nextTurn(s, dice)), { class: "btn-primary btn-wide" }));
      }
      return box;
    }
    const opts = view.options;
    if (view.dying) {
      box.append(h("p", { class: "small", text: `${nameOf(s.encounter, view.actorId)} está a 0 PG: tira la salvación contra la muerte (d20).` }), button("Anotar salvación", () => this.openDeathSave(), { class: "btn-primary btn-wide" }));
      return box;
    }
    const buttons: HTMLElement[] = [];
    if (opts.executionOptions.length > 0) {
      // Acción en curso: sus opciones legales.
      const attackIds = [...new Set(opts.executionOptions.flatMap((o) => (o.choice.kind === "attack" ? [o.choice.attackId] : [])))];
      const actor = s.encounter.combatants[view.actorId]!;
      for (const attackId of attackIds) {
        const label = actor.definition.attacks.find((a) => a.id === attackId)?.label ?? "Ataque";
        buttons.push(button(label, () => this.startAttack(attackId), { class: `${this.mode.kind === "attackTarget" && this.mode.attackId === attackId ? "selected" : ""}`, icon: svg(iconSvg("sword", 18)) }));
      }
      for (const o of opts.executionOptions) {
        if (o.choice.kind === "standardAction") buttons.push(button(ACTION_LABEL[o.choice.action as keyof typeof ACTION_LABEL] ?? o.choice.action, () => this.command({ kind: "chooseOption", key: o.key })));
        if (o.choice.kind === "finish") buttons.push(button("Terminar acción", () => this.command({ kind: "chooseOption", key: o.key }), { class: "btn-ghost" }));
      }
      if (opts.canMove) buttons.push(this.moveButton());
      if (opts.canForfeit) buttons.push(button("Renunciar al resto", () => this.command({ kind: "forfeitRemaining" }), { class: "btn-ghost" }));
      if (this.mode.kind === "attackTarget") buttons.unshift(h("p", { class: "small hint-line", text: "Toca el objetivo en el tablero." }));
    } else {
      if (opts.canMove) buttons.push(this.moveButton());
      for (const source of opts.capabilities) buttons.push(button(sourceLabel(s, view.actorId, source), () => this.command({ kind: "beginCapability", source })));
      const actor = s.encounter.combatants[view.actorId]!;
      if (opts.canMove && actor.state.conditions.some((c) => c.condition === "prone")) buttons.push(button("Levantarse", () => this.command({ kind: "standUp" })));
      for (const grapplerId of opts.escapeFrom) buttons.push(button(`Escapar de ${nameOf(s.encounter, grapplerId)}`, () => this.openEscape(grapplerId)));
      if (opts.canEndTurn) buttons.push(button("Terminar turno", () => this.command({ kind: "endTurn" }), { class: "btn-primary" }));
    }
    box.append(h("div", { class: "action-grid" }, ...buttons));
    return box;
  }

  private moveButton(): HTMLElement {
    const active = this.mode.kind === "move";
    return button(active ? "Elige casilla…" : "Mover", () => ((this.mode = active ? { kind: "none" } : { kind: "move" }), this.render()), { class: active ? "selected" : "", icon: svg(iconSvg("move", 18)) });
  }

  private startAttack(attackId: string): void {
    const view = playerTurnView(this.s);
    if (!view) return;
    const targets = this.targetsFor(view, attackId);
    if (targets.length === 1) return this.openAttackRoll(attackId, targets[0]!);
    this.mode = { kind: "attackTarget", attackId };
    this.render();
  }

  private targetsFor(view: PlayerTurnView, attackId: string): CreatureId[] {
    return view.options.executionOptions.flatMap((o) => (o.choice.kind === "attack" && o.choice.attackId === attackId ? [o.choice.targetId] : []));
  }

  private reachableSquares(s: CombatSnapshot, view: PlayerTurnView | null): GridPosition[] {
    if (s.phase === "deployment" && this.selectedId !== null) {
      return []; // En el despliegue se toca directamente la casilla.
    }
    if (this.mode.kind !== "move" || view === null) return [];
    return view.reachable.filter((r) => r.canEndTurnHere || view.options.executionOptions.length > 0).map((r) => r.square);
  }

  private command(command: TurnCommand): void {
    const result = playerCommand(this.s, command, dice);
    if (result.ok) this.set(result.session);
    else this.set(this.s, errorText(result.reason));
  }

  private onBoardTap(square: GridPosition, creatureId: CreatureId | null): void {
    const s = this.s;
    if (s.phase === "deployment") {
      if (creatureId !== null && creatureId !== this.selectedId) {
        this.selectedId = creatureId;
        return this.render();
      }
      if (this.selectedId !== null && creatureId === null) {
        const moved = redeploy(s, this.selectedId, square);
        if (moved.ok) this.set(moved.session);
        else this.set(s, moved.reason === "wrongPhase" || moved.reason === "unknownCreature" ? "No se puede colocar ahí" : PLACEMENT_REASON[moved.reason]);
      }
      return;
    }
    const view = playerTurnView(s);
    if (this.mode.kind === "move" && view) {
      const target = view.reachable.find((r) => r.square.column === square.column && r.square.row === square.row);
      if (target) return this.command({ kind: "move", path: target.path });
    }
    if (this.mode.kind === "attackTarget" && view && creatureId !== null && this.targetsFor(view, this.mode.attackId).includes(creatureId)) {
      return this.openAttackRoll(this.mode.attackId, creatureId);
    }
    if (creatureId !== null) {
      this.selectedId = creatureId;
      this.render();
    }
  }

  // ---------------------------------------------------------------------------
  // Diálogos (tiradas físicas de los jugadores, peticiones, pausa)

  private dialog: HTMLElement | null = null;

  private openDialog(content: HTMLElement): void {
    this.dialog = content;
    this.render();
  }

  private closeDialog(): void {
    this.dialog = null;
    this.render();
  }

  /** Tirada de ataque de un jugador: d20, total y daño (se ignora si falla). */
  private rollForm(title: string, damageType: string | null, onSubmit: (natural: number, total: number, damage: number) => void, onCancel: (() => void) | null): HTMLElement {
    let natural = Number.NaN;
    let total = Number.NaN;
    let damage = Number.NaN;
    const error = h("p", { class: "danger small" });
    return h(
      "div",
      { class: "dialog frame", role: "dialog" },
      h("h3", { text: title }),
      h(
        "div",
        { class: "form-grid" },
        numberField("d20 (natural)", natural, (n) => (natural = n), { min: 1, max: 20 }),
        numberField("Total del ataque", total, (n) => (total = n), { min: -10, max: 60 }),
        numberField(damageType ? `Daño si impacta (${damageType})` : "Daño si impacta", damage, (n) => (damage = n), { min: 0, max: 500 }),
      ),
      error,
      h(
        "div",
        { class: "row end" },
        onCancel ? button("Cancelar", onCancel, { class: "btn-ghost" }) : null,
        button("Resolver", () => {
          if (!Number.isInteger(natural) || natural < 1 || natural > 20 || !Number.isInteger(total)) {
            error.textContent = "Anota el d20 (1–20) y el total.";
            return;
          }
          onSubmit(natural, total, Number.isInteger(damage) ? damage : Number.NaN);
        }, { class: "btn-primary" }),
      ),
    );
  }

  private openAttackRoll(attackId: string, targetId: CreatureId): void {
    const s = this.s;
    const view = playerTurnView(s);
    if (!view) return;
    const option = view.options.executionOptions.find((o) => o.choice.kind === "attack" && o.choice.attackId === attackId && o.choice.targetId === targetId);
    if (!option) return;
    const attack = s.encounter.combatants[view.actorId]!.definition.attacks.find((a) => a.id === attackId);
    const type = attack?.damage[0]?.type ?? "slashing";
    const mode = (option.choice as Extract<ExecutionChoice, { kind: "attack" }>).rollMode;
    const modeText = mode === "advantage" ? " (con Ventaja)" : mode === "disadvantage" ? " (con Desventaja)" : "";
    this.openDialog(
      this.rollForm(`${attack?.label ?? "Ataque"} contra ${nameOf(s.encounter, targetId)}${modeText}`, null, (natural, total, damage) => {
        this.dialog = null;
        const playerRoll = Number.isNaN(damage) ? { natural, total } : { natural, total, damage: [{ type, amount: damage }] };
        this.command({ kind: "chooseOption", key: option.key, attackInput: { playerRoll } });
      }, () => ((this.mode = { kind: "none" }), this.closeDialog())),
    );
  }

  private openDeathSave(): void {
    let d20 = Number.NaN;
    this.openDialog(
      h(
        "div",
        { class: "dialog frame", role: "dialog" },
        h("h3", { text: "Salvación contra la muerte" }),
        numberField("d20", d20, (n) => (d20 = n), { min: 1, max: 20 }),
        h(
          "div",
          { class: "row end" },
          button("Cancelar", () => this.closeDialog(), { class: "btn-ghost" }),
          button("Anotar", () => {
            const result = deathSave(this.s, d20, dice);
            this.dialog = null;
            if (result.ok) this.set(result.session);
            else this.set(this.s, "Anota un d20 entre 1 y 20.");
          }, { class: "btn-primary" }),
        ),
      ),
    );
  }

  private openEscape(grapplerId: CreatureId): void {
    let total = Number.NaN;
    this.openDialog(
      h(
        "div",
        { class: "dialog frame", role: "dialog" },
        h("h3", { text: `Escapar de ${nameOf(this.s.encounter, grapplerId)}` }),
        h("p", { class: "muted small", text: "Prueba de Fuerza (Atletismo) o Destreza (Acrobacias). Usa la acción." }),
        numberField("Total de la prueba", total, (n) => (total = n), { min: -10, max: 60 }),
        h(
          "div",
          { class: "row end" },
          button("Cancelar", () => this.closeDialog(), { class: "btn-ghost" }),
          button("Anotar", () => {
            this.dialog = null;
            if (Number.isInteger(total)) this.command({ kind: "escapeGrapple", grapplerId, playerCheck: { total } });
            else this.closeDialog();
          }, { class: "btn-primary" }),
        ),
      ),
    );
  }

  /** Petición del cerebro durante el turno de un monstruo. */
  private requestDialog(s: CombatSnapshot): HTMLElement | null {
    const request = s.pending;
    if (request === null) return null;
    const answer = (input: PlayerInput): void => this.think(() => respond(this.s, input, dice));
    if (request.kind === "playerSaves") {
      const outcomes: Record<string, "success" | "failure"> = {};
      const ability = request.ability ? ABILITY_LABEL[request.ability] : "";
      const rows = request.creatureIds.map((id) => {
        const ok = button("Superada", () => {
          outcomes[id] = "success";
          ok.classList.add("selected");
          ko.classList.remove("selected");
        }, { class: "btn-small" });
        const ko = button("Fallada", () => {
          outcomes[id] = "failure";
          ko.classList.add("selected");
          ok.classList.remove("selected");
        }, { class: "btn-small" });
        return h("div", { class: "save-row" }, h("span", { class: "title small", text: nameOf(s.encounter, id) }), ok, ko);
      });
      const error = h("p", { class: "danger small" });
      return h(
        "div",
        { class: "dialog frame", role: "dialog" },
        h("h3", { text: "Salvaciones" }),
        h("p", { class: "muted", text: `Tirada de salvación de ${ability}${request.dc !== null ? ` · CD ${request.dc}` : ""}. Tirad con dados físicos.` }),
        ...rows,
        error,
        h(
          "div",
          { class: "row end" },
          button("Confirmar", () => {
            if (request.creatureIds.some((id) => outcomes[id] === undefined)) {
              error.textContent = "Marca el resultado de cada aventurero.";
              return;
            }
            answer({ kind: "playerSaves", saves: Object.fromEntries(request.creatureIds.map((id) => [id, { outcome: outcomes[id]! }])) });
          }, { class: "btn-primary" }),
        ),
      );
    }
    if (request.kind === "playerPendingSave") {
      return h(
        "div",
        { class: "dialog frame", role: "dialog" },
        h("h3", { text: "Daño masivo" }),
        h("p", { class: "muted", text: `${nameOf(s.encounter, request.creatureId)} hace una salvación de Constitución CD 15 (regla de la mesa).` }),
        h(
          "div",
          { class: "row end" },
          button("Fallada", () => answer({ kind: "playerPendingSave", creatureId: request.creatureId, playerSave: { outcome: "failure" } })),
          button("Superada", () => answer({ kind: "playerPendingSave", creatureId: request.creatureId, playerSave: { outcome: "success" } }), { class: "btn-primary" }),
        ),
      );
    }
    // Reacción de un aventurero.
    const o = request.opportunity;
    const reactor = s.encounter.combatants[o.reactorId]!;
    const choices = o.kind === "opportunityAttack" ? o.attackIds.map((attackId) => ({ attackId, targetId: o.moverId })) : o.options;
    const title = o.kind === "opportunityAttack" ? `Ataque de oportunidad contra ${nameOf(s.encounter, o.moverId)}` : "Reacción";
    return h(
      "div",
      { class: "dialog frame", role: "dialog" },
      h("h3", { text: title }),
      h("p", { class: "muted", text: `${reactor.definition.label} puede reaccionar.` }),
      h(
        "div",
        { class: "action-grid" },
        button("Dejar pasar", () => answer({ kind: "playerReaction", reactorId: o.reactorId, take: false }), { class: "btn-ghost" }),
        ...choices.map((c) => {
          const attack = reactor.definition.attacks.find((a) => a.id === c.attackId);
          return button(`${attack?.label ?? "Atacar"} → ${nameOf(s.encounter, c.targetId)}`, () => {
            this.openDialog(
              this.rollForm(`${attack?.label ?? "Ataque"} contra ${nameOf(s.encounter, c.targetId)}`, null, (natural, total, damage) => {
                this.dialog = null;
                const type = attack?.damage[0]?.type ?? "slashing";
                const playerRoll = Number.isNaN(damage) ? { natural, total } : { natural, total, damage: [{ type, amount: damage }] };
                answer({ kind: "playerReaction", reactorId: o.reactorId, take: true, attackId: c.attackId, targetId: c.targetId, attackInput: { playerRoll } });
              }, () => this.closeDialog()),
            );
          }, { class: "btn-primary" });
        }),
      ),
    );
  }

  /** Salvación de Daño masivo de un aventurero durante el turno de un aventurero. */
  private pendingSaveDialog(s: CombatSnapshot, creatureId: CreatureId): HTMLElement {
    const resolve = (outcome: "success" | "failure"): void => this.command({ kind: "resolvePendingSave", creatureId, playerSave: { outcome } });
    return h(
      "div",
      { class: "dialog frame", role: "dialog" },
      h("h3", { text: "Daño masivo" }),
      h("p", { class: "muted", text: `${nameOf(s.encounter, creatureId)} hace una salvación de Constitución CD 15 (regla de la mesa).` }),
      h("div", { class: "row end" }, button("Fallada", () => resolve("failure")), button("Superada", () => resolve("success"), { class: "btn-primary" })),
    );
  }

  private initiativeDialog(s: CombatSnapshot): HTMLElement {
    const heroes = Object.values(s.encounter.combatants).filter((r) => r.definition.kind === "playerCharacter");
    const monsters = Object.values(s.encounter.combatants).filter((r) => r.definition.kind === "monster");
    const totals: Record<string, number> = {};
    let ties: CreatureId[][] = [];
    const error = h("p", { class: "danger small" });
    const tieBox = h("div", { class: "ties" });
    const renderTies = (): void => {
      tieBox.replaceChildren(
        ...ties.map((group, gi) =>
          h(
            "div",
            { class: "tie-group frame" },
            h("span", { class: "eyebrow", text: "Empate: ordenad de primero a último" }),
            ...group.map((id, i) =>
              h(
                "div",
                { class: "tie-row" },
                h("span", { text: `${i + 1}. ${nameOf(s.encounter, id)}` }),
                button("", () => {
                  if (i === 0) return;
                  const next = [...group];
                  [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
                  ties[gi] = next;
                  renderTies();
                }, { class: "btn-ghost btn-icon btn-small", icon: svg(iconSvg("back", 16)), ariaLabel: "Subir" }),
              ),
            ),
          ),
        ),
      );
    };
    return h(
      "div",
      { class: "dialog frame", role: "dialog" },
      h("h3", { text: "Iniciativa" }),
      h("div", { class: "muted small", text: monsters.map((m) => `${m.definition.label}: ${s.monsterInitiative?.[m.definition.id] ?? "—"}`).join(" · ") }),
      h("div", { class: "form-grid" }, ...heroes.map((r) => numberField(`${r.definition.label} (total)`, Number.NaN, (n) => (totals[r.definition.id] = n), { min: -10, max: 40 }))),
      tieBox,
      error,
      h(
        "div",
        { class: "row end" },
        button("Comenzar el combate", () => {
          const missing = heroes.filter((r) => !Number.isInteger(totals[r.definition.id]));
          if (missing.length > 0) {
            error.textContent = "Anota la iniciativa de cada aventurero.";
            return;
          }
          const started = beginCombat(this.s, totals, ties.flat(), dice);
          if (started.ok) {
            this.think(() => started.session);
            return;
          }
          if (started.reason === "tiesUndecided") {
            ties = (started.detail as CreatureId[][]).map((g) => [...g]);
            renderTies();
            error.textContent = "Hay empates: ordenadlos y volved a pulsar.";
          }
        }, { class: "btn-primary" }),
      ),
    );
  }

  private pauseDialog(): HTMLElement {
    const s = this.s;
    return h(
      "div",
      { class: "dialog frame", role: "dialog" },
      h("h3", { text: "Pausa" }),
      button("Reanudar", () => ((this.paused = false), this.render()), { class: "btn-primary btn-wide" }),
      button("Guardar partida", () => {
        const id = this.model.gameId ?? `game-${Date.now().toString(36)}`;
        this.model.gameId = id;
        const ok = storage.saveGame({ id, label: s.encounter.label, savedAt: new Date().toISOString(), snapshot: s });
        this.paused = false;
        this.set(s, ok ? "Partida guardada en el dispositivo." : "No se pudo guardar en este dispositivo.");
      }, { class: "btn-wide" }),
      button("Volver a la preparación", () => ((this.paused = false), this.model.go("difficulty")), { class: "btn-wide btn-ghost" }),
      button("Salir al inicio", () => ((this.paused = false), this.model.go("splash")), { class: "btn-wide btn-ghost" }),
    );
  }

  private renderOverlay(s: CombatSnapshot): void {
    let content: HTMLElement | null = null;
    if (this.paused) content = this.pauseDialog();
    else if (this.busy) content = null; // Mientras el enemigo actúa, el tablero a la vista.
    else if (this.dialog) content = this.dialog;
    else if (!this.busy && s.pending !== null) content = this.requestDialog(s);
    else if (!this.busy && s.pending === null && s.turn !== null && s.turn.pendingSaves.length > 0) content = this.pendingSaveDialog(s, s.turn.pendingSaves[0]!.creatureId);
    else if (s.phase === "initiative") content = this.initiativeDialog(s);
    else if (s.phase === "finished") {
      content = h(
        "div",
        { class: `dialog frame finale ${s.outcome}` },
        h("h2", { text: OUTCOME_LABEL[s.outcome!] }),
        h("p", { class: "muted", text: s.outcome === "victory" ? "Ningún enemigo sigue en pie." : "Ningún aventurero sigue en pie." }),
        button("Ver registro", () => ((this.logOpen = true), this.render()), { class: "btn-wide" }),
        button("Volver al inicio", () => this.model.go("splash"), { class: "btn-primary btn-wide" }),
      );
    }
    this.overlay.replaceChildren(...(content ? [h("div", { class: "scrim" }, content)] : []));
  }

  private renderLog(s: CombatSnapshot): void {
    this.logDrawer.classList.toggle("open", this.logOpen);
    const lines = s.log.flatMap((entry) => {
      const text = describeLogEntry(s.encounter, entry);
      return text === null ? [] : [h("li", { class: entry.item.kind === "turnStarted" ? "turn-line" : "", text })];
    });
    const list = h("ul", { class: "log-list" }, ...lines);
    this.logDrawer.replaceChildren(
      h("div", { class: "log-head" }, h("h3", { text: "Crónica del combate" }), button("", () => ((this.logOpen = false), this.render()), { class: "btn-ghost btn-icon", icon: svg(iconSvg("close")), ariaLabel: "Cerrar registro" })),
      list,
    );
    requestAnimationFrame(() => (list.scrollTop = list.scrollHeight));
  }
}

/** Lo que hicieron los monstruos entre dos estados (movimientos y golpes), para reproducirlo. */
function playbackSteps(before: CombatSnapshot, after: CombatSnapshot): PlaybackStep[] {
  const steps: PlaybackStep[] = [];
  for (const { item } of after.log.slice(before.log.length)) {
    if (item.kind !== "turnLog") continue;
    const actor = after.encounter.combatants[item.actorId];
    const entry = item.entry;
    if (entry.kind === "moved" && actor?.definition.kind === "monster") steps.push({ kind: "move", creatureId: item.actorId, path: entry.path });
    if (entry.kind === "attackResolved" && actor?.definition.kind === "monster") {
      steps.push({ kind: "hit", targetId: entry.targetId, damage: entry.damageApplied, outcome: entry.resolution.outcome });
    }
    if (entry.kind === "opportunityAttack" || entry.kind === "sheetReactionTaken") {
      steps.push({ kind: "hit", targetId: entry.attack.targetId, damage: entry.attack.damageApplied, outcome: entry.attack.resolution.outcome });
    }
    if (entry.kind === "effectResolved" && actor?.definition.kind === "monster") {
      for (const t of entry.targets) steps.push({ kind: "hit", targetId: t.targetId, damage: t.damageApplied, outcome: t.damageApplied > 0 ? "hit" : "miss" });
    }
  }
  return steps;
}

function sourceLabel(s: CombatSnapshot, actorId: CreatureId, source: CapabilitySource): string {
  if (source.kind === "standard") return ACTION_LABEL[source.action];
  const def = s.encounter.combatants[actorId]!.definition;
  if (source.kind === "sheet") return (def.capabilities ?? []).find((c) => c.id === source.capabilityId)?.label ?? source.capabilityId;
  return def.bonusActions.find((b) => b.id === source.bonusActionId)?.label ?? source.bonusActionId;
}

function errorText(reason: string): string {
  return (COMMAND_ERROR as Record<string, string>)[reason] ?? "No es posible ahora.";
}
