import { h, button, numberField, select, svg, textField } from "../dom";
import { iconSvg } from "../art/art";
import { CLASS_LABEL, DAMAGE_LABEL, PARTY_ISSUE, SIZE_LABEL, spellSummary } from "../i18n/es";
import { setupFrame } from "../components/setupFrame";
import type { AppModel } from "../state";
import { CHARACTER_CLASSES, SPELL_CATALOG, attacksFromWeapons, characterLevelOf, partyMemberIssues } from "../../src/ui-bridge";
import { spellSheet } from "../components/spellSheet";
import { weaponSheet } from "../components/weaponSheet";
import type { CreatureSize, DamageType, PartyAttackInput, PartyClassInput, PartyMemberInput } from "../../src/ui-bridge";

const SIZES: readonly CreatureSize[] = ["small", "medium", "large"];
const DAMAGE_TYPES = Object.keys(DAMAGE_LABEL) as DamageType[];

/** Panel abierto ("Añadir ataques" o "Añadir conjuros") y de qué personaje (estado de la interfaz). */
let sheetFor: { readonly key: string; readonly kind: "weapons" | "spells" } | null = null;

/** Clase y nivel, con botón de multiclase. */
function classSection(member: PartyMemberInput, update: (change: Partial<PartyMemberInput>) => void): HTMLElement {
  const classes = member.classes ?? [];
  const used = new Set(classes.map((c) => c.classId));
  const setRow = (i: number, change: Partial<PartyClassInput>): void => update({ classes: classes.map((c, j) => (j === i ? { ...c, ...change } : c)) });
  const firstFree = CHARACTER_CLASSES.find((c) => !used.has(c)) ?? "fighter";
  const total = classes.reduce((n, c) => n + (Number.isFinite(c.level) ? c.level : 0), 0);
  return h(
    "div",
    { class: "class-section" },
    h("div", { class: "attacks-head" }, h("h4", { class: "attacks-title", text: "Clase" }), total > 0 ? h("span", { class: "muted small", text: `Nivel de personaje ${total}` }) : null),
    ...classes.map((c, i) =>
      h(
        "div",
        { class: "class-row" },
        h("label", { class: "field" }, i === 0 ? "Clase" : "Multiclase", select(CHARACTER_CLASSES.filter((id) => id === c.classId || !used.has(id)).map((id) => ({ value: id, label: CLASS_LABEL[id] })), c.classId, (v) => setRow(i, { classId: v }), "Clase")),
        numberField("Nivel", c.level, (n) => setRow(i, { level: n }), { min: 1, max: 20 }),
        button("", () => update({ classes: classes.filter((_, j) => j !== i) }), { class: "btn-ghost btn-icon", icon: svg(iconSvg("close", 18)), ariaLabel: `Quitar ${CLASS_LABEL[c.classId]}` }),
      ),
    ),
    button(classes.length === 0 ? "Elegir clase" : "Multiclase", () => update({ classes: [...classes, { classId: firstFree, level: 1 }] }), { class: "btn-small btn-ghost", icon: svg(iconSvg("plus", 18)) }),
  );
}

/** Conjuros de daño elegidos y la CD de salvación si hace falta. */
function spellSection(member: PartyMemberInput, update: (change: Partial<PartyMemberInput>) => void, openSheet: () => void): HTMLElement {
  const ids = member.spellIds ?? [];
  const spells = ids.flatMap((id) => SPELL_CATALOG.filter((s) => s.id === id));
  const needsDc = spells.some((s) => s.effect.kind === "save");
  const beams = beamsFor(member);
  return h(
    "div",
    { class: "spell-section" },
    h("div", { class: "attacks-head" }, h("h4", { class: "attacks-title", text: "Conjuros de daño" }), h("span", { class: "muted small", text: "Del SRD 5.2.1. El jugador tira el ataque o el daño; los monstruos tiran sus salvaciones." })),
    ...spells.map((s) =>
      h(
        "div",
        { class: "attack-line" },
        svg(iconSvg("rune", 18)),
        h("div", { class: "attack-text" }, h("span", { class: "attack-name", text: `${s.label}${s.level === 0 ? " (truco)" : ` (nivel ${s.level})`}` }), h("span", { class: "muted small", text: spellSummary(s, beams) })),
        button("", () => update({ spellIds: ids.filter((x) => x !== s.id) }), { class: "btn-ghost btn-icon", icon: svg(iconSvg("close", 18)), ariaLabel: `Quitar ${s.label}` }),
      ),
    ),
    needsDc ? numberField("CD de salvación de conjuros", member.spellSaveDc ?? Number.NaN, (n) => update({ spellSaveDc: Number.isNaN(n) ? null : n }), { min: 1, max: 30 }) : null,
    button("Añadir conjuros", openSheet, { class: "btn-small", icon: svg(iconSvg("rune", 18)) }),
  );
}

