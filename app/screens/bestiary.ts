import { h, button, select, svg } from "../dom";
import { creatureArtSvg, iconSvg } from "../art/art";
import { PERSONALITY_LABEL, SIZE_LABEL, TYPE_LABEL } from "../i18n/es";
import { setupFrame } from "../components/setupFrame";
import type { AppModel } from "../state";
import type { BestiaryEntry, CreatureSize, CreatureTypeId, MonsterGroupInput, PersonalityId } from "../../src/ui-bridge";

/** Filtros de la pantalla (estado de la interfaz, no se guarda). */
const filters = { text: "", type: "all" as CreatureTypeId | "all", size: "all" as CreatureSize | "all", cr: "all" };

const PERSONALITIES: readonly PersonalityId[] = ["pragmatic", "aggressive", "pacifist"];

/** Pantalla 2 — Bestiario: un libro antiguo de criaturas. */
export function bestiaryScreen(model: AppModel): HTMLElement {
  const entries = model.bestiary.entries;
  const groups = model.draft.monsters;
  const countOf = (sheetId: string): number => groups.filter((g) => g.sheetId === sheetId).reduce((n, g) => n + g.count, 0);

  const setGroups = (next: readonly MonsterGroupInput[]): void => model.setDraft({ monsters: next.filter((g) => g.count > 0) });
  const add = (entry: BestiaryEntry): void => {
    const existing = groups.find((g) => g.sheetId === entry.sheetId);
    setGroups(existing ? groups.map((g) => (g === existing ? { ...g, count: Math.min(12, g.count + 1) } : g)) : [...groups, { sheetId: entry.sheetId, count: 1, personality: "pragmatic" }]);
  };
  const change = (group: MonsterGroupInput, delta: number): void => setGroups(groups.map((g) => (g === group ? { ...g, count: Math.max(0, Math.min(12, g.count + delta)) } : g)));

  const matches = (e: BestiaryEntry): boolean =>
    (filters.text === "" || e.label.toLowerCase().includes(filters.text.toLowerCase())) &&
    (filters.type === "all" || e.creatureType === filters.type) &&
    (filters.size === "all" || e.size === filters.size) &&
    (filters.cr === "all" || e.challengeRating === filters.cr);

  const grid = h("div", { class: "card-grid" });
  const renderGrid = (): void => {
    const visible = entries.filter(matches);
    grid.replaceChildren(
      ...(visible.length === 0
        ? [h("p", { class: "muted", text: "Ninguna criatura coincide con los filtros." })]
        : visible.map((e) => {
            const n = countOf(e.sheetId);
            return h(
              "article",
              { class: `creature-card frame ${n > 0 ? "chosen" : ""}` },
              svg(creatureArtSvg(e.sheetId, e.label), "creature-art"),
              h(
                "div",
                { class: "creature-info" },
                h("h3", { text: e.label }),
                h("div", { class: "muted small", text: [SIZE_LABEL[e.size], e.creatureType ? TYPE_LABEL[e.creatureType] : null].filter(Boolean).join(" · ") }),
                h(
                  "div",
                  { class: "stat-row" },
                  stat("CA", String(e.armorClass), "shield"),
                  stat("PG", String(e.hitPoints), "heart"),
                  stat("Vel.", `${e.speedFeet}`, "boot"),
                  stat("VD", e.challengeRating ?? "—", "skull"),
                ),
                h("div", { class: "muted small", text: e.attacks.map((a) => a.label).join(" · ") }),
                e.sourceKind === "official" ? null : h("div", { class: "chip small", text: "Ficha de prueba" }),
              ),
              h(
                "div",
                { class: "card-actions" },
                n > 0 ? h("span", { class: "chip selected num", text: `× ${n}` }) : null,
                button("Añadir", () => add(e), { class: "btn-small", icon: svg(iconSvg("plus", 18)) }),
              ),
            );
          })),
    );
  };
  renderGrid();

  const search = h("input", { type: "search", ariaLabel: "Buscar criatura" });
  search.placeholder = "Buscar criatura";
  search.value = filters.text;
  search.addEventListener("input", () => {
    filters.text = search.value;
    renderGrid();
  });
  const types = [...new Set(entries.flatMap((e) => (e.creatureType ? [e.creatureType] : [])))];
  const sizes = [...new Set(entries.map((e) => e.size))];
  const crs = [...new Set(entries.flatMap((e) => (e.challengeRating ? [e.challengeRating] : [])))];
  const filterBar = h(
    "div",
    { class: "filter-bar" },
    h("label", { class: "search" }, svg(iconSvg("search", 18)), search),
    select([{ value: "all", label: "Todos los tipos" }, ...types.map((t) => ({ value: t, label: TYPE_LABEL[t] }))], filters.type, (v) => ((filters.type = v as typeof filters.type), renderGrid()), "Tipo"),
    select([{ value: "all", label: "Todos los tamaños" }, ...sizes.map((s) => ({ value: s, label: SIZE_LABEL[s] }))], filters.size, (v) => ((filters.size = v as typeof filters.size), renderGrid()), "Tamaño"),
    select([{ value: "all", label: "Cualquier desafío" }, ...crs.map((c) => ({ value: c, label: `VD ${c}` }))], filters.cr, (v) => ((filters.cr = v), renderGrid()), "Desafío"),
  );

  const total = groups.reduce((n, g) => n + g.count, 0);
  const selection = h(
    "section",
    { class: "selection frame" },
    h("div", { class: "selection-head" }, h("h3", { text: "Enemigos elegidos" }), h("span", { class: "chip num", text: String(total) })),
    groups.length === 0
      ? h("p", { class: "muted small", text: "Añade criaturas del bestiario. Cada una será una criatura independiente en el combate." })
      : h(
          "div",
          { class: "selection-list" },
          ...groups.map((g) => {
            const entry = entries.find((e) => e.sheetId === g.sheetId);
            return h(
              "div",
              { class: "selection-item" },
              h("span", { class: "title small", text: entry?.label ?? g.sheetId }),
              select(
                PERSONALITIES.map((p) => ({ value: p, label: PERSONALITY_LABEL[p] })),
                g.personality,
                (p) => setGroups(groups.map((x) => (x === g ? { ...x, personality: p } : x))),
                "Personalidad",
              ),
              h(
                "div",
                { class: "stepper-input" },
                button("", () => change(g, -1), { class: "btn-icon btn-small", icon: svg(iconSvg("minus", 18)), ariaLabel: "Quitar uno" }),
                h("span", { class: "num count", text: String(g.count) }),
                button("", () => change(g, +1), { class: "btn-icon btn-small", icon: svg(iconSvg("plus", 18)), ariaLabel: "Añadir uno" }),
              ),
            );
          }),
        ),
  );

  return setupFrame(model, "bestiary", "El bestiario", h("div", { class: "stack" }, filterBar, grid, selection), {
    label: "Continuar",
    onClick: () => model.go("party"),
    disabled: total === 0,
    ...(total === 0 ? { hint: "Elige al menos un enemigo" } : {}),
  });
}

function stat(label: string, value: string, icon: "shield" | "heart" | "boot" | "skull"): HTMLElement {
  return h("div", { class: "stat" }, svg(iconSvg(icon, 16)), h("span", { class: "stat-label", text: label }), h("span", { class: "num", text: value }));
}
