import type { AbilityId, AreaShape, DamageType, DiceExpression } from "../models";

/**
 * CONJUROS DE DAÑO PARA PERSONAJES. REGLA OFICIAL VERIFICADA: SRD 5.2.1
 * (CC-BY-4.0), "Spell Descriptions", leído del PDF oficial el 2026-11-24.
 * Solo conjuros de daño instantáneo por tirada de ataque o por salvación que
 * el motor puede representar con fidelidad (decisión de la jugadora
 * 2026-11-24: "ataques + salvación y área"). Lo que el motor aún no aplica de
 * cada conjuro va en `unmodeled` (se muestra a la persona).
 * - Lanzar un conjuro con tiempo de lanzamiento de una acción es la acción
 *   Magia (glosario 2024, "Magic [Action]").
 * - Los dados de daño los tira el jugador: los de aquí sirven para mostrar.
 * - No se lleva la cuenta de espacios de conjuro ni se lanza a nivel superior
 *   (PENDIENTE, decisión 130).
 * Los nombres en español son etiquetas (PENDIENTE DE VALIDAR).
 */

/** Las 12 clases del SRD 5.2.1. */
export const CHARACTER_CLASSES = [
  "barbarian",
  "bard",
  "cleric",
  "druid",
  "fighter",
  "monk",
  "paladin",
  "ranger",
  "rogue",
  "sorcerer",
  "warlock",
  "wizard",
] as const;
export type CharacterClassId = (typeof CHARACTER_CLASSES)[number];

export interface SpellDamage {
  readonly dice: DiceExpression;
  readonly bonus: number;
  readonly type: DamageType;
}

export type SpellEffect =
  | {
      readonly kind: "attack";
      readonly mode: "melee" | "ranged";
      /** Pies (Toque = 5: una criatura a tu alcance). */
      readonly rangeFeet: number;
      readonly damage: readonly SpellDamage[];
      /** Ataques por lanzamiento; "beams": 1, 2, 3 o 4 según el nivel del personaje (5, 11, 17). */
      readonly attacks: number | "beams";
    }
  | {
      readonly kind: "save";
      readonly ability: AbilityId;
      /** "half": mitad del daño si la supera; "negates": nada si la supera. */
      readonly onSuccess: "half" | "negates";
      readonly damage: readonly SpellDamage[];
      readonly targeting:
        | { readonly kind: "creature"; readonly rangeFeet: number }
        | { readonly kind: "area"; readonly shape: AreaShape; readonly sizeFeet: number; readonly rangeFeet: number; readonly widthFeet?: number };
    };

export interface SpellEntry {
  readonly id: string;
  /** Nombre oficial en inglés (SRD). */
  readonly name: string;
  readonly label: string;
  /** 0 = truco. */
  readonly level: number;
  readonly classes: readonly CharacterClassId[];
  readonly effect: SpellEffect;
  /** Partes del conjuro que el motor aún no aplica. */
  readonly unmodeled: readonly string[];
}

const dmg = (count: number, sides: number, type: DamageType, bonus = 0): SpellDamage => ({ dice: { count, sides }, bonus, type });
const area = (shape: AreaShape, sizeFeet: number, rangeFeet: number, widthFeet?: number) =>
  ({ kind: "area" as const, shape, sizeFeet, rangeFeet, ...(widthFeet ? { widthFeet } : {}) });

