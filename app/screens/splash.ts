import { h, button, svg } from "../dom";
import { emblemSvg, iconSvg } from "../art/art";
import type { AppModel } from "../state";
import { storage } from "../storage";

/** Pantalla 1 — Inicio: la entrada a la aventura. */
export function splashScreen(model: AppModel): HTMLElement {
  const embers = h("div", { class: "embers", ariaLabel: "" });
  // Brasas: posiciones fijas (decoración, sin azar).
  for (let i = 0; i < 18; i++) {
    const ember = h("span", { class: "ember" });
    ember.style.left = `${(i * 37) % 100}%`;
    ember.style.animationDelay = `${(i * 0.7) % 6}s`;
    ember.style.animationDuration = `${6 + (i % 5)}s`;
    embers.append(ember);
  }
  const saved = storage.loadGames().length;
  const settings = h(
    "div",
    { class: "settings-panel frame", role: "dialog" },
    h("h3", { text: "Configuración" }),
    h(
      "label",
      { class: "toggle" },
      (() => {
        const box = h("input", { type: "checkbox", ariaLabel: "Reducir animaciones" });
        box.checked = model.settings.reduceMotion;
        box.addEventListener("change", () => model.setSettings({ ...model.settings, reduceMotion: box.checked }));
        return box;
      })(),
      h("span", { text: "Reducir animaciones" }),
    ),
  );
  settings.hidden = true;
  return h(
    "div",
    { class: "screen splash" },
    embers,
    h("div", { class: "mist" }),
    h(
      "div",
      { class: "splash-center" },
      svg(emblemSvg(200), "emblem"),
      h("h1", { class: "splash-title", text: "Simulador Táctico" }),
      h("p", { class: "splash-sub muted", text: "Combate de D&D 5e · reglas 2024" }),
      button("Entrar al combate", () => model.go("bestiary"), { class: "btn-primary btn-wide btn-large" }),
      h(
        "div",
        { class: "splash-secondary" },
        button(saved > 0 ? `Partidas guardadas (${saved})` : "Partidas guardadas", () => model.go("savedGames"), { class: "btn-ghost btn-small", icon: svg(iconSvg("scroll", 18)) }),
        button("Configuración", () => (settings.hidden = !settings.hidden), { class: "btn-ghost btn-small", icon: svg(iconSvg("gear", 18)) }),
      ),
      settings,
    ),
  );
}
