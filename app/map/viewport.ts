/**
 * Desplazamiento y zoom del mapa con los dedos (Pointer Events), como una app
 * de mapas. Es estado de la INTERFAZ: el núcleo no sabe nada de esto.
 *
 * Valores PROVISIONALES (decisión de interfaz):
 * - A zoom 1 caben 5 columnas x 9 filas; cada casilla mide al menos 44 px.
 * - Zoom entre 0,5x y 2,5x.
 * - El desplazamiento se limita a los bordes del mapa.
 */
export const VISIBLE_COLUMNS = 5;
export const VISIBLE_ROWS = 9;
export const MIN_CELL_PX = 44;
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2.5;
/** Movimiento máximo (px) para que un toque cuente como toque y no arrastre. */
const TAP_SLOP_PX = 8;

export interface ViewportOptions {
  readonly container: HTMLElement;
  readonly content: HTMLElement;
  readonly columns: number;
  readonly rows: number;
  /** Toque sobre una casilla (coordenadas desde 0). */
  readonly onTap: (column: number, row: number) => void;
  /** Se llama cuando cambia el tamaño base de casilla (hay que redibujar). */
  readonly onCellSizeChange: (cellPx: number) => void;
}

interface Point {
  x: number;
  y: number;
}

export class MapViewport {
  cellPx = MIN_CELL_PX;
  private zoom = 1;
  private tx = 0;
  private ty = 0;
  private readonly pointers = new Map<number, Point>();
  private gesture:
    | { kind: "pan"; start: Point; tx: number; ty: number; moved: boolean }
    | { kind: "pinch"; distance: number; zoom: number; anchor: Point }
    | null = null;
  private readonly resizeObserver: ResizeObserver;

  constructor(private readonly options: ViewportOptions) {
    const { container } = options;
    container.addEventListener("pointerdown", this.onPointerDown);
    container.addEventListener("pointermove", this.onPointerMove);
    container.addEventListener("pointerup", this.onPointerUp);
    container.addEventListener("pointercancel", this.onPointerCancel);
    container.addEventListener("wheel", this.onWheel, { passive: false });
    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(container);
    this.layout();
  }

  destroy(): void {
    this.resizeObserver.disconnect();
  }

  get zoomLevel(): number {
    return this.zoom;
  }

  /** Centra la vista en una casilla (puede ser fraccionaria). */
  centerOn(column: number, row: number): void {
    const { width, height } = this.size();
    const scaled = this.cellPx * this.zoom;
    this.tx = width / 2 - (column + 0.5) * scaled;
    this.ty = height / 2 - (row + 0.5) * scaled;
    this.apply();
  }

  /** Zoom con botones, alrededor del centro de la vista. */
  zoomBy(factor: number): void {
    const { width, height } = this.size();
    this.zoomAround({ x: width / 2, y: height / 2 }, this.zoom * factor);
  }

  resetZoom(): void {
    const { width, height } = this.size();
    this.zoomAround({ x: width / 2, y: height / 2 }, 1);
  }

  private size(): { width: number; height: number } {
    return {
      width: this.options.container.clientWidth,
      height: this.options.container.clientHeight,
    };
  }

  /** Recalcula el tamaño base de casilla para que quepan 5 x 9 a zoom 1. */
  private layout(): void {
    const { width, height } = this.size();
    if (width === 0 || height === 0) return;
    // Conserva el punto central al cambiar de tamaño.
    const before = this.cellPx * this.zoom;
    const centerColumn = (width / 2 - this.tx) / before;
    const centerRow = (height / 2 - this.ty) / before;

    const fit = Math.floor(Math.min(width / VISIBLE_COLUMNS, height / VISIBLE_ROWS));
    const cellPx = Math.max(MIN_CELL_PX, fit);
    if (cellPx !== this.cellPx) {
      this.cellPx = cellPx;
      this.options.onCellSizeChange(cellPx);
    }
    const after = this.cellPx * this.zoom;
    this.tx = width / 2 - centerColumn * after;
    this.ty = height / 2 - centerRow * after;
    this.apply();
  }

