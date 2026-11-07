/** Pequeño ayudante para crear elementos sin framework. */
type Child = Node | string | null | false | undefined;

export interface ElementProps {
  readonly class?: string;
  readonly text?: string;
  readonly title?: string;
  readonly disabled?: boolean;
  readonly type?: string;
  readonly style?: string;
  readonly ariaLabel?: string;
  readonly dataset?: Readonly<Record<string, string>>;
  readonly onClick?: (event: MouseEvent) => void;
  readonly onChange?: (event: Event) => void;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (props.class) element.className = props.class;
  if (props.text !== undefined) element.textContent = props.text;
  if (props.title) element.title = props.title;
  if (props.style) element.setAttribute("style", props.style);
  if (props.ariaLabel) element.setAttribute("aria-label", props.ariaLabel);
  if (props.type) element.setAttribute("type", props.type);
  if (props.disabled !== undefined && "disabled" in element) {
    (element as HTMLButtonElement).disabled = props.disabled;
  }
  if (props.dataset) Object.assign(element.dataset, props.dataset);
  if (props.onClick) element.addEventListener("click", props.onClick);
  if (props.onChange) element.addEventListener("change", props.onChange);
  for (const child of children) {
    if (child === null || child === false || child === undefined) continue;
    element.append(child);
  }
  return element;
}

/** Menú desplegable con opciones cerradas (nunca texto libre). */
export function select<V extends string>(
  options: readonly { readonly value: V; readonly label: string }[],
  current: V | null,
  onSelect: (value: V) => void,
  ariaLabel: string,
): HTMLSelectElement {
  const element = h("select", {
    ariaLabel,
    onChange: (event) => onSelect((event.target as HTMLSelectElement).value as V),
  });
  if (current === null) {
    element.append(h("option", { text: "— Elegir —" }));
    element.options[0]!.disabled = true;
    element.options[0]!.selected = true;
  }
  for (const option of options) {
    const item = h("option", { text: option.label });
    item.value = option.value;
    item.selected = option.value === current;
    element.append(item);
  }
  return element;
}

export function formatSquare(column: number, row: number): string {
  return `(${column}, ${row})`;
}
