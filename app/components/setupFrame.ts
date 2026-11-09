import { h, button, svg } from "../dom";
import { iconSvg, runeBandSvg } from "../art/art";
import { DIFFICULTY_LABEL } from "../i18n/es";
import type { AppModel, ScreenId } from "../state";
import { SETUP_STEPS } from "../state";

const STEP_LABEL: Readonly<Record<(typeof SETUP_STEPS)[number], string>> = {
  bestiary: "Enemigos",
  party: "Personajes",
  difficulty: "Dificultad",
  combat: "Combate",
};

/** Resumen del encuentro actual: "3 Goblins · 2 Aventureros · Dificultad pendiente". */
export function encounterSummary(model: AppModel): string {
  const monsters = model.draft.monsters
    .filter((g) => g.count > 0)
    .map((g) => {
      const entry = model.bestiary.entries.find((e) => e.sheetId === g.sheetId);
      const label = entry?.label ?? g.sheetId;
      return `${g.count} ${g.count === 1 ? label : `${label}s`}`;
    });
  const party = model.draft.partyKeys.length;
  const difficulty = model.draft.difficulty === null ? "Dificultad pendiente" : `Dificultad ${DIFFICULTY_LABEL[model.draft.difficulty]}`;
  return [monsters.length > 0 ? monsters.join(", ") : "Sin enemigos", `${party} ${party === 1 ? "Aventurero" : "Aventureros"}`, difficulty].join(" · ");
}

/**
 * Marco de las pantallas de preparación: indicador superior con los pasos
 * (se puede volver a cualquiera sin perder lo elegido), resumen del
 * encuentro y botón principal abajo.
 */
export function setupFrame(
  model: AppModel,
  step: (typeof SETUP_STEPS)[number],
  title: string,
  content: HTMLElement,
  primary: { label: string; onClick: () => void; disabled: boolean; hint?: string },
): HTMLElement {
  const index = SETUP_STEPS.indexOf(step);
  const back: ScreenId = index === 0 ? "splash" : SETUP_STEPS[index - 1]!;
  const steps = h(
    "nav",
    { class: "stepper", ariaLabel: "Pasos de la preparación" },
    ...SETUP_STEPS.map((s, i) =>
      h(
        "button",
        {
          class: `step ${i === index ? "current" : i < index ? "done" : ""}`,
          type: "button",
          disabled: s === "combat" && model.combat === null,
          onClick: () => model.go(s),
        },
        h("span", { class: "step-num num", text: String(i + 1) }),
        h("span", { class: "step-label", text: STEP_LABEL[s] }),
      ),
    ),
  );
  return h(
    "div",
    { class: "screen setup" },
    h(
      "header",
      { class: "setup-header" },
      h(
        "div",
        { class: "setup-top" },
        button("", () => model.go(back), { class: "btn-ghost btn-icon", icon: svg(iconSvg("back")), ariaLabel: "Volver" }),
        h("div", { class: "setup-titles" }, h("div", { class: "eyebrow", text: "Preparación del encuentro" }), h("h1", { text: title })),
        h("div", { class: "step-count muted num", text: `Paso ${index + 1} de 4` }),
      ),
      steps,
      h(
        "div",
        { class: "encounter-summary" },
        h("span", { class: "eyebrow", text: "Encuentro actual" }),
        h("span", { class: "summary-text", text: encounterSummary(model) }),
        h("span", { class: "saved-tag muted", text: "Selección guardada" }),
      ),
    ),
    h("main", { class: "setup-body" }, content),
    h(
      "footer",
      { class: "setup-footer" },
      svg(runeBandSvg(220), "rune-band"),
      primary.hint ? h("div", { class: "hint danger", text: primary.hint }) : null,
      button(primary.label, primary.onClick, { class: "btn-primary btn-wide", disabled: primary.disabled }),
    ),
  );
}
