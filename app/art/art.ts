/**
 * ARTE PROPIO en SVG (decisión de la jugadora 2026-11-09): emblema, fondo de
 * bosque con ruinas, retratos de criaturas, iconos y runas. Estilo de
 * silueta y grabado con la paleta del tema. Sin azar: los adornos se generan
 * con patrones fijos (el azar es solo de los dados).
 */

const C = {
  charcoal: "#101010",
  charcoal2: "#171615",
  blood: "#701C25",
  bloodBright: "#9a2a35",
  moss: "#292B25",
  mossLight: "#3c3f35",
  gold: "#B59A70",
  goldDim: "#7d6a4c",
  bone: "#e9e1d2",
} as const;

/** Secuencia pseudoaleatoria FIJA para adornos (no es azar de juego). */
function pattern(seed: number): () => number {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

/** Pequeñas runas (trazos) para anillos y bordes. */
const RUNE_PATHS = [
  "M0 -6 L0 6 M0 -6 L4 -2",
  "M-3 -6 L-3 6 M-3 0 L3 -6 M-3 0 L3 6",
  "M0 -6 L0 6 M-4 -2 L4 2",
  "M-3 6 L0 -6 L3 6 M-2 1 L2 1",
  "M-3 -6 L3 6 M3 -6 L-3 6",
  "M0 -6 L0 6 M0 -2 L4 -6 M0 2 L4 6",
  "M-3 -6 L-3 6 L3 6",
  "M-3 -6 L3 -6 L-3 6 L3 6",
];

function runeRing(cx: number, cy: number, r: number, count: number, color: string, size = 1): string {
  let out = "";
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    const deg = (angle * 180) / Math.PI + 90;
    out += `<path d="${RUNE_PATHS[i % RUNE_PATHS.length]}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${deg.toFixed(1)}) scale(${size})" stroke="${color}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`;
  }
  return out;
}

/** Emblema del simulador: anillo rúnico, espadas cruzadas y un d20 con brillo carmesí. */
export function emblemSvg(size = 220): string {
  const d20 = (cx: number, cy: number, r: number): string => {
    const pts = Array.from({ length: 6 }, (_, i) => {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as const;
    });
    const hex = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const inner = [pts[5]!, pts[1]!, pts[3]!].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const lines = pts.map(([x, y], i) => {
      const t = [pts[5]!, pts[1]!, pts[3]!][Math.floor(((i + 1) % 6) / 2)]!;
      return `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${t[0].toFixed(1)}" y2="${t[1].toFixed(1)}"/>`;
    });
    return `<g stroke="${C.gold}" stroke-width="2" fill="none" stroke-linejoin="round">
      <polygon points="${hex}" fill="url(#d20fill)"/>
      <polygon points="${inner}"/>
      ${lines.join("")}
      <text x="${cx}" y="${cy + 7}" text-anchor="middle" font-family="Cinzel, serif" font-size="20" font-weight="700" fill="${C.bone}" stroke="none">20</text>
    </g>`;
  };
  const sword = (rotate: number): string => `<g transform="translate(110 110) rotate(${rotate})">
      <path d="M-3 -88 L3 -88 L4 30 L0 40 L-4 30 Z" fill="${C.charcoal2}" stroke="${C.gold}" stroke-width="1.5"/>
      <rect x="-18" y="30" width="36" height="6" rx="2" fill="${C.goldDim}" stroke="${C.gold}"/>
      <rect x="-3" y="36" width="6" height="22" fill="${C.blood}" stroke="${C.gold}"/>
      <circle cx="0" cy="62" r="5" fill="${C.goldDim}" stroke="${C.gold}"/>
    </g>`;
  return `<svg viewBox="0 0 220 220" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Emblema del simulador">
    <defs>
      <radialGradient id="glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${C.bloodBright}" stop-opacity="0.75"/>
        <stop offset="60%" stop-color="${C.blood}" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="${C.blood}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="d20fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${C.bloodBright}"/>
        <stop offset="100%" stop-color="${C.charcoal}"/>
      </linearGradient>
    </defs>
    <circle cx="110" cy="110" r="105" fill="url(#glow)"/>
    <circle cx="110" cy="110" r="96" fill="${C.charcoal}" stroke="${C.gold}" stroke-width="2"/>
    <circle cx="110" cy="110" r="88" fill="none" stroke="${C.goldDim}" stroke-width="1"/>
    <circle cx="110" cy="110" r="70" fill="none" stroke="${C.goldDim}" stroke-width="1"/>
    ${runeRing(110, 110, 79, 24, C.gold)}
    ${sword(-35)}${sword(35)}
    ${d20(110, 110, 34)}
  </svg>`;
}

/**
 * Fondo común a todas las pantallas: bosque antiguo de noche con ruinas,
 * raíces, niebla y una luna rojiza. Se dibuja una vez y se reutiliza.
 */
