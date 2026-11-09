/** Ayudantes para crear elementos sin framework (solo presentación). */
type Child = Node | string | null | false | undefined;

export interface ElementProps {
  readonly class?: string;
  readonly text?: string;
  readonly title?: string;
  readonly disabled?: boolean;
  readonly type?: string;
  readonly style?: string;
  readonly ariaLabel?: string;
  readonly role?: string;
  readonly dataset?: Readonly<Record<string, string>>;
  readonly onClick?: (event: MouseEvent) => void;
  readonly onInput?: (event: Event) => void;
  readonly onChange?: (event: Event) => void;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: ElementProps = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (props.class) element.className = props.class;
  if (props.text !== undefined) element.textContent = props.text;
  if (props.title) element.title = props.title;
  if (props.style) element.setAttribute("style", props.style);
  if (props.ariaLabel) element.setAttribute("aria-label", props.ariaLabel);
  if (props.role) element.setAttribute("role", props.role);
  if (props.type) element.setAttribute("type", props.type);
  if (props.disabled !== undefined && "disabled" in element) (element as HTMLButtonElement).disabled = props.disabled;
  if (props.dataset) Object.assign(element.dataset, props.dataset);
  const onClick = props.onClick;
  if (onClick) element.addEventListener("click", (event) => onClick(event as MouseEvent));
  if (props.onInput) element.addEventListener("input", props.onInput);
  if (props.onChange) element.addEventListener("change", props.onChange);
  for (const child of children) {
    if (child === null || child === false || child === undefined) continue;
    element.append(child);
  }
  return element;
}

/** Inserta un SVG generado por el módulo de arte (cadenas propias, no de usuario). */
export function svg(markup: string, className = ""): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = `svg ${className}`.trim();
  span.innerHTML = markup;
  return span;
}

/** Botón con icono y texto. */
export function button(label: string, onClick: () => void, options: { class?: string; icon?: Node; disabled?: boolean; ariaLabel?: string } = {}): HTMLButtonElement {
  return h(
    "button",
    { class: `btn ${options.class ?? ""}`.trim(), onClick: () => onClick(), disabled: options.disabled ?? false, type: "button", ariaLabel: options.ariaLabel ?? label },
    options.icon ?? null,
    label === "" ? null : h("span", { text: label }),
  );
}

/** Desplegable con opciones cerradas (nunca texto libre para acciones). */
export function select<V extends string>(options: readonly { readonly value: V; readonly label: string }[], current: V, onSelect: (value: V) => void, ariaLabel: string): HTMLSelectElement {
  const element = h("select", { ariaLabel, onChange: (event) => onSelect((event.target as HTMLSelectElement).value as V) });
  for (const option of options) {
    const item = h("option", { text: option.label });
    item.value = option.value;
    item.selected = option.value === current;
    element.append(item);
  }
  return element;
}

/** Campo numérico entero. */
export function numberField(label: string, value: number, onValue: (n: number) => void, options: { min?: number; max?: number; step?: number } = {}): HTMLLabelElement {
  const input = h("input", { type: "number", ariaLabel: label });
  input.value = Number.isFinite(value) ? String(value) : "";
  input.inputMode = "numeric";
  if (options.min !== undefined) input.min = String(options.min);
  if (options.max !== undefined) input.max = String(options.max);
  input.step = String(options.step ?? 1);
  input.addEventListener("change", () => onValue(input.value === "" ? Number.NaN : Number(input.value)));
  return h("label", { class: "field" }, label, input);
}

/** Campo de texto corto (nombres). */
export function textField(label: string, value: string, onValue: (s: string) => void, maxLength = 40): HTMLLabelElement {
  const input = h("input", { type: "text", ariaLabel: label });
  input.value = value;
  input.maxLength = maxLength;
  input.addEventListener("change", () => onValue(input.value));
  return h("label", { class: "field" }, label, input);
}

export function clear(element: HTMLElement): void {
  while (element.firstChild) element.firstChild.remove();
}
