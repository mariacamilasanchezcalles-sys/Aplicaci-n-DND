import { h } from "../dom";
import { MapViewport } from "./viewport";
import { buildMapView } from "../../src/ui-bridge";
import type { CreatureId, Encounter, GridPosition } from "../../src/ui-bridge";

/** Paso de la reproducción del turno de un monstruo. */
export type PlaybackStep =
  | { readonly kind: "move"; readonly creatureId: string; readonly path: readonly GridPosition[] }
  | { readonly kind: "hit"; readonly targetId: string; readonly damage: number; readonly outcome: "miss" | "hit" | "criticalHit" };

/** Casillas resaltadas en el tablero (solo presentación). */
export interface BoardHighlights {
  /** Casillas a las que puede ir (movimiento o despliegue). */
  readonly reachable: readonly GridPosition[];
  /** Criaturas que se pueden elegir como objetivo. */
  readonly targets: readonly CreatureId[];
  readonly currentActorId: CreatureId | null;
  readonly selectedId: CreatureId | null;
  /** Criatura a la que seguir con la vista y clave que, al cambiar, vuelve a centrarla. */
  readonly focus: { readonly id: CreatureId; readonly key: string } | null;
}

/**
 * Tablero táctico: cuadrícula, fichas y resaltados. Conserva el desplazamiento
 * y el zoom entre actualizaciones (el visor no se recrea).
 */
export class Board {
  readonly element: HTMLElement;
  private readonly content: HTMLElement;
  private readonly layer: HTMLElement;
  private readonly viewport: MapViewport;
  private encounter: Encounter;
  private highlights: BoardHighlights = { reachable: [], targets: [], currentActorId: null, selectedId: null, focus: null };
  private centeredOn: string | null = null;

  constructor(encounter: Encounter, private readonly onTap: (square: GridPosition, creatureId: CreatureId | null) => void) {
    this.encounter = encounter;
    const { columns, rows } = encounter.grid.dimensions;
    this.layer = h("div", { class: "board-layer" });
    this.content = h("div", { class: "board-content" }, this.layer);
    this.element = h("div", { class: "board", ariaLabel: "Tablero de combate" }, this.content);
    this.viewport = new MapViewport({
      container: this.element,
      content: this.content,
      columns,
      rows,
      onTap: (column, row) => this.onTap({ column, row }, this.creatureAt(column, row)),
      onCellSizeChange: () => this.draw(),
    });
  }

  destroy(): void {
    this.viewport.destroy();
  }

  zoomBy(factor: number): void {
    this.viewport.zoomBy(factor);
  }

  update(encounter: Encounter, highlights: BoardHighlights): void {
    this.encounter = encounter;
    this.highlights = highlights;
    this.draw();
    // Sigue a la criatura indicada cuando cambia la clave (turno nuevo, fin de turno…).
    const focus = highlights.focus;
    if (focus !== null && focus.key !== this.centeredOn) {
      const record = encounter.combatants[focus.id];
      if (record) {
        this.centeredOn = focus.key;
        const { column, row } = record.state.position;
        // Tras el primer dibujo el contenedor ya tiene tamaño.
        requestAnimationFrame(() => this.viewport.centerOn(column, row));
      }
    }
  }

  /**
   * Reproduce lo que hizo un monstruo (solo presentación): recorre su camino
   * casilla a casilla y marca los golpes con el daño flotando. Los datos ya
   * están resueltos por el núcleo; aquí solo se muestran.
   */
  async playback(steps: readonly PlaybackStep[]): Promise<void> {
    const cell = this.viewport.cellPx;
    const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
    const tokenOf = (id: string): HTMLElement | null => this.layer.querySelector(`.token[data-id="${CSS.escape(id)}"]`);
    for (const step of steps) {
      if (step.kind === "move") {
        const token = tokenOf(step.creatureId);
        if (!token || step.path.length === 0) continue;
        this.viewport.centerOn(step.path[0]!.column, step.path[0]!.row);
        token.classList.add("moving");
        for (const square of step.path) {
          token.style.left = `${square.column * cell}px`;
          token.style.top = `${square.row * cell}px`;
          await wait(170);
        }
        token.classList.remove("moving");
      } else {
        const token = tokenOf(step.targetId);
        if (!token) continue;
        token.classList.add(step.outcome === "miss" ? "dodged" : "struck");
        const float = h("span", { class: `float-text ${step.outcome}`, text: step.outcome === "miss" ? "Falla" : step.damage > 0 ? `−${step.damage}` : "¡Impacto!" });
        token.append(float);
        await wait(650);
        token.classList.remove("struck", "dodged");
        float.remove();
      }
    }
  }

