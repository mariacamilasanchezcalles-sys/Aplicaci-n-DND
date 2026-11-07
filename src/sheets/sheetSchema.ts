import type {
  AbilityId,
  Capability,
  ConditionId,
  CostSpec,
  CreatureSheet,
  DamageType,
  DurationSpec,
  EffectSpec,
  Operation,
  PassiveEffectSpec,
  SheetAttack,
  SheetPredicate,
  StandardActionType,
  TargetingSpec,
  TriggerSpec,
} from "../models";
import { SHEET_FORMAT_VERSION } from "../models";
import {
  arr,
  bool,
  either,
  identifier,
  int,
  label,
  lazy,
  literal,
  obj,
  oneOf,
  oneOfNumbers,
  record,
  tagged,
} from "./schema";
import type { Schema } from "./schema";

/**
 * Esquema estructural de la ficha. Cada constante se declara con el tipo de
 * `models`: si el esquema y el tipo dejan de coincidir, falla la compilación.
 *
 * Los catálogos de valores (tipos de daño, condiciones…) están aquí como
 * vocabulario CERRADO: un valor desconocido es un error, no se ignora.
 */

// --- límites provisionales (PROPUESTA, ver docs/SHEET_ARCHITECTURE.md) -----
const MAX_FEET = 5280;
const MAX_BONUS = 30;
const MAX_DICE = 100;
/** `repeat` acepta entre 1 y 10 repeticiones. */
export const MAX_REPEAT = 10;

// --- vocabulario -----------------------------------------------------------
export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const satisfies readonly AbilityId[];

export const DAMAGE_TYPES = [
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
] as const satisfies readonly DamageType[];

export const CONDITIONS = [
  "blinded",
  "charmed",
  "deafened",
  "exhaustion",
  "frightened",
  "grappled",
  "incapacitated",
  "invisible",
  "paralyzed",
  "petrified",
  "poisoned",
  "prone",
  "restrained",
  "stunned",
  "unconscious",
] as const satisfies readonly ConditionId[];

export const STANDARD_ACTIONS = [
  "attack",
  "dash",
  "disengage",
  "dodge",
  "help",
  "hide",
  "influence",
  "magic",
  "ready",
  "search",
  "study",
  "utilize",
] as const satisfies readonly StandardActionType[];

const SKILLS = [
  "acrobatics",
  "animalHandling",
  "arcana",
  "athletics",
  "deception",
  "history",
  "insight",
  "intimidation",
  "investigation",
  "medicine",
  "nature",
  "perception",
  "performance",
  "persuasion",
  "religion",
  "sleightOfHand",
  "stealth",
  "survival",
] as const;

const CREATURE_TYPES = [
  "aberration",
  "beast",
  "celestial",
  "construct",
  "dragon",
  "elemental",
  "fey",
  "fiend",
  "giant",
  "humanoid",
  "monstrosity",
  "ooze",
  "plant",
  "undead",
] as const;

const SIZES = ["tiny", "small", "medium", "large", "huge", "gargantuan"] as const;

// --- piezas ----------------------------------------------------------------
const feet = int(0, MAX_FEET);
const bonus = int(-MAX_BONUS, MAX_BONUS);
/** Dados del juego: d4, d6, d8, d10, d12, d20. */
const diceExpression = obj({
  count: int(1, MAX_DICE),
  sides: oneOfNumbers([4, 6, 8, 10, 12, 20]),
});

const rangeFeet = obj({ normal: feet }, { long: feet });

const condition = oneOf(CONDITIONS);
const damageType = oneOf(DAMAGE_TYPES);
const ability = oneOf(ABILITIES);

export const predicateSchema: Schema<SheetPredicate> = lazy(() =>
  tagged("kind", {
    resourceAvailable: obj({ resourceRef: identifier }),
    selfHasCondition: obj({ condition }),
    selfLacksCondition: obj({ condition }),
    targetHasCondition: obj({ condition }),
    selfBloodied: obj({}),
    previousAttackHit: obj({}),
    not: obj({ predicate: predicateSchema }),
    all: obj({ predicates: arr(predicateSchema, { min: 2 }) }),
    any: obj({ predicates: arr(predicateSchema, { min: 2 }) }),
  }),
);

const durationSchema: Schema<DurationSpec> = tagged("kind", {
  instantaneous: obj({}),
  rounds: obj({ count: int(1, 100) }),
  minutes: obj({ count: int(1, 1440) }),
  untilTurnBoundary: obj({ boundary: oneOf(["start", "end"]), whose: oneOf(["source", "target"]) }),
  untilEscape: obj({ escapeDc: int(1, 40) }),
});

export const effectSchema: Schema<EffectSpec> = tagged("kind", {
  damage: obj(
    { bonus, damageType },
    { dice: diceExpression, condition: oneOf(["attackRollHadAdvantage"]) },
  ),
  heal: obj({ bonus }, { dice: diceExpression }),
  tempHitPoints: obj({ bonus }, { dice: diceExpression }),
  applyCondition: obj({ condition, duration: durationSchema }),
  removeCondition: obj({ condition }),
  forcedMovement: obj({ direction: oneOf(["push", "pull"]), distanceFeet: feet }),
});

const targetingSchema: Schema<TargetingSpec> = tagged("kind", {
  self: obj({}),
  creatures: obj({ count: int(1, 20), rangeFeet: feet }),
  area: obj({
    shape: oneOf(["cone", "cube", "cylinder", "emanation", "line", "sphere"]),
    sizeFeet: int(5, MAX_FEET),
    rangeFeet: feet,
  }),
});

