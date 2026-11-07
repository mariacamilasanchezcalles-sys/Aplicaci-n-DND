/**
 * Identificadores tipados. Los identificadores son datos funcionales; los
 * nombres visibles (`label`) son solo etiquetas para personas y el programa
 * nunca debe interpretarlos.
 */
declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type EncounterId = Brand<string, "EncounterId">;
export type CreatureId = Brand<string, "CreatureId">;
export type AttackId = Brand<string, "AttackId">;
export type TraitId = Brand<string, "TraitId">;
export type BonusActionId = Brand<string, "BonusActionId">;
export type ResourceId = Brand<string, "ResourceId">;
export type OptionId = Brand<string, "OptionId">;

export const asEncounterId = (value: string): EncounterId => value as EncounterId;
export const asCreatureId = (value: string): CreatureId => value as CreatureId;
export const asAttackId = (value: string): AttackId => value as AttackId;
export const asTraitId = (value: string): TraitId => value as TraitId;
export const asBonusActionId = (value: string): BonusActionId => value as BonusActionId;
export const asResourceId = (value: string): ResourceId => value as ResourceId;
export const asOptionId = (value: string): OptionId => value as OptionId;
