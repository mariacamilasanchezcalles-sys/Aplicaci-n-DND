import { h, button, svg } from "../dom";
import { iconSvg } from "../art/art";
import { CLASS_LABEL, spellSummary } from "../i18n/es";
import { SPELL_CATALOG } from "../../src/ui-bridge";
import type { CharacterClassId, SpellCatalogEntry } from "../../src/ui-bridge";

/**
 * Panel "Añadir conjuros": conjuros de daño del SRD 5.2.1, filtrados por las
 * clases del personaje (con opción de ver todos) y agrupados por nivel.
 */
export interface SpellSheetOptions {
  readonly characterName: string;
  readonly classes: readonly CharacterClassId[];
  readonly alreadyChosen: readonly string[];
  readonly beams: number;
  readonly onAdd: (spellIds: readonly string[]) => void;
  readonly onClose: () => void;
}

export function spellSheet(options: SpellSheetOptions): HTMLElement {
  const chosen: string[] = [];
  let query = "";
  let showAll = options.classes.length === 0;
  const list = h("div", { class: "ws-list" });
  const addButton = button("Elige conjuros", () => options.onAdd([...chosen]), { class: "btn-primary btn-wide", disabled: true });
  const filterNote = h("p", { class: "muted small sheet-note" });
  const toggle = button("Ver todos", () => {
    showAll = !showAll;
    render();
  }, { class: "btn-ghost btn-small" });

  const visible = (s: SpellCatalogEntry): boolean =>
    !options.alreadyChosen.includes(s.id) &&
    (showAll || s.classes.some((c) => options.classes.includes(c))) &&
    (query === "" || s.label.toLowerCase().includes(query) || s.name.toLowerCase().includes(query));

  const render = (): void => {
    filterNote.textContent =
      options.classes.length === 0
        ? "Sin clase anotada: se muestran todos los conjuros."
        : showAll
          ? "Todos los conjuros de daño del SRD."
          : `Conjuros de ${options.classes.map((c) => CLASS_LABEL[c]).join(" y ")}.`;
    toggle.hidden = options.classes.length === 0;
    toggle.querySelector("span")!.textContent = showAll ? "Solo los de su clase" : "Ver todos";
    const levels = [...new Set(SPELL_CATALOG.filter(visible).map((s) => s.level))].sort((a, b) => a - b);
    list.replaceChildren(
      ...(levels.length === 0
        ? [h("p", { class: "muted", text: "No hay más conjuros que coincidan." })]
        : levels.map((level) =>
            h(
              "section",
              { class: "ws-group" },
              h("h4", { class: "ws-group-title", text: level === 0 ? "Trucos" : `Nivel ${level}` }),
              ...SPELL_CATALOG.filter((s) => s.level === level && visible(s)).map((s) => {
                const on = chosen.includes(s.id);
                return h(
                  "button",
                  {
                    class: `ws-item ${on ? "on" : ""}`,
                    type: "button",
                    ariaLabel: `${s.label}: ${spellSummary(s, options.beams)}`,
                    onClick: () => {
                      const i = chosen.indexOf(s.id);
                      if (i >= 0) chosen.splice(i, 1);
                      else chosen.push(s.id);
                      render();
                    },
                  },
                  h("span", { class: "ws-check", text: on ? "✓" : "" }),
                  h("span", { class: "ws-name", text: s.label }),
                  h(
                    "span",
                    { class: "ws-desc muted" },
                    spellSummary(s, options.beams),
                    s.unmodeled.length > 0 ? h("span", { class: "ws-unmodeled", text: ` Aún sin aplicar: ${s.unmodeled.join("; ").toLowerCase()}.` }) : null,
                  ),
                );
              }),
            ),
          )),
    );
    addButton.disabled = chosen.length === 0;
    addButton.querySelector("span")!.textContent = chosen.length === 0 ? "Elige conjuros" : chosen.length === 1 ? "Añadir 1 conjuro" : `Añadir ${chosen.length} conjuros`;
  };

  const search = h("input", { type: "search", ariaLabel: "Buscar conjuro" });
  search.placeholder = "Buscar conjuro";
  search.addEventListener("input", () => {
    query = search.value.trim().toLowerCase();
    render();
  });
  render();

  return h(
    "div",
    { class: "sheet-scrim", onClick: (e) => (e.target === e.currentTarget ? options.onClose() : undefined) },
    h(
      "div",
      { class: "sheet", role: "dialog", ariaLabel: `Añadir conjuros a ${options.characterName}` },
      h("header", { class: "sheet-head" }, h("h3", { text: `Conjuros de ${options.characterName}` }), button("", options.onClose, { class: "btn-ghost btn-icon", icon: svg(iconSvg("close")), ariaLabel: "Cerrar" })),
      h("div", { class: "row sheet-filter" }, filterNote, toggle),
      h("label", { class: "search" }, svg(iconSvg("search", 18)), search),
      list,
      h("footer", { class: "sheet-foot" }, addButton),
    ),
  );
}