const saveSchema = obj({
  ability,
  dc: either(int(1, 40), literal("spellSaveDc")),
  onSuccess: oneOf(["negates", "halfDamage"]),
});

export const operationSchema: Schema<Operation> = lazy(() =>
  tagged("op", {
    attack: obj({ attackRef: identifier }),
    standardAction: obj({ action: oneOf(STANDARD_ACTIONS) }),
    effect: obj(
      { targeting: targetingSchema, effects: arr(effectSchema, { min: 1 }) },
      { save: saveSchema },
    ),
    capability: obj({ capabilityRef: identifier }),
    castSpell: obj({ spellRef: identifier }),
    unmodeled: obj({ note: label }),
    sequence: obj({ steps: arr(operationSchema, { min: 1, max: 20 }) }),
    choice: obj({ options: arr(operationSchema, { min: 2, max: 20 }) }),
    repeat: obj({ times: int(1, MAX_REPEAT), body: operationSchema }),
    optional: obj({ body: operationSchema }),
    conditional: obj(
      { when: predicateSchema, then: operationSchema },
      { otherwise: operationSchema },
    ),
  }),
);

const triggerSchema: Schema<TriggerSpec> = tagged("kind", {
  creatureLeavesReach: obj({}),
  selfTargetedByAttack: obj({}),
  selfHitByAttack: obj({}),
  selfTakesDamage: obj({}),
  creatureEntersArea: obj({ rangeFeet: feet }),
  selfDropsToZeroHitPoints: obj({}),
  creatureTakesAction: obj({ action: oneOf(STANDARD_ACTIONS) }),
});

const costSchema: Schema<CostSpec> = tagged("kind", {
  resource: obj({ resourceRef: identifier, amount: int(1, 100) }),
  spellSlot: obj({ minLevel: int(1, 9) }),
});

export const capabilitySchema: Schema<Capability> = obj(
  {
    id: identifier,
    label,
    activation: oneOf(["action", "bonusAction", "reaction"]),
    body: operationSchema,
  },
  {
    trigger: triggerSchema,
    costs: arr(costSchema, { max: 10 }),
    requirements: arr(predicateSchema, { max: 10 }),
    concentration: bool,
  },
);

export const attackSchema: Schema<SheetAttack> = obj(
  {
    id: identifier,
    label,
    mode: oneOf(["melee", "ranged"]),
    rangeFeet,
    toHitBonus: bonus,
    onHit: arr(effectSchema, { min: 1 }),
  },
  { onMiss: arr(effectSchema, { min: 1 }) },
);

const passiveEffectSchema: Schema<PassiveEffectSpec> = tagged("kind", {
  unmodeled: obj({ note: label }),
});

const recoverySchema = tagged("kind", {
  recharge: obj({ minRoll: int(2, 6) }),
  shortRest: obj({}),
  longRest: obj({}),
});

const spellcastingSchema = obj(
  {
    ability,
    spells: arr(
      obj({
        spellRef: identifier,
        usage: tagged("kind", {
          atWill: obj({}),
          perDay: obj({ uses: int(1, 10) }),
          slots: obj({}),
        }),
      }),
      { min: 1 },
    ),
  },
  {
    saveDc: int(1, 40),
    attackBonus: bonus,
    slots: record(oneOf(["1", "2", "3", "4", "5", "6", "7", "8", "9"]), int(0, 10)),
  },
);

export const creatureSheetSchema: Schema<CreatureSheet> = obj(
  {
    sheetFormat: literal(SHEET_FORMAT_VERSION),
    id: identifier,
    label,
    source: obj({ kind: oneOf(["official", "homebrew", "testFixture"]) }, { reference: label }),
    size: oneOf(SIZES),
    armorClass: int(1, 40),
    hitPoints: obj(
      { average: int(1, 2000) },
      { formula: obj({ dice: diceExpression, bonus: int(-100, 1000) }) },
    ),
    speed: obj(
      { walk: feet },
      { burrow: feet, climb: feet, fly: feet, swim: feet, hover: bool },
    ),
  },
  {
    creatureType: oneOf(CREATURE_TYPES),
    abilities: record(ability, int(1, 30)),
    savingThrows: record(ability, bonus),
    skills: record(oneOf(SKILLS), bonus),
    senses: obj(
      {},
      { blindsight: feet, darkvision: feet, tremorsense: feet, truesight: feet, passivePerception: int(0, 40) },
    ),
    damageResistances: arr(damageType, { max: DAMAGE_TYPES.length }),
    damageImmunities: arr(damageType, { max: DAMAGE_TYPES.length }),
    damageVulnerabilities: arr(damageType, { max: DAMAGE_TYPES.length }),
    conditionImmunities: arr(condition, { max: CONDITIONS.length }),
    resources: arr(
      obj({ id: identifier, label, max: int(1, 100), recovery: arr(recoverySchema, { max: 3 }) }),
      { max: 30 },
    ),
    traits: arr(obj({ id: identifier, label, effects: arr(passiveEffectSchema, { max: 10 }) }), {
      max: 30,
    }),
    attacks: arr(attackSchema, { max: 30 }),
    capabilities: arr(capabilitySchema, { max: 30 }),
    spellcasting: spellcastingSchema,
  },
);
