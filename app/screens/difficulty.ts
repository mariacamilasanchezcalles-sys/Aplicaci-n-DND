import { h, button, select, svg } from "../dom";
import { iconSvg } from "../art/art";
import { DIFFICULTY_DESCRIPTION, DIFFICULTY_LABEL, SETUP_ISSUE } from "../i18n/es";
import { encounterSummary, setupFrame } from "../components/setupFrame";
import type { AppModel } from "../state";
import { buildEncounter, setupIssues, startSession } from "../../src/ui-bridge";
import type { CustomDifficulty, DifficultyId, EncounterSetup } from "../../src/ui-bridge";

const LEVELS: readonly DifficultyId[] = ["easy", "normal", "hard", "custom"];
const RUNES: Readonly<Record<DifficultyId, string>> = { easy: "ᚠ", normal: "ᚱ", hard: "ᛏ", custom: "ᛟ" };

let counter = 0;

/** Pantalla 4 — El destino del encuentro. Cambia la calidad táctica, nunca las reglas ni las estadísticas. */
export function difficultyScreen(model: AppModel): HTMLElement {
  const current = model.draft.difficulty;
  const custom = model.draft.customDifficulty;
  const setCustom = (change: Partial<CustomDifficulty>): void => model.setDraft({ customDifficulty: { ...custom, ...change } });

  const options = h(
    "div",
    { class: "difficulty-grid" },
    ...LEVELS.map((level) =>
      h(
        "button",
        { class: `difficulty-card frame ${current === level ? "chosen" : ""}`, type: "button", onClick: () => model.setDraft({ difficulty: level }) },
        h("span", { class: "rune", text: RUNES[level] }),
        h("span", { class: "title", text: DIFFICULTY_LABEL[level] }),
        h("span", { class: "muted small", text: DIFFICULTY_DESCRIPTION[level] }),
      ),
    ),
  );

  const range = (label: string, value: number, min: number, max: number, onValue: (n: number) => void, note: string): HTMLElement => {
    const input = h("input", { type: "range", ariaLabel: label });
    input.min = String(min);
    input.max = String(max);
    input.value = String(value);
    input.addEventListener("change", () => onValue(Number(input.value)));
    return h("label", { class: "field range" }, h("span", { class: "range-head" }, h("span", { text: label }), h("span", { class: "num", text: String(value) })), input, h("span", { class: "muted small", text: note }));
  };
  const customPanel =
    current === "custom"
      ? h(
          "section",
          { class: "frame custom-panel" },
          h("h3", { text: "Ritual personalizado" }),
          range("Alternativas que conserva", custom.beamWidth, 1, 6, (n) => setCustom({ beamWidth: n }), "Más alternativas: decisiones más finas, más lento."),
          range("Profundidad (fases del turno)", custom.maxPhases, 1, 3, (n) => setCustom({ maxPhases: n }), "Cuántas partes del turno encadena al planear."),
          h(
            "label",
            { class: "field" },
            "Posiciones que evalúa",
            select(
              [
                { value: "4", label: "Pocas (4)" },
                { value: "12", label: "Varias (12)" },
                { value: "all", label: "Todas" },
              ],
              custom.maxMoveCandidates === null ? "all" : custom.maxMoveCandidates <= 4 ? "4" : "12",
              (v) => setCustom({ maxMoveCandidates: v === "all" ? null : Number(v) }),
              "Posiciones",
            ),
          ),
          h(
            "label",
            { class: "field" },
            "Coordinación",
            select(
              [
                { value: "limited", label: "Limitada" },
                { value: "considersAllies", label: "Considera aliados" },
                { value: "plansCooperation", label: "Planifica cooperación" },
              ],
              custom.coordination,
              (v) => setCustom({ coordination: v }),
              "Coordinación",
            ),
          ),
          toggle("Moverse entre ataques", custom.movesBetweenAttacks, (v) => setCustom({ movesBetweenAttacks: v })),
          toggle("Replanificar tras cada operación", custom.replanAfterEachOperation, (v) => setCustom({ replanAfterEachOperation: v })),
        )
      : null;

  const setup: EncounterSetup = {
    id: `enc-${Date.now().toString(36)}-${++counter}`,
    label: encounterSummary(model),
    monsters: model.draft.monsters,
    party: model.party(),
    partyLevel: model.draft.partyLevel,
    difficulty: current ?? "normal",
    customDifficulty: current === "custom" ? custom : null,
  };
  const issues = current === null ? [] : setupIssues(setup, model.bestiary);
  const hint = current === null ? "Elige una dificultad" : issues.length > 0 ? SETUP_ISSUE[issues[0]!] : undefined;

  const content = h(
    "div",
    { class: "stack" },
    h("p", { class: "lead muted", text: "La dificultad decide cuánto piensa el enemigo: nunca cambia sus tiradas, sus estadísticas ni lo que sabe." }),
    options,
    customPanel,
    h("div", { class: "ritual muted small" }, svg(iconSvg("rune", 18)), h("span", { text: "Los monstruos solo usan lo que perciben y recuerdan." })),
  );
  return setupFrame(model, "difficulty", "El destino del encuentro", content, {
    label: "Preparar encuentro",
    disabled: hint !== undefined,
    ...(hint ? { hint } : {}),
    onClick: () => {
      const built = buildEncounter(setup, model.bestiary);
      if (!built.ok) return;
      model.gameId = null;
      model.setCombat(startSession(built.encounter));
      model.go("combat");
    },
  });
}

function toggle(label: string, value: boolean, onValue: (v: boolean) => void): HTMLElement {
  const box = h("input", { type: "checkbox", ariaLabel: label });
  box.checked = value;
  box.addEventListener("change", () => onValue(box.checked));
  return h("label", { class: "toggle" }, box, h("span", { text: label }));
}
