import "@fontsource/cinzel/600.css";
import "@fontsource/cinzel/700.css";
import "@fontsource/alegreya-sans/400.css";
import "@fontsource/alegreya-sans/500.css";
import "@fontsource/alegreya-sans/700.css";
import "./styles/theme.css";
import "./styles/app.css";
import { forestBackgroundSvg } from "./art/art";
import { AppModel } from "./state";
import type { ScreenId } from "./state";
import { splashScreen } from "./screens/splash";
import { bestiaryScreen } from "./screens/bestiary";
import { partyScreen } from "./screens/party";
import { difficultyScreen } from "./screens/difficulty";
import { savedGamesScreen } from "./screens/savedGames";
import { CombatView } from "./screens/combat";

/**
 * Entrada de la app: un mismo fondo para todas las pantallas (el mundo) y un
 * enrutador sencillo. La pantalla de Combate se conserva viva para no perder
 * el desplazamiento y el zoom del tablero.
 */
const root = document.getElementById("app")!;
document.getElementById("background")!.innerHTML = forestBackgroundSvg();

const model = new AppModel();
document.documentElement.classList.toggle("reduce-motion", model.settings.reduceMotion);

let shown: ScreenId | null = null;
let combatView: CombatView | null = null;

function render(): void {
  if (model.screen === "combat" && model.combat !== null) {
    if (combatView === null || shown !== "combat") {
      combatView?.destroy();
      combatView = new CombatView(model);
      root.replaceChildren(combatView.element);
    }
    shown = "combat";
    combatView.render();
    return;
  }
  if (combatView !== null) {
    combatView.destroy();
    combatView = null;
  }
  // Conserva el desplazamiento al redibujar la misma pantalla.
  const scroller = root.querySelector(".setup-body, .simple-body");
  const scroll = shown === model.screen && scroller ? scroller.scrollTop : 0;
  const screen =
    model.screen === "bestiary"
      ? bestiaryScreen(model)
      : model.screen === "party"
        ? partyScreen(model)
        : model.screen === "difficulty"
          ? difficultyScreen(model)
          : model.screen === "savedGames"
            ? savedGamesScreen(model)
            : splashScreen(model);
  root.replaceChildren(screen);
  shown = model.screen;
  const next = root.querySelector(".setup-body, .simple-body");
  if (next) next.scrollTop = scroll;
}

model.subscribe(render);
render();