  centerOn(position: GridPosition): void {
    this.viewport.centerOn(position.column, position.row);
  }

  private creatureAt(column: number, row: number): CreatureId | null {
    const view = buildMapView(this.encounter);
    // Prioriza a los vivos si hay varias (atravesar).
    const found = view.creatures.filter((c) => c.squares.some((s) => s.column === column && s.row === row));
    const alive = found.find((c) => (c.currentHitPoints ?? 1) > 0);
    return (alive ?? found[0])?.id ?? null;
  }

  private draw(): void {
    const cell = this.viewport.cellPx;
    const { columns, rows } = this.encounter.grid.dimensions;
    this.content.style.width = `${columns * cell}px`;
    this.content.style.height = `${rows * cell}px`;
    this.content.style.setProperty("--cell", `${cell}px`);
    const view = buildMapView(this.encounter);
    const abbreviations = uniqueAbbreviations(view.creatures.map((c) => [c.id, c.label] as const));
    const nodes: HTMLElement[] = [];
    for (const square of this.highlights.reachable) {
      const mark = h("div", { class: "hl-move" });
      place(mark, square, 1, cell);
      nodes.push(mark);
    }
    for (const creature of view.creatures) {
      const record = this.encounter.combatants[creature.id]!;
      const span = Math.round(Math.sqrt(creature.squares.length));
      const hp = creature.currentHitPoints;
      const max = creature.maxHitPoints;
      const ratio = hp !== null && max ? Math.max(0, Math.min(1, hp / max)) : 1;
      const dead = record.state.lifeState === "dead";
      const down = record.state.lifeState !== "alive";
      const classes = [
        "token",
        creature.kind === "monster" ? "foe" : "hero",
        creature.id === this.highlights.currentActorId ? "current" : "",
        creature.id === this.highlights.selectedId ? "selected" : "",
        this.highlights.targets.includes(creature.id) ? "targetable" : "",
        dead ? "dead" : down ? "down" : "",
      ].join(" ");
      const token = h(
        "div",
        { class: classes, ariaLabel: creature.label, dataset: { id: creature.id } },
        h("span", { class: "token-ring" }),
        h("span", { class: "token-face", text: abbreviations.get(creature.id) ?? "?" }),
      );
      token.style.setProperty("--hp", String(ratio));
      place(token, creature.position, span, cell);
      nodes.push(token);
    }
    this.layer.replaceChildren(...nodes);
  }
}

function place(element: HTMLElement, position: GridPosition, span: number, cell: number): void {
  element.style.left = `${position.column * cell}px`;
  element.style.top = `${position.row * cell}px`;
  element.style.width = `${span * cell}px`;
  element.style.height = `${span * cell}px`;
}

/**
 * Abreviaturas distintas para cada ficha: "Goblin 2" → "G2"; "Cata" y "Caín"
 * → "CA" y "CN" (primera y última letra si las dos primeras coinciden).
 */
export function uniqueAbbreviations(creatures: readonly (readonly [string, string])[]): Map<string, string> {
  const candidates = (label: string): string[] => {
    const clean = label.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const words = clean.split(/\s+/);
    if (words.length > 1 && /^\d+$/.test(words.at(-1)!)) return [`${words[0]!.slice(0, 1)}${words.at(-1)}`.toUpperCase()];
    const letters = clean.replace(/[^A-Za-z0-9]/g, "");
    return [letters.slice(0, 2), `${letters.slice(0, 1)}${letters.slice(-1)}`, letters.slice(0, 3)].map((s) => s.toUpperCase());
  };
  const out = new Map<string, string>();
  const used = new Set<string>();
  for (const [id, label] of creatures) {
    const pick = candidates(label).find((c) => !used.has(c)) ?? candidates(label)[0]!;
    used.add(pick);
    out.set(id, pick);
  }
  return out;
}
