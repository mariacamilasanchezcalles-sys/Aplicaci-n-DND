import { h, button, svg } from "../dom";
import { iconSvg } from "../art/art";
import { DAMAGE_LABEL } from "../i18n/es";
import { WEAPON_CATALOG } from "../../src/ui-bridge";
import type { WeaponCatalogEntry } from "../../src/ui-bridge";

/**
 * Panel "Añadir ataques" (sube desde abajo): armas oficiales 2024 con
 * buscador y selección múltiple, y una salida para un ataque personalizado.
 * Solo presentación: los datos y la conversión a ataques vienen del núcleo.
 */
export interface WeaponSheetOptions {
  readonly characterName: string;
  readonly onAdd: (weaponIds: readonly string[]) => void;
  readonly onCustom: () => void;
  readonly onClose: () => void;
}

const GROUPS: readonly { readonly title: string; readonly match: (w: WeaponCatalogEntry) => boolean }[] = [
  { title: "Sencillas cuerpo a cuerpo", match: (w) => w.category === "simple" && w.kind === "melee" },
  { title: "Sencillas a distancia", match: (w) => w.category === "simple" && w.kind === "ranged" },
  { title: "Marciales cuerpo a cuerpo", match: (w) => w.category === "martial" && w.kind === "melee" },
  { title: "Marciales a distancia", match: (w) => w.category === "martial" && w.kind === "ranged" },
];

/** "1d8 cortante, alcance 10 pies, arrojadiza 20/60". */
function describe(w: WeaponCatalogEntry): string {
  const parts = [`${w.damageText} ${DAMAGE_LABEL[w.damageType].toLowerCase()}`];
  if (w.kind === "melee") parts.push(`alcance ${w.reach ? 10 : 5} pies`);
  if (w.range) parts.push(`${w.thrown ? "arrojadiza" : "distancia"} ${w.range.normal}/${w.range.long}`);
  return parts.join(", ");
}

export function weaponSheet(options: WeaponSheetOptions): HTMLElement {
  const chosen: string[] = [];
  let query = "";
  const list = h("div", { class: "ws-list" });
  const addButton = button("Elige armas", () => options.onAdd([...chosen]), { class: "btn-primary btn-wide", disabled: true });

  const refreshButton = (): void => {
    addButton.disabled = chosen.length === 0;
    addButton.querySelector("span")!.textContent =
      chosen.length === 0 ? "Elige armas" : chosen.length === 1 ? "Añadir 1 arma" : `Añadir ${chosen.length} armas`;
  };
  const render = (): void => {
    const q = query.trim().toLowerCase();
    const groups = GROUPS.map((g) => ({ title: g.title, items: WEAPON_CATALOG.filter((w) => g.match(w) && (q === "" || w.label.toLowerCase().includes(q))) })).filter(
      (g) => g.items.length > 0,
    );
    list.replaceChildren(
      ...(groups.length === 0
        ? [h("p", { class: "muted", text: "Ninguna arma se llama así. Usa un ataque personalizado." })]
        : groups.map((g) =>
            h(
              "section",
              { class: "ws-group" },
              h("h4", { class: "ws-group-title", text: g.title }),
              ...g.items.map((w) => {
                const on = chosen.includes(w.id);
                return h(
                  "button",
                  {
                    class: `ws-item ${on ? "on" : ""}`,
                    type: "button",
                    ariaLabel: `${w.label}: ${describe(w)}`,
                    onClick: () => {
                      const i = chosen.indexOf(w.id);
                      if (i >= 0) chosen.splice(i, 1);
                      else chosen.push(w.id);
                      render();
                      refreshButton();
                    },
                  },
                  h("span", { class: "ws-check", text: on ? "✓" : "" }),
                  h("span", { class: "ws-name", text: w.label }),
                  h("span", { class: "ws-desc muted", text: describe(w) }),
                );
              }),
            ),
          )),
    );
  };
  render();

  const search = h("input", { type: "search", ariaLabel: "Buscar arma" });
  search.placeholder = "Buscar arma";
  search.addEventListener("input", () => {
    query = search.value;
    render();
  });

  return h(
    "div",
    { class: "sheet-scrim", onClick: (e) => (e.target === e.currentTarget ? options.onClose() : undefined) },
    h(
      "div",
      { class: "sheet", role: "dialog", ariaLabel: `Añadir ataques a ${options.characterName}` },
      h(
        "header",
        { class: "sheet-head" },
        h("h3", { text: `Ataques de ${options.characterName}` }),
        button("", options.onClose, { class: "btn-ghost btn-icon", icon: svg(iconSvg("close")), ariaLabel: "Cerrar" }),
      ),
      h("p", { class: "muted small sheet-note", text: "Armas de las reglas 2024. Marca todas las que lleve; el alcance y las distancias se rellenan solos." }),
      h("label", { class: "search" }, svg(iconSvg("search", 18)), search),
      list,
      h("footer", { class: "sheet-foot" }, addButton, button("Ataque personalizado", options.onCustom, { class: "btn-ghost btn-wide" })),
    ),
  );
}