/** Rayos de Descarga sobrenatural según el nivel de personaje (para mostrar). */
function beamsFor(member: PartyMemberInput): number {
  const level = characterLevelOf(member);
  return level >= 17 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1;
}

/** "Cuerpo a cuerpo, alcance 10 pies, cortante" / "A distancia 150/600 pies, perforante". */
function attackSummary(a: PartyAttackInput): string {
  const where = a.mode === "melee" ? `Cuerpo a cuerpo, alcance ${a.normalFeet} pies` : `A distancia ${a.normalFeet}${a.longFeet ? `/${a.longFeet}` : ""} pies`;
  return `${where}, ${DAMAGE_LABEL[a.damageType].toLowerCase()}`;
}

/** Clave estable para un personaje nuevo (sin azar: hora y contador). */
let counter = 0;
const newKey = (): string => `pj-${Date.now().toString(36)}-${++counter}`;

/** Pantalla 3 — Los aventureros. No es un gestor de hojas: solo lo que usa el motor. */
export function partyScreen(model: AppModel): HTMLElement {
  const roster = model.roster;
  const inParty = new Set(model.draft.partyKeys);
  const update = (member: PartyMemberInput, change: Partial<PartyMemberInput>): void =>
    model.setRoster(roster.map((p) => (p.key === member.key ? { ...p, ...change } : p)));
  const toggle = (member: PartyMemberInput): void => {
    const keys = inParty.has(member.key) ? model.draft.partyKeys.filter((k) => k !== member.key) : [...model.draft.partyKeys, member.key];
    model.setDraft({ partyKeys: keys });
  };

  const card = (member: PartyMemberInput): HTMLElement => {
    const issues = partyMemberIssues(member);
    const chosen = inParty.has(member.key);
    const setAttack = (i: number, change: Partial<PartyAttackInput>): void =>
      update(member, { attacks: member.attacks.map((a, j) => (j === i ? { ...a, ...change } : a)) });
    return h(
      "article",
      { class: `pc-card frame ${chosen ? "chosen" : ""}` },
      h(
        "div",
        { class: "pc-head" },
        h("div", { class: "pc-name" }, h("h3", { text: member.label || "Sin nombre" }), member.description ? h("span", { class: "muted small", text: member.description }) : null),
        button(chosen ? "En la partida" : "Añadir a la partida", () => toggle(member), { class: `btn-small ${chosen ? "selected" : ""}` }),
      ),
      h(
        "div",
        { class: "form-grid" },
        textField("Nombre", member.label, (v) => update(member, { label: v })),
        textField("Descripción (opcional)", member.description, (v) => update(member, { description: v })),
        h("label", { class: "field" }, "Tamaño", select(SIZES.map((s) => ({ value: s, label: SIZE_LABEL[s] })), member.size, (v) => update(member, { size: v }), "Tamaño")),
        numberField("PG máximos", member.maxHitPoints, (n) => update(member, { maxHitPoints: n, currentHitPoints: member.currentHitPoints === member.maxHitPoints || member.currentHitPoints > n ? n : member.currentHitPoints }), { min: 1, max: 999 }),
        numberField("PG actuales", member.currentHitPoints, (n) => update(member, { currentHitPoints: n }), { min: 0, max: 999 }),
        numberField("CA", member.armorClass, (n) => update(member, { armorClass: n }), { min: 1, max: 40 }),
        numberField("Velocidad (pies)", member.speedFeet, (n) => update(member, { speedFeet: n }), { min: 0, max: 240, step: 5 }),
      ),
      classSection(member, (change) => update(member, change)),
      h(
        "div",
        { class: "attacks-head" },
        h("h4", { class: "attacks-title", text: "Ataques" }),
        h("span", { class: "muted small", text: "Golpe sin armas (5 pies) va incluido siempre. Las tiradas y el daño se hacen con dados físicos." }),
      ),
      ...member.attacks.map((attack, i) => {
        const remove = button("", () => update(member, { attacks: member.attacks.filter((_, j) => j !== i) }), { class: "btn-ghost btn-icon", icon: svg(iconSvg("close", 18)), ariaLabel: `Quitar ${attack.label || "ataque"}` });
        if (attack.weaponId !== undefined) {
          return h(
            "div",
            { class: "attack-line" },
            svg(iconSvg(attack.mode === "melee" ? "sword" : "target", 18)),
            h("div", { class: "attack-text" }, h("span", { class: "attack-name", text: attack.label }), h("span", { class: "muted small", text: attackSummary(attack) })),
            remove,
          );
        }
        // Ataque personalizado: lo justo (nombre, tipo y alcance); el resto en "Más".
        return h(
          "div",
          { class: "attack-row" },
          textField("Ataque", attack.label, (v) => setAttack(i, { label: v })),
          h("label", { class: "field" }, "Tipo", select([{ value: "melee", label: "Cuerpo a cuerpo" }, { value: "ranged", label: "A distancia" }] as const, attack.mode, (v) => setAttack(i, { mode: v, longFeet: v === "melee" ? null : attack.longFeet, normalFeet: v === "melee" ? 5 : Math.max(attack.normalFeet, 30) }), "Tipo de ataque")),
          numberField(attack.mode === "melee" ? "Alcance (pies)" : "Distancia (pies)", attack.normalFeet, (n) => setAttack(i, { normalFeet: n }), { min: 5, step: 5 }),
          h(
            "details",
            { class: "attack-more" },
            h("summary", { text: "Más" }),
            attack.mode === "ranged" ? numberField("Distancia larga (opcional)", attack.longFeet ?? Number.NaN, (n) => setAttack(i, { longFeet: Number.isNaN(n) ? null : n }), { min: 5, step: 5 }) : null,
            h("label", { class: "field" }, "Tipo de daño", select(DAMAGE_TYPES.map((d) => ({ value: d, label: DAMAGE_LABEL[d] })), attack.damageType, (v) => setAttack(i, { damageType: v }), "Tipo de daño")),
          ),
          remove,
        );
      }),
      spellSection(member, (change) => update(member, change), () => {
        sheetFor = { key: member.key, kind: "spells" };
        model.notify();
      }),
      h(
        "div",
        { class: "row" },
        button("Añadir ataques", () => {
          sheetFor = { key: member.key, kind: "weapons" };
          model.notify();
        }, { class: "btn-small", icon: svg(iconSvg("sword", 18)) }),
        button("Borrar personaje", () => {
          model.setRoster(roster.filter((p) => p.key !== member.key));
          model.setDraft({ partyKeys: model.draft.partyKeys.filter((k) => k !== member.key) });
        }, { class: "btn-small btn-ghost danger" }),
      ),
      issues.length > 0 ? h("ul", { class: "issues danger small" }, ...issues.map((i) => h("li", { text: PARTY_ISSUE[i] }))) : null,
    );
  };

  const party = model.party();
  const problems = party.some((p) => partyMemberIssues(p).length > 0);
  const level = numberField("Nivel del grupo", model.draft.partyLevel, (n) => model.setDraft({ partyLevel: n }), { min: 1, max: 20 });
  const levelOk = Number.isInteger(model.draft.partyLevel) && model.draft.partyLevel >= 1 && model.draft.partyLevel <= 20;

  const content = h(
    "div",
    { class: "stack" },
    h(
      "section",
      { class: "frame party-level" },
      level,
      h("p", { class: "muted small", text: "Los monstruos suponen la CA y los PG de los aventureros según este nivel hasta que los observan." }),
    ),
    ...roster.map(card),
    button("Nuevo aventurero", () => {
      const member: PartyMemberInput = { key: newKey(), label: "", description: "", size: "medium", maxHitPoints: 0, currentHitPoints: 0, armorClass: 0, speedFeet: 30, attacks: [] };
      model.setRoster([...roster, member]);
      model.setDraft({ partyKeys: [...model.draft.partyKeys, member.key] });
    }, { class: "btn-wide", icon: svg(iconSvg("plus")) }),
  );
  const hint = party.length === 0 ? "Añade al menos un aventurero" : problems ? "Completa los datos de los aventureros elegidos" : !levelOk ? "Nivel del grupo entre 1 y 20" : undefined;
  const sheetMember = roster.find((p) => p.key === sheetFor?.key);
  const close = (): void => {
    sheetFor = null;
    model.notify();
  };
  const sheet = sheetMember && sheetFor?.kind === "spells"
    ? spellSheet({
        characterName: sheetMember.label || "este aventurero",
        classes: (sheetMember.classes ?? []).map((c) => c.classId),
        alreadyChosen: sheetMember.spellIds ?? [],
        beams: beamsFor(sheetMember),
        onClose: close,
        onAdd: (ids) => {
          sheetFor = null;
          update(sheetMember, { spellIds: [...(sheetMember.spellIds ?? []), ...ids] });
        },
      })
    : sheetMember
    ? weaponSheet({
        characterName: sheetMember.label || "este aventurero",
        onClose: close,
        onAdd: (ids) => {
          sheetFor = null;
          update(sheetMember, { attacks: [...sheetMember.attacks, ...attacksFromWeapons(ids)] });
        },
        onCustom: () => {
          sheetFor = null;
          update(sheetMember, { attacks: [...sheetMember.attacks, { label: "", mode: "melee", normalFeet: 5, longFeet: null, damageType: "bludgeoning" }] });
        },
      })
    : null;
  const frame = setupFrame(model, "party", "Los aventureros", content, {
    label: "Continuar",
    onClick: () => model.go("difficulty"),
    disabled: hint !== undefined,
    ...(hint ? { hint } : {}),
  });
  if (sheet) frame.append(sheet);
  return frame;
}
