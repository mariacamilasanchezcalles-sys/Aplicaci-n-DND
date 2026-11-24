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
  private readonly ground: HTMLCanvasElement;
  private groundCell = 0;
  private readonly viewport: MapViewport;
  private encounter: Encounter;
  private highlights: BoardHighlights = { reachable: [], targets: [], currentActorId: null, selectedId: null, focus: null };
  private centeredOn: string | null = null;

  constructor(encounter: Encounter, private readonly onTap: (square: GridPosition, creatureId: CreatureId | null) => void) {
    this.encounter = encounter;
    const { columns, rows } = encounter.grid.dimensions;
    this.layer = h("div", { class: "board-layer" });
    this.ground = h("canvas", { class: "board-ground", ariaLabel: "" });
    this.content = h("div", { class: "board-content" }, this.ground, this.layer);
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
    if (cell !== this.groundCell) {
      this.groundCell = cell;
      paintGround(this.ground, columns, rows, cell);
    }
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

/** Mezcla determinista (sin azar: el azar es solo de los dados). */
function hash(x: number, y: number, salt: number): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Suelo del claro: losas de piedra irregulares con musgo en las juntas y
 * grietas, y la cuadrícula trazada en tinta dorada desvaída. Solo
 * presentación; se repinta cuando cambia el tamaño de casilla.
 */
function paintGround(canvas: HTMLCanvasElement, columns: number, rows: number, cell: number): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(columns * cell * dpr);
  canvas.height = Math.round(rows * cell * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  // Tierra y musgo bajo las losas.
  ctx.fillStyle = "#171912";
  ctx.fillRect(0, 0, columns * cell, rows * cell);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const x = c * cell;
      const y = r * cell;
      // Losa: tono de piedra que varía de una a otra.
      const tone = hash(c, r, 1);
      const light = 15 + tone * 7;
      const warm = hash(c, r, 2) * 8;
      const inset = cell * (0.05 + hash(c, r, 3) * 0.04);
      ctx.fillStyle = `hsl(${30 + warm}, ${8 + tone * 6}%, ${light}%)`;
      ctx.beginPath();
      const j = (s: number): number => (hash(c, r, s) - 0.5) * cell * 0.06;
      ctx.moveTo(x + inset + j(4), y + inset + j(5));
      ctx.lineTo(x + cell - inset + j(6), y + inset + j(7));
      ctx.lineTo(x + cell - inset + j(8), y + cell - inset + j(9));
      ctx.lineTo(x + inset + j(10), y + cell - inset + j(11));
      ctx.closePath();
      ctx.fill();
      // Brillo superior suave: relieve de la losa.
      const grad = ctx.createLinearGradient(x, y, x + cell, y + cell);
      grad.addColorStop(0, "rgba(236, 227, 208, 0.05)");
      grad.addColorStop(1, "rgba(0, 0, 0, 0.18)");
      ctx.fillStyle = grad;
      ctx.fill();
      // Musgo que trepa desde las juntas.
      const patches = Math.floor(hash(c, r, 12) * 3);
      for (let p = 0; p < patches; p++) {
        const edge = Math.floor(hash(c, r, 20 + p) * 4);
        const t = hash(c, r, 30 + p);
        const px = edge === 0 ? x + t * cell : edge === 1 ? x + cell : edge === 2 ? x + t * cell : x;
        const py = edge === 0 ? y : edge === 1 ? y + t * cell : edge === 2 ? y + cell : y + t * cell;
        const radius = cell * (0.06 + hash(c, r, 40 + p) * 0.12);
        const moss = ctx.createRadialGradient(px, py, 0, px, py, radius);
        moss.addColorStop(0, "rgba(46, 54, 30, 0.55)");
        moss.addColorStop(0.6, "rgba(40, 46, 26, 0.3)");
        moss.addColorStop(1, "rgba(40, 46, 26, 0)");
        ctx.fillStyle = moss;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      // Alguna grieta.
      if (hash(c, r, 50) > 0.72) {
        ctx.strokeStyle = "rgba(8, 8, 7, 0.55)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        let cx = x + cell * (0.25 + hash(c, r, 51) * 0.5);
        let cy = y + inset + 1;
        ctx.moveTo(cx, cy);
        for (let k = 0; k < 4; k++) {
          cx += (hash(c, r, 52 + k) - 0.5) * cell * 0.25;
          cy += cell * 0.18;
          ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      }
      // Hoja caída de vez en cuando.
      if (hash(c, r, 60) > 0.9) {
        ctx.save();
        ctx.translate(x + cell * hash(c, r, 61), y + cell * hash(c, r, 62));
        ctx.rotate(hash(c, r, 63) * Math.PI * 2);
        ctx.fillStyle = hash(c, r, 64) > 0.5 ? "rgba(112, 28, 37, 0.55)" : "rgba(122, 104, 60, 0.5)";
        ctx.beginPath();
        ctx.ellipse(0, 0, cell * 0.12, cell * 0.05, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }
  // Cuadrícula en tinta dorada desvaída.
  ctx.strokeStyle = "rgba(181, 154, 112, 0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 0; c <= columns; c++) {
    ctx.moveTo(c * cell + 0.5, 0);
    ctx.lineTo(c * cell + 0.5, rows * cell);
  }
  for (let r = 0; r <= rows; r++) {
    ctx.moveTo(0, r * cell + 0.5);
    ctx.lineTo(columns * cell, r * cell + 0.5);
  }
  ctx.stroke();
  // Borde del claro.
  ctx.strokeStyle = "rgba(181, 154, 112, 0.45)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, columns * cell - 2, rows * cell - 2);
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