  private zoomAround(screenPoint: Point, nextZoom: number): void {
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
    // Punto del mapa (en px sin escalar) que está bajo el dedo.
    const mapX = (screenPoint.x - this.tx) / this.zoom;
    const mapY = (screenPoint.y - this.ty) / this.zoom;
    this.zoom = zoom;
    this.tx = screenPoint.x - mapX * zoom;
    this.ty = screenPoint.y - mapY * zoom;
    this.apply();
  }

  /** Limita el desplazamiento a los bordes; si el mapa cabe, lo centra. */
  private clamp(): void {
    const { width, height } = this.size();
    const mapWidth = this.options.columns * this.cellPx * this.zoom;
    const mapHeight = this.options.rows * this.cellPx * this.zoom;
    this.tx = mapWidth <= width ? (width - mapWidth) / 2 : Math.min(0, Math.max(width - mapWidth, this.tx));
    this.ty =
      mapHeight <= height ? (height - mapHeight) / 2 : Math.min(0, Math.max(height - mapHeight, this.ty));
  }

  private apply(): void {
    this.clamp();
    this.options.content.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.zoom})`;
  }

  private localPoint(event: PointerEvent | WheelEvent): Point {
    const rect = this.options.container.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private startGesture(): void {
    const points = [...this.pointers.values()];
    if (points.length === 1 && points[0]) {
      this.gesture = { kind: "pan", start: { ...points[0] }, tx: this.tx, ty: this.ty, moved: false };
    } else if (points.length >= 2 && points[0] && points[1]) {
      const [a, b] = [points[0], points[1]];
      this.gesture = {
        kind: "pinch",
        distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        zoom: this.zoom,
        anchor: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
    } else {
      this.gesture = null;
    }
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.options.container.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, this.localPoint(event));
    this.startGesture();
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.pointers.has(event.pointerId)) return;
    this.pointers.set(event.pointerId, this.localPoint(event));
    const gesture = this.gesture;
    if (gesture?.kind === "pan") {
      const point = this.pointers.get(event.pointerId);
      if (!point) return;
      const dx = point.x - gesture.start.x;
      const dy = point.y - gesture.start.y;
      if (!gesture.moved && Math.hypot(dx, dy) < TAP_SLOP_PX) return;
      gesture.moved = true;
      this.tx = gesture.tx + dx;
      this.ty = gesture.ty + dy;
      this.apply();
    } else if (gesture?.kind === "pinch") {
      const [a, b] = [...this.pointers.values()];
      if (!a || !b) return;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      // Zoom alrededor del punto entre los dedos y desplazamiento a la vez.
      this.zoomAround(gesture.anchor, gesture.zoom * (distance / gesture.distance));
      this.tx += middle.x - gesture.anchor.x;
      this.ty += middle.y - gesture.anchor.y;
      gesture.anchor = middle;
      gesture.zoom = this.zoom;
      gesture.distance = Math.max(1, distance);
      this.apply();
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const gesture = this.gesture;
    const point = this.pointers.get(event.pointerId);
    this.pointers.delete(event.pointerId);
    if (gesture?.kind === "pan" && !gesture.moved && point && this.pointers.size === 0) {
      const scaled = this.cellPx * this.zoom;
      const column = Math.floor((point.x - this.tx) / scaled);
      const row = Math.floor((point.y - this.ty) / scaled);
      if (column >= 0 && row >= 0 && column < this.options.columns && row < this.options.rows) {
        this.options.onTap(column, row);
      }
    }
    // Al levantar un dedo de un pellizco se sigue arrastrando con el otro,
    // pero ya no cuenta como toque.
    this.startGesture();
    if (this.gesture?.kind === "pan") this.gesture.moved = true;
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId);
    this.startGesture();
    if (this.gesture?.kind === "pan") this.gesture.moved = true;
  };

  /** Rueda del ratón o pellizco del panel táctil, para probar en el ordenador. */
  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.zoomAround(this.localPoint(event), this.zoom * Math.exp(-event.deltaY * 0.002));
  };
}
