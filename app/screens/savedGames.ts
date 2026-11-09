import { h, button, svg } from "../dom";
import { iconSvg } from "../art/art";
import { OUTCOME_LABEL } from "../i18n/es";
import type { AppModel } from "../state";
import { storage } from "../storage";

/** Partidas guardadas en este dispositivo. */
export function savedGamesScreen(model: AppModel): HTMLElement {
  const games = storage.loadGames();
  const list = h("div", { class: "saved-list" });
  const render = (): void => {
    list.replaceChildren(
      ...(storage.loadGames().length === 0
        ? [h("p", { class: "muted", text: "Aún no hay partidas guardadas. Puedes guardar desde el menú de pausa del combate." })]
        : storage.loadGames().map((game) => {
            const s = game.snapshot;
            const status = s.outcome ? OUTCOME_LABEL[s.outcome] : s.phase === "deployment" ? "Despliegue" : s.phase === "initiative" ? "Iniciativa" : `Asalto ${s.encounter.round}`;
            return h(
              "div",
              { class: "saved-item frame" },
              h("div", {}, h("div", { class: "title", text: game.label }), h("div", { class: "muted", text: `${new Date(game.savedAt).toLocaleString("es")} · ${status}` })),
              h(
                "div",
                { class: "row" },
                button("Abrir", () => {
                  model.gameId = game.id;
                  model.setCombat(s);
                  model.go("combat");
                }, { class: "btn-primary btn-small" }),
                button("", () => {
                  storage.deleteGame(game.id);
                  render();
                }, { class: "btn-ghost btn-icon", icon: svg(iconSvg("close")), ariaLabel: "Borrar partida" }),
              ),
            );
          })),
    );
  };
  render();
  void games;
  return h(
    "div",
    { class: "screen simple" },
    h("header", { class: "simple-header" }, button("", () => model.go("splash"), { class: "btn-ghost btn-icon", icon: svg(iconSvg("back")), ariaLabel: "Volver" }), h("h1", { text: "Partidas guardadas" })),
    h("main", { class: "simple-body" }, list),
  );
}