export function forestBackgroundSvg(): string {
  const rnd = pattern(7);
  const trees = (count: number, baseY: number, h: number, color: string, opacity: number): string => {
    let out = "";
    for (let i = 0; i < count; i++) {
      const x = (i / count) * 420 - 10 + rnd() * 18;
      const height = h * (0.6 + rnd() * 0.5);
      const w = 6 + rnd() * 8;
      // Tronco con ramas quebradas.
      out += `<path d="M${x.toFixed(1)} ${baseY} L${(x + w * 0.35).toFixed(1)} ${(baseY - height).toFixed(1)} L${(x + w * 0.65).toFixed(1)} ${(baseY - height).toFixed(1)} L${(x + w).toFixed(1)} ${baseY} Z
        M${(x + w * 0.5).toFixed(1)} ${(baseY - height * 0.55).toFixed(1)} l${(-14 - rnd() * 10).toFixed(1)} ${(-18 - rnd() * 10).toFixed(1)}
        M${(x + w * 0.5).toFixed(1)} ${(baseY - height * 0.7).toFixed(1)} l${(12 + rnd() * 10).toFixed(1)} ${(-16 - rnd() * 10).toFixed(1)}"
        fill="${color}" stroke="${color}" stroke-width="3" stroke-linecap="round" opacity="${opacity}"/>`;
    }
    return out;
  };
  const roots = (): string => {
    let out = "";
    for (let i = 0; i < 9; i++) {
      const x = i * 50 - 10 + rnd() * 20;
      out += `<path d="M${x.toFixed(1)} 760 C ${(x + 20).toFixed(1)} ${(730 - rnd() * 30).toFixed(1)}, ${(x + 50).toFixed(1)} ${(745 - rnd() * 20).toFixed(1)}, ${(x + 80).toFixed(1)} ${(720 - rnd() * 40).toFixed(1)}" stroke="${C.charcoal2}" stroke-width="${(4 + rnd() * 5).toFixed(1)}" fill="none" stroke-linecap="round"/>`;
    }
    return out;
  };
  const leaves = (): string => {
    let out = "";
    for (let i = 0; i < 14; i++) {
      const x = rnd() * 400;
      const y = 600 + rnd() * 160;
      const r = (rnd() * 360).toFixed(0);
      out += `<path d="M0 0 C 6 -6, 14 -4, 18 0 C 14 4, 6 6, 0 0 Z" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${r})" fill="${C.mossLight}" opacity="0.55"/>`;
    }
    return out;
  };
  return `<svg viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0b0b0b"/>
        <stop offset="55%" stop-color="#16150f"/>
        <stop offset="100%" stop-color="${C.moss}"/>
      </linearGradient>
      <radialGradient id="moon" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${C.bloodBright}" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="${C.blood}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="mist" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${C.bone}" stop-opacity="0"/>
        <stop offset="50%" stop-color="${C.bone}" stop-opacity="0.06"/>
        <stop offset="100%" stop-color="${C.bone}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="400" height="800" fill="url(#sky)"/>
    <circle cx="300" cy="170" r="120" fill="url(#moon)"/>
    <circle cx="300" cy="170" r="26" fill="${C.blood}" opacity="0.35"/>
    ${trees(14, 560, 300, "#141412", 0.9)}
    <!-- Ruinas: arco y columnas rotas -->
    <g fill="#1b1a17" stroke="${C.goldDim}" stroke-width="0.6" stroke-opacity="0.35">
      <path d="M110 600 L110 470 Q160 410 210 470 L210 600 L192 600 L192 478 Q160 440 128 478 L128 600 Z"/>
      <rect x="236" y="520" width="16" height="80"/>
      <path d="M232 520 L256 520 L250 508 L240 512 Z"/>
      <rect x="62" y="548" width="14" height="52"/>
    </g>
    ${trees(10, 640, 360, "#0e0e0d", 1)}
    <rect y="470" width="400" height="140" fill="url(#mist)"/>
    <rect y="620" width="400" height="180" fill="#0d0d0c"/>
    ${roots()}
    ${leaves()}
    <rect y="560" width="400" height="120" fill="url(#mist)"/>
  </svg>`;
}

/** Retrato del Goblin (silueta con ojos rojos, orejas largas y cimitarra). */
function goblinPortrait(): string {
  return `<g>
    <path d="M60 128 C 40 120, 30 100, 34 84 L 8 60 L 40 70 C 44 50, 58 40, 70 40 C 82 40, 96 50, 100 70 L 132 60 L 106 84 C 110 100, 100 120, 80 128 Z" fill="${C.moss}" stroke="${C.gold}" stroke-width="1.5"/>
    <path d="M52 80 L 64 86 M88 80 L 76 86" stroke="${C.charcoal}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="58" cy="90" r="4" fill="${C.bloodBright}"/><circle cx="82" cy="90" r="4" fill="${C.bloodBright}"/>
    <path d="M58 108 Q70 116 82 108 L78 112 L74 108 L70 113 L66 108 L62 112 Z" fill="${C.bone}" opacity="0.8"/>
    <path d="M28 150 Q70 128 112 150 L112 160 L28 160 Z" fill="${C.charcoal2}" stroke="${C.goldDim}"/>
    <path d="M118 150 Q 132 110, 126 76" stroke="${C.gold}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <rect x="112" y="146" width="14" height="5" rx="2" fill="${C.goldDim}"/>
  </g>`;
}

