import type { DamageType, DiceExpression } from "../models";

/**
 * TABLA DE ARMAS 2024. REGLA OFICIAL VERIFICADA (Basic Rules 2024,
 * "Equipment", tabla "Weapons", leída en D&D Beyond el 2026-11-24): daño,
 * tipo de daño y propiedades que usa el motor (Alcance y distancias de
 * Arrojadiza y Munición).
 * - Reach: "adds 5 feet to your reach when you attack with it, as well as
 *   when determining your reach for Opportunity Attacks with it".
 * - Thrown: se puede lanzar para hacer un ataque a distancia; un arma
 *   cuerpo a cuerpo arrojadiza sirve para los dos ataques.
 * - Range: "(normal/larga)"; más allá de la normal, Desventaja; nunca más
 *   allá de la larga.
 * Los nombres en español son etiquetas (PENDIENTE DE VALIDAR contra la
 * traducción oficial); el programa nunca los interpreta.
 */
export interface WeaponEntry {
  readonly id: string;
  readonly label: string;
  readonly category: "simple" | "martial";
  /** Cuerpo a cuerpo o a distancia (columna de la tabla). */
  readonly kind: "melee" | "ranged";
  readonly damage: DiceExpression;
  /** Daño fijo añadido (la Cerbatana hace 1). */
  readonly damageBonus?: number;
  readonly damageType: DamageType;
  /** Propiedad Alcance (+5 pies). */
  readonly reach?: boolean;
  /** Distancias de Arrojadiza o Munición (pies). */
  readonly range?: { readonly normal: number; readonly long: number };
  /** Tiene la propiedad Arrojadiza. */
  readonly thrown?: boolean;
}

const d = (count: number, sides: number): DiceExpression => ({ count, sides });