export const SPELLS_2024: readonly SpellEntry[] = [
  // --- Ataques de conjuro ---
  { id: "fire-bolt", name: "Fire Bolt", label: "Rayo de fuego", level: 0, classes: ["sorcerer", "wizard"], effect: { kind: "attack", mode: "ranged", rangeFeet: 120, damage: [dmg(1, 10, "fire")], attacks: 1 }, unmodeled: [] },
  { id: "chill-touch", name: "Chill Touch", label: "Toque helado", level: 0, classes: ["sorcerer", "warlock", "wizard"], effect: { kind: "attack", mode: "melee", rangeFeet: 5, damage: [dmg(1, 10, "necrotic")], attacks: 1 }, unmodeled: ["No puede recuperar PG hasta el final de tu siguiente turno"] },
  { id: "eldritch-blast", name: "Eldritch Blast", label: "Descarga sobrenatural", level: 0, classes: ["warlock"], effect: { kind: "attack", mode: "ranged", rangeFeet: 120, damage: [dmg(1, 10, "force")], attacks: "beams" }, unmodeled: [] },
  { id: "poison-spray", name: "Poison Spray", label: "Rociada venenosa", level: 0, classes: ["druid", "sorcerer", "warlock", "wizard"], effect: { kind: "attack", mode: "ranged", rangeFeet: 30, damage: [dmg(1, 12, "poison")], attacks: 1 }, unmodeled: [] },
  { id: "ray-of-frost", name: "Ray of Frost", label: "Rayo de escarcha", level: 0, classes: ["sorcerer", "wizard"], effect: { kind: "attack", mode: "ranged", rangeFeet: 60, damage: [dmg(1, 8, "cold")], attacks: 1 }, unmodeled: ["−10 pies de Velocidad hasta el inicio de tu siguiente turno"] },
  { id: "shocking-grasp", name: "Shocking Grasp", label: "Agarre electrizante", level: 0, classes: ["sorcerer", "wizard"], effect: { kind: "attack", mode: "melee", rangeFeet: 5, damage: [dmg(1, 8, "lightning")], attacks: 1 }, unmodeled: ["No puede hacer ataques de oportunidad hasta el inicio de su siguiente turno"] },
  { id: "starry-wisp", name: "Starry Wisp", label: "Chispa estelar", level: 0, classes: ["bard", "druid"], effect: { kind: "attack", mode: "ranged", rangeFeet: 60, damage: [dmg(1, 8, "radiant")], attacks: 1 }, unmodeled: ["Emite luz tenue y no puede beneficiarse de Invisible"] },
  { id: "guiding-bolt", name: "Guiding Bolt", label: "Saeta guía", level: 1, classes: ["cleric"], effect: { kind: "attack", mode: "ranged", rangeFeet: 120, damage: [dmg(4, 6, "radiant")], attacks: 1 }, unmodeled: ["El siguiente ataque contra el objetivo tiene Ventaja"] },
  { id: "ray-of-sickness", name: "Ray of Sickness", label: "Rayo nauseabundo", level: 1, classes: ["sorcerer", "wizard"], effect: { kind: "attack", mode: "ranged", rangeFeet: 60, damage: [dmg(2, 8, "poison")], attacks: 1 }, unmodeled: ["Envenenado hasta el final de tu siguiente turno"] },
  { id: "acid-arrow", name: "Acid Arrow", label: "Flecha ácida", level: 2, classes: ["wizard"], effect: { kind: "attack", mode: "ranged", rangeFeet: 90, damage: [dmg(4, 4, "acid")], attacks: 1 }, unmodeled: ["2d4 de ácido al final de su siguiente turno", "Mitad del daño inicial si falla"] },
  { id: "scorching-ray", name: "Scorching Ray", label: "Rayo abrasador", level: 2, classes: ["sorcerer", "wizard"], effect: { kind: "attack", mode: "ranged", rangeFeet: 120, damage: [dmg(2, 6, "fire")], attacks: 3 }, unmodeled: [] },
  // --- Salvación, un objetivo ---
  { id: "sacred-flame", name: "Sacred Flame", label: "Llama sagrada", level: 0, classes: ["cleric"], effect: { kind: "save", ability: "dex", onSuccess: "negates", damage: [dmg(1, 8, "radiant")], targeting: { kind: "creature", rangeFeet: 60 } }, unmodeled: [] },
  { id: "vicious-mockery", name: "Vicious Mockery", label: "Burla cruel", level: 0, classes: ["bard"], effect: { kind: "save", ability: "wis", onSuccess: "negates", damage: [dmg(1, 6, "psychic")], targeting: { kind: "creature", rangeFeet: 60 } }, unmodeled: ["Desventaja en su siguiente tirada de ataque"] },
  { id: "inflict-wounds", name: "Inflict Wounds", label: "Infligir heridas", level: 1, classes: ["cleric"], effect: { kind: "save", ability: "con", onSuccess: "half", damage: [dmg(2, 10, "necrotic")], targeting: { kind: "creature", rangeFeet: 5 } }, unmodeled: [] },
  { id: "dissonant-whispers", name: "Dissonant Whispers", label: "Susurros disonantes", level: 1, classes: ["bard"], effect: { kind: "save", ability: "wis", onSuccess: "half", damage: [dmg(3, 6, "psychic")], targeting: { kind: "creature", rangeFeet: 60 } }, unmodeled: ["Si falla, usa su reacción para alejarse de ti"] },
  { id: "blight", name: "Blight", label: "Plaga", level: 4, classes: ["druid", "sorcerer", "warlock", "wizard"], effect: { kind: "save", ability: "con", onSuccess: "half", damage: [dmg(8, 8, "necrotic")], targeting: { kind: "creature", rangeFeet: 30 } }, unmodeled: ["Una criatura Planta falla automáticamente"] },
  { id: "disintegrate", name: "Disintegrate", label: "Desintegrar", level: 6, classes: ["sorcerer", "wizard"], effect: { kind: "save", ability: "dex", onSuccess: "negates", damage: [dmg(10, 6, "force", 40)], targeting: { kind: "creature", rangeFeet: 60 } }, unmodeled: ["Si queda a 0 PG, se desintegra"] },
  { id: "finger-of-death", name: "Finger of Death", label: "Dedo de la muerte", level: 7, classes: ["sorcerer", "warlock", "wizard"], effect: { kind: "save", ability: "con", onSuccess: "half", damage: [dmg(7, 8, "necrotic", 30)], targeting: { kind: "creature", rangeFeet: 60 } }, unmodeled: ["Un Humanoide muerto se alza como Zombi"] },
  { id: "befuddlement", name: "Befuddlement", label: "Desconcierto", level: 8, classes: ["bard", "druid", "warlock", "wizard"], effect: { kind: "save", ability: "int", onSuccess: "half", damage: [dmg(10, 12, "psychic")], targeting: { kind: "creature", rangeFeet: 150 } }, unmodeled: ["Si falla, no puede lanzar conjuros ni usar la acción Magia"] },
  // --- Salvación, área ---
  { id: "acid-splash", name: "Acid Splash", label: "Salpicadura ácida", level: 0, classes: ["sorcerer", "wizard"], effect: { kind: "save", ability: "dex", onSuccess: "negates", damage: [dmg(1, 6, "acid")], targeting: area("sphere", 5, 60) }, unmodeled: [] },
  { id: "burning-hands", name: "Burning Hands", label: "Manos ardientes", level: 1, classes: ["sorcerer", "wizard"], effect: { kind: "save", ability: "dex", onSuccess: "half", damage: [dmg(3, 6, "fire")], targeting: area("cone", 15, 0) }, unmodeled: [] },
  { id: "thunderwave", name: "Thunderwave", label: "Ola atronadora", level: 1, classes: ["bard", "druid", "sorcerer", "wizard"], effect: { kind: "save", ability: "con", onSuccess: "half", damage: [dmg(2, 8, "thunder")], targeting: area("cube", 15, 0) }, unmodeled: ["Si falla, es empujado 10 pies"] },
  { id: "shatter", name: "Shatter", label: "Estallar", level: 2, classes: ["bard", "sorcerer", "wizard"], effect: { kind: "save", ability: "con", onSuccess: "half", damage: [dmg(3, 8, "thunder")], targeting: area("sphere", 10, 60) }, unmodeled: ["Un Constructo tiene Desventaja en la salvación"] },
  { id: "fireball", name: "Fireball", label: "Bola de fuego", level: 3, classes: ["sorcerer", "wizard"], effect: { kind: "save", ability: "dex", onSuccess: "half", damage: [dmg(8, 6, "fire")], targeting: area("sphere", 20, 150) }, unmodeled: [] },
  { id: "lightning-bolt", name: "Lightning Bolt", label: "Relámpago", level: 3, classes: ["sorcerer", "wizard"], effect: { kind: "save", ability: "dex", onSuccess: "half", damage: [dmg(8, 6, "lightning")], targeting: area("line", 100, 0, 5) }, unmodeled: [] },
  { id: "ice-storm", name: "Ice Storm", label: "Tormenta de hielo", level: 4, classes: ["druid", "sorcerer", "wizard"], effect: { kind: "save", ability: "dex", onSuccess: "half", damage: [dmg(2, 10, "bludgeoning"), dmg(4, 6, "cold")], targeting: area("cylinder", 20, 300) }, unmodeled: ["El suelo queda como terreno difícil"] },
  { id: "vitriolic-sphere", name: "Vitriolic Sphere", label: "Esfera vitriólica", level: 4, classes: ["sorcerer", "wizard"], effect: { kind: "save", ability: "dex", onSuccess: "half", damage: [dmg(10, 4, "acid")], targeting: area("sphere", 20, 150) }, unmodeled: ["5d4 de ácido más al final de su siguiente turno si falla"] },
  { id: "cone-of-cold", name: "Cone of Cold", label: "Cono de frío", level: 5, classes: ["druid", "sorcerer", "wizard"], effect: { kind: "save", ability: "con", onSuccess: "half", damage: [dmg(8, 8, "cold")], targeting: area("cone", 60, 0) }, unmodeled: [] },
  { id: "flame-strike", name: "Flame Strike", label: "Golpe flamígero", level: 5, classes: ["cleric"], effect: { kind: "save", ability: "dex", onSuccess: "half", damage: [dmg(5, 6, "fire"), dmg(5, 6, "radiant")], targeting: area("cylinder", 10, 60) }, unmodeled: [] },
  { id: "circle-of-death", name: "Circle of Death", label: "Círculo de muerte", level: 6, classes: ["sorcerer", "warlock", "wizard"], effect: { kind: "save", ability: "con", onSuccess: "half", damage: [dmg(8, 8, "necrotic")], targeting: area("sphere", 60, 150) }, unmodeled: [] },
  { id: "freezing-sphere", name: "Freezing Sphere", label: "Esfera congelante", level: 6, classes: ["sorcerer", "wizard"], effect: { kind: "save", ability: "con", onSuccess: "half", damage: [dmg(10, 6, "cold")], targeting: area("sphere", 60, 300) }, unmodeled: ["Congela el agua y puede guardarse como globo"] },
  { id: "sunburst", name: "Sunburst", label: "Resplandor solar", level: 8, classes: ["cleric", "druid", "sorcerer", "wizard"], effect: { kind: "save", ability: "con", onSuccess: "half", damage: [dmg(12, 6, "radiant")], targeting: area("sphere", 60, 150) }, unmodeled: ["Si falla, queda Cegado 1 minuto (repite la salvación)"] },
];

/** Rayos de Descarga sobrenatural según el nivel del personaje (SRD: 2 a nivel 5, 3 a 11, 4 a 17). */
export function beamsForCharacterLevel(level: number): number {
  return level >= 17 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1;
}

/**
 * Daño de un conjuro para un personaje de este nivel. REGLA OFICIAL
 * VERIFICADA (SRD 5.2.1, "Cantrip Upgrade"): el daño de los trucos aumenta un
 * dado a los niveles de personaje 5, 11 y 17 (todos los trucos del catálogo
 * tienen un solo dado). Descarga sobrenatural no sube de dados: añade rayos.
 * Los conjuros de nivel 1 o más se lanzan con su espacio base (sin subir de nivel).
 */
export function spellDamageAtLevel(spell: SpellEntry, characterLevel: number): readonly SpellDamage[] {
  const effect = spell.effect;
  if (spell.level !== 0 || (effect.kind === "attack" && effect.attacks === "beams")) return effect.damage;
  const tier = beamsForCharacterLevel(characterLevel);
  return effect.damage.map((d) => ({ ...d, dice: { ...d.dice, count: d.dice.count * tier } }));
}