/** Glifo genérico por tipo de criatura (si no hay retrato propio). */
function genericPortrait(label: string): string {
  return `<g>
    <circle cx="70" cy="85" r="44" fill="${C.charcoal2}" stroke="${C.gold}" stroke-width="1.5"/>
    ${runeRing(70, 85, 36, 12, C.goldDim, 0.8)}
    <text x="70" y="95" text-anchor="middle" font-family="Cinzel, serif" font-size="30" fill="${C.bone}">${label.slice(0, 1).toUpperCase()}</text>
  </g>`;
}

/** Ilustración de una criatura del bestiario (por id de ficha). */
export function creatureArtSvg(sheetId: string, label: string): string {
  const body = sheetId === "goblin-warrior" ? goblinPortrait() : genericPortrait(label);
  return `<svg viewBox="0 0 140 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}">
    <defs><radialGradient id="cg-${sheetId}" cx="50%" cy="45%" r="60%"><stop offset="0%" stop-color="${C.blood}" stop-opacity="0.45"/><stop offset="100%" stop-color="${C.charcoal}" stop-opacity="0"/></radialGradient></defs>
    <rect width="140" height="160" fill="url(#cg-${sheetId})"/>
    ${body}
  </svg>`;
}

/** Iconos de interfaz (trazo, 24x24). */
const ICONS = {
  sword: `<path d="M14.5 3H21v6.5L9.5 21 3 14.5Z M5 13l6 6 M3 21l3-3"/>`,
  shield: `<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>`,
  heart: `<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>`,
  boot: `<path d="M7 3h5v9l6 3a2 2 0 0 1 1 1.7V19H5V3z M5 15h14"/>`,
  skull: `<path d="M12 3a7 7 0 0 0-7 7c0 2.5 1.2 4 2.5 5V19h9v-4c1.3-1 2.5-2.5 2.5-5a7 7 0 0 0-7-7z M9 11h.01 M15 11h.01 M10 19v-2 M14 19v-2"/>`,
  dice: `<path d="M12 2l9 5v10l-9 5-9-5V7z M12 2v20 M3 7l18 10 M21 7L3 17"/>`,
  tree: `<path d="M12 22v-6 M12 16l-4-4 M12 13l4-4 M12 2a6 6 0 0 0-6 6c0 3 2 5 6 5s6-2 6-5a6 6 0 0 0-6-6z"/>`,
  rune: `<path d="M8 3v18 M8 9l8-6 M8 15l8 6"/>`,
  pause: `<path d="M9 5v14 M15 5v14"/>`,
  back: `<path d="M15 5l-7 7 7 7"/>`,
  plus: `<path d="M12 5v14 M5 12h14"/>`,
  minus: `<path d="M5 12h14"/>`,
  close: `<path d="M6 6l12 12 M18 6L6 18"/>`,
  scroll: `<path d="M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4z M6 4a2 2 0 0 0-2 2v2h2 M9 8h7 M9 12h7 M9 16h5"/>`,
  move: `<path d="M12 2v20 M2 12h20 M12 2l-3 3 M12 2l3 3 M12 22l-3-3 M12 22l3-3 M2 12l3-3 M2 12l3 3 M22 12l-3-3 M22 12l-3 3"/>`,
  target: `<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4 M12 19v4 M1 12h4 M19 12h4"/>`,
  zoomIn: `<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5 M11 8v6 M8 11h6"/>`,
  zoomOut: `<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5 M8 11h6"/>`,
  search: `<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/>`,
  gear: `<circle cx="12" cy="12" r="3"/><path d="M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9l2.1 2.1 M17 17l2.1 2.1 M4.9 19.1L7 17 M17 7l2.1-2.1"/>`,
} as const;

export type IconName = keyof typeof ICONS;

export function iconSvg(name: IconName, size = 20): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

/** Banda decorativa de runas para separar secciones. */
export function runeBandSvg(width = 240): string {
  const count = Math.floor(width / 18);
  let out = "";
  for (let i = 0; i < count; i++) {
    out += `<path d="${RUNE_PATHS[(i * 3) % RUNE_PATHS.length]}" transform="translate(${9 + i * 18} 9) scale(0.9)" stroke="${C.goldDim}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`;
  }
  return `<svg viewBox="0 0 ${width} 18" width="${width}" height="18" aria-hidden="true">${out}</svg>`;
}