export const WEAPONS_2024: readonly WeaponEntry[] = [
  // Armas sencillas cuerpo a cuerpo
  { id: "club", label: "Garrote", category: "simple", kind: "melee", damage: d(1, 4), damageType: "bludgeoning" },
  { id: "dagger", label: "Daga", category: "simple", kind: "melee", damage: d(1, 4), damageType: "piercing", thrown: true, range: { normal: 20, long: 60 } },
  { id: "greatclub", label: "Gran clava", category: "simple", kind: "melee", damage: d(1, 8), damageType: "bludgeoning" },
  { id: "handaxe", label: "Hacha de mano", category: "simple", kind: "melee", damage: d(1, 6), damageType: "slashing", thrown: true, range: { normal: 20, long: 60 } },
  { id: "javelin", label: "Jabalina", category: "simple", kind: "melee", damage: d(1, 6), damageType: "piercing", thrown: true, range: { normal: 30, long: 120 } },
  { id: "light-hammer", label: "Martillo ligero", category: "simple", kind: "melee", damage: d(1, 4), damageType: "bludgeoning", thrown: true, range: { normal: 20, long: 60 } },
  { id: "mace", label: "Maza", category: "simple", kind: "melee", damage: d(1, 6), damageType: "bludgeoning" },
  { id: "quarterstaff", label: "Bastón", category: "simple", kind: "melee", damage: d(1, 6), damageType: "bludgeoning" },
  { id: "sickle", label: "Hoz", category: "simple", kind: "melee", damage: d(1, 4), damageType: "slashing" },
  { id: "spear", label: "Lanza", category: "simple", kind: "melee", damage: d(1, 6), damageType: "piercing", thrown: true, range: { normal: 20, long: 60 } },
  // Armas sencillas a distancia
  { id: "dart", label: "Dardo", category: "simple", kind: "ranged", damage: d(1, 4), damageType: "piercing", thrown: true, range: { normal: 20, long: 60 } },
  { id: "light-crossbow", label: "Ballesta ligera", category: "simple", kind: "ranged", damage: d(1, 8), damageType: "piercing", range: { normal: 80, long: 320 } },
  { id: "shortbow", label: "Arco corto", category: "simple", kind: "ranged", damage: d(1, 6), damageType: "piercing", range: { normal: 80, long: 320 } },
  { id: "sling", label: "Honda", category: "simple", kind: "ranged", damage: d(1, 4), damageType: "bludgeoning", range: { normal: 30, long: 120 } },
  // Armas marciales cuerpo a cuerpo
  { id: "battleaxe", label: "Hacha de batalla", category: "martial", kind: "melee", damage: d(1, 8), damageType: "slashing" },
  { id: "flail", label: "Mangual", category: "martial", kind: "melee", damage: d(1, 8), damageType: "bludgeoning" },
  { id: "glaive", label: "Guja", category: "martial", kind: "melee", damage: d(1, 10), damageType: "slashing", reach: true },
  { id: "greataxe", label: "Gran hacha", category: "martial", kind: "melee", damage: d(1, 12), damageType: "slashing" },
  { id: "greatsword", label: "Espadón", category: "martial", kind: "melee", damage: d(2, 6), damageType: "slashing" },
  { id: "halberd", label: "Alabarda", category: "martial", kind: "melee", damage: d(1, 10), damageType: "slashing", reach: true },
  { id: "lance", label: "Lanza de caballería", category: "martial", kind: "melee", damage: d(1, 10), damageType: "piercing", reach: true },
  { id: "longsword", label: "Espada larga", category: "martial", kind: "melee", damage: d(1, 8), damageType: "slashing" },
  { id: "maul", label: "Mazo", category: "martial", kind: "melee", damage: d(2, 6), damageType: "bludgeoning" },
  { id: "morningstar", label: "Lucero del alba", category: "martial", kind: "melee", damage: d(1, 8), damageType: "piercing" },
  { id: "pike", label: "Pica", category: "martial", kind: "melee", damage: d(1, 10), damageType: "piercing", reach: true },
  { id: "rapier", label: "Estoque", category: "martial", kind: "melee", damage: d(1, 8), damageType: "piercing" },
  { id: "scimitar", label: "Cimitarra", category: "martial", kind: "melee", damage: d(1, 6), damageType: "slashing" },
  { id: "shortsword", label: "Espada corta", category: "martial", kind: "melee", damage: d(1, 6), damageType: "piercing" },
  { id: "trident", label: "Tridente", category: "martial", kind: "melee", damage: d(1, 8), damageType: "piercing", thrown: true, range: { normal: 20, long: 60 } },
  { id: "warhammer", label: "Martillo de guerra", category: "martial", kind: "melee", damage: d(1, 8), damageType: "bludgeoning" },
  { id: "war-pick", label: "Pico de guerra", category: "martial", kind: "melee", damage: d(1, 8), damageType: "piercing" },
  { id: "whip", label: "Látigo", category: "martial", kind: "melee", damage: d(1, 4), damageType: "slashing", reach: true },
  // Armas marciales a distancia
  { id: "blowgun", label: "Cerbatana", category: "martial", kind: "ranged", damage: d(0, 1), damageBonus: 1, damageType: "piercing", range: { normal: 25, long: 100 } },
  { id: "hand-crossbow", label: "Ballesta de mano", category: "martial", kind: "ranged", damage: d(1, 6), damageType: "piercing", range: { normal: 30, long: 120 } },
  { id: "heavy-crossbow", label: "Ballesta pesada", category: "martial", kind: "ranged", damage: d(1, 10), damageType: "piercing", range: { normal: 100, long: 400 } },
  { id: "longbow", label: "Arco largo", category: "martial", kind: "ranged", damage: d(1, 8), damageType: "piercing", range: { normal: 150, long: 600 } },
  { id: "musket", label: "Mosquete", category: "martial", kind: "ranged", damage: d(1, 12), damageType: "piercing", range: { normal: 40, long: 120 } },
  { id: "pistol", label: "Pistola", category: "martial", kind: "ranged", damage: d(1, 10), damageType: "piercing", range: { normal: 30, long: 90 } },
];

/**
 * Ataques que da un arma (alcance o distancias y tipo de daño):
 * - cuerpo a cuerpo: alcance 5 pies, o 10 con la propiedad Alcance;
 * - a distancia: sus distancias;
 * - cuerpo a cuerpo arrojadiza: los dos ataques (golpear y lanzar).
 */
export function weaponAttacks(weapon: WeaponEntry): readonly {
  readonly mode: "melee" | "ranged";
  readonly normalFeet: number;
  readonly longFeet: number | null;
  readonly thrown: boolean;
}[] {
  if (weapon.kind === "ranged") {
    return [{ mode: "ranged", normalFeet: weapon.range?.normal ?? 5, longFeet: weapon.range?.long ?? null, thrown: weapon.thrown === true }];
  }
  const melee = { mode: "melee" as const, normalFeet: weapon.reach ? 10 : 5, longFeet: null, thrown: false };
  if (!weapon.thrown || !weapon.range) return [melee];
  return [melee, { mode: "ranged", normalFeet: weapon.range.normal, longFeet: weapon.range.long, thrown: true }];
}

/**
 * Golpe sin armas. REGLA OFICIAL VERIFICADA (glosario 2024, "Unarmed
 * Strike"): ataque cuerpo a cuerpo contra un objetivo a 5 pies o menos;
 * daño Contundente igual a 1 + modificador de Fuerza. Lo tiene toda
 * criatura, así que todo personaje puede hacer ataques de oportunidad.
 */
export const UNARMED_STRIKE = { label: "Golpe sin armas", reachFeet: 5, damageType: "bludgeoning" as DamageType } as const;
