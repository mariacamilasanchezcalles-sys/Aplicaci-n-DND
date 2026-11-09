import type {
  CombatOutcome,
  ConditionId,
  CreatureSize,
  CreatureTypeId,
  DamageType,
  DeathSaveResult,
  DifficultyId,
  Encounter,
  ExecutableStandardAction,
  MoraleTrigger,
  PartyMemberIssue,
  PersonalityId,
  PlacementReason,
  SessionLogEntry,
  SetupIssue,
  ShockResult,
  TurnCommandError,
  TurnLogEntry,
} from "../../src/ui-bridge";

/**
 * Textos en español. Solo PRESENTACIÓN: traduce códigos del núcleo a frases.
 * Los `Record` obligan a traducir todos los códigos: si el núcleo añade uno,
 * la compilación falla aquí.
 */

export const SIZE_LABEL: Readonly<Record<CreatureSize, string>> = {
  tiny: "Diminuta",
  small: "Pequeña",
  medium: "Mediana",
  large: "Grande",
  huge: "Enorme",
  gargantuan: "Gargantuesca",
};

export const TYPE_LABEL: Readonly<Record<CreatureTypeId, string>> = {
  aberration: "Aberración",
  beast: "Bestia",
  celestial: "Celestial",
  construct: "Constructo",
  dragon: "Dragón",
  elemental: "Elemental",
  fey: "Feérico",
  fiend: "Infernal",
  giant: "Gigante",
  humanoid: "Humanoide",
  monstrosity: "Monstruosidad",
  ooze: "Cieno",
  plant: "Planta",
  undead: "Muerto viviente",
};

export const CONDITION_LABEL: Readonly<Record<ConditionId, string>> = {
  blinded: "Cegado",
  charmed: "Encantado",
  deafened: "Ensordecido",
  exhaustion: "Cansancio",
  frightened: "Asustado",
  grappled: "Agarrado",
  incapacitated: "Incapacitado",
  invisible: "Invisible",
  paralyzed: "Paralizado",
  petrified: "Petrificado",
  poisoned: "Envenenado",
  prone: "Derribado",
  restrained: "Apresado",
  stunned: "Aturdido",
  unconscious: "Inconsciente",
};

export const DAMAGE_LABEL: Readonly<Record<DamageType, string>> = {
  acid: "Ácido",
  bludgeoning: "Contundente",
  cold: "Frío",
  fire: "Fuego",
  force: "Fuerza",
  lightning: "Relámpago",
  necrotic: "Necrótico",
  piercing: "Perforante",
  poison: "Veneno",
  psychic: "Psíquico",
  radiant: "Radiante",
  slashing: "Cortante",
  thunder: "Trueno",
};

export const PERSONALITY_LABEL: Readonly<Record<PersonalityId, string>> = {
  pragmatic: "Pragmático",
  aggressive: "Agresivo",
  pacifist: "Pacifista",
};

export const DIFFICULTY_LABEL: Readonly<Record<DifficultyId, string>> = {
  easy: "Fácil",
  normal: "Normal",
  hard: "Difícil",
  custom: "Personalizada",
};

export const DIFFICULTY_DESCRIPTION: Readonly<Record<DifficultyId, string>> = {
  easy: "Evalúa pocas alternativas y planifica menos.",
  normal: "Busca opciones tácticas razonables y considera a sus aliados.",
  hard: "Analiza más posibilidades, se coordina y replanifica tras cada operación.",
  custom: "Configura profundidad, alternativas, coordinación y evaluación.",
};

export const ACTION_LABEL: Readonly<Record<ExecutableStandardAction, string>> = {
  attack: "Atacar",
  dash: "Correr",
  disengage: "Destrabarse",
  dodge: "Esquivar",
};

export const ABILITY_LABEL: Readonly<Record<string, string>> = {
  str: "Fuerza",
  dex: "Destreza",
  con: "Constitución",
  int: "Inteligencia",
  wis: "Sabiduría",
  cha: "Carisma",
};

export const PARTY_ISSUE: Readonly<Record<PartyMemberIssue, string>> = {
  labelRequired: "Falta el nombre",
  maxHitPointsInvalid: "PG máximos entre 1 y 999",
  currentHitPointsInvalid: "PG actuales entre 0 y los máximos",
  armorClassInvalid: "CA entre 1 y 40",
  speedInvalid: "Velocidad en múltiplos de 5 pies",
  attackLabelRequired: "Cada ataque necesita nombre",
  attackRangeInvalid: "Alcance en múltiplos de 5 pies (la distancia larga, mayor que la normal)",
};

export const SETUP_ISSUE: Readonly<Record<SetupIssue, string>> = {
  noMonsters: "Elige al menos un enemigo",
  noParty: "Añade al menos un aventurero",
  partyMemberInvalid: "Hay aventureros con datos incompletos",
  unknownSheet: "Una criatura elegida ya no está en el bestiario",
  partyLevelInvalid: "Nivel del grupo entre 1 y 20",
  customDifficultyMissing: "Configura la dificultad personalizada",
  mapFull: "No caben todas las criaturas en el mapa",
};

export const PLACEMENT_REASON: Readonly<Record<PlacementReason, string>> = {
  notInteger: "Coordenadas no válidas",
  outOfBounds: "Fuera del mapa",
  occupied: "Esa casilla está ocupada",
  blocked: "Una criatura Grande o mayor bloquea el paso",
};

export const COMMAND_ERROR: Readonly<Record<TurnCommandError, string>> = {
  unknownActor: "La criatura no está en el encuentro",
  turnEnded: "El turno ya terminó",
  executionInProgress: "Termina primero la acción en curso",
  noExecution: "No hay ninguna acción en curso",
  movementNotAllowedNow: "Ahora no puede moverse",
  emptyPath: "El movimiento no tiene casillas",
  invalidSquare: "Casilla no válida",
  notAdjacent: "Cada casilla debe ser vecina de la anterior",
  movementExceedsSpeed: "No le queda movimiento suficiente",
  capabilityUnavailable: "No tiene esa capacidad",
  activationUnavailable: "Ya usó esa acción en este turno",
  capabilityNotSupported: "El motor aún no ejecuta esa capacidad",
  requirementsNotMet: "No cumple los requisitos",
  resourcesUnavailable: "No le quedan usos",
  noLegalOptions: "No hay ningún objetivo al alcance",
  staleOption: "La situación cambió; vuelve a elegir",
  unknownOption: "Esa opción ya no es válida",
  targetArmorClassUnknown: "Falta la CA del objetivo",
  invalidEffectTargets: "Objetivos no válidos",
  invalidAreaPlacement: "Colocación del área no válida",
  saveBonusUnknown: "Falta el bonificador de salvación",
  playerSavesRequired: "Faltan salvaciones de los jugadores",
  cannotAct: "No puede actuar",
  movementTowardFearSource: "Asustado: no puede acercarse a lo que teme",
  notProne: "No está derribado",
  cannotStandUp: "No puede levantarse ahora",
  knockOutNotAllowed: "Solo se deja inconsciente con un ataque cuerpo a cuerpo",
  reactionsPending: "Hay reacciones pendientes",
  noPendingReaction: "No hay reacción pendiente",
  reactionNotAvailable: "No le queda reacción",
  playerAttackRequired: "Anota la tirada de ataque",
  invalidPlayerRoll: "Tirada no válida",
  playerDamageRequired: "Ha impactado: anota el daño",
  savesPending: "Hay salvaciones pendientes",
  noPendingSave: "No hay salvación pendiente",
  notFleeing: "No está huyendo",
  notGrappled: "No está agarrado por esa criatura",
  actionAlreadyUsed: "Ya usó su acción",
  playerCheckRequired: "Anota la prueba del jugador",
};

const MORALE_TRIGGER: Readonly<Record<MoraleTrigger, string>> = {
  surprised: "sorprendido",
  belowHalfHitPoints: "por debajo de la mitad de PG",
  cannotHarmOpponents: "no puede dañar a sus oponentes",
  groupSurprised: "grupo sorprendido",
  leaderDown: "su líder ha caído",
  groupHalved: "su grupo se ha reducido a la mitad",
};

const SHOCK: Readonly<Record<ShockResult, string>> = {
  dropToZero: "cae a 0 PG",
  dropToZeroStable: "cae a 0 PG, estable",
  stunned: "queda Aturdido",
  noReactionsAndDisadvantage: "sin reacciones y con Desventaja",
  noReactions: "sin reacciones",
};

const DEATH_SAVE: Readonly<Record<DeathSaveResult, string>> = {
  success: "éxito",
  failure: "fallo",
  twoFailures: "dos fallos (1 natural)",
  regainedHitPoint: "¡20 natural! recupera 1 PG",
};

export const OUTCOME_LABEL: Readonly<Record<CombatOutcome, string>> = {
  victory: "Victoria",
  defeat: "Derrota",
};

/** Nombre visible de una criatura. */
export function nameOf(encounter: Encounter, id: string): string {
  return encounter.combatants[id]?.definition.label ?? id;
}

function attackLabel(encounter: Encounter, attackerId: string, attackId: string): string {
  return encounter.combatants[attackerId]?.definition.attacks.find((a) => a.id === attackId)?.label ?? "ataque";
}

function outcomeText(outcome: "miss" | "hit" | "criticalHit"): string {
  return outcome === "miss" ? "falla" : outcome === "criticalHit" ? "impacta con un crítico" : "impacta";
}

/** Frase para una entrada del registro del turno (null si no aporta nada a la persona). */
export function describeTurnEntry(encounter: Encounter, actorId: string, entry: TurnLogEntry): string | null {
  const who = nameOf(encounter, actorId);
  switch (entry.kind) {
    case "moved":
      return `${who} se mueve ${entry.spentFeet} pies.`;
    case "capabilityBegun":
      return null;
    case "attackResolved": {
      const total = entry.resolution.attackTotal;
      const damage = entry.damageApplied > 0 ? `: ${entry.damageApplied} de daño` : "";
      const cond = (entry.conditionsApplied ?? []).map((c) => CONDITION_LABEL[c]).join(", ");
      return `${who} ataca a ${nameOf(encounter, entry.targetId)} con ${attackLabel(encounter, actorId, entry.attackId)} (${total}) y ${outcomeText(entry.resolution.outcome)}${damage}${cond ? `; queda ${cond}` : ""}.`;
    }
    case "standardActionTaken":
      return `${who}: ${ACTION_LABEL[entry.action]}.`;
    case "capabilityFinished":
      return null;
    case "effectResolved": {
      const parts = entry.targets.map((t) => {
        const save = t.save === null ? "" : t.save.success ? " (salva)" : " (falla la salvación)";
        const cond = t.conditionsApplied.map((c) => CONDITION_LABEL[c]).join(", ");
        return `${nameOf(encounter, t.targetId)}${save}: ${t.damageApplied > 0 ? `${t.damageApplied} de daño` : t.healed > 0 ? `+${t.healed} PG` : "sin daño"}${cond ? `, ${cond}` : ""}`;
      });
      return `${who} usa un efecto. ${parts.join("; ")}.`;
    }
    case "stoodUp":
      return `${who} se levanta.`;
    case "opportunityAttack": {
      const a = entry.attack;
      return `Ataque de oportunidad de ${nameOf(encounter, entry.reactorId)} a ${nameOf(encounter, a.targetId)}: ${outcomeText(a.resolution.outcome)}${a.damageApplied > 0 ? `, ${a.damageApplied} de daño` : ""}.`;
    }
    case "sheetReactionTaken": {
      const a = entry.attack;
      return `Reacción de ${nameOf(encounter, entry.reactorId)} contra ${nameOf(encounter, a.targetId)}: ${outcomeText(a.resolution.outcome)}${a.damageApplied > 0 ? `, ${a.damageApplied} de daño` : ""}.`;
    }
    case "reactionDeclined":
      return `${nameOf(encounter, entry.reactorId)} no reacciona.`;
    case "massiveDamage":
      return `Daño masivo a ${nameOf(encounter, entry.creatureId)}: salvación ${entry.saveSucceeded ? "superada" : `fallada, ${entry.shock ? SHOCK[entry.shock] : "shock"}`}.`;
    case "massiveDamageUnresolved":
      return `Daño masivo a ${nameOf(encounter, entry.creatureId)} sin resolver (faltan datos).`;
    case "moraleCheck": {
      const c = entry.check;
      return `Moral (${MORALE_TRIGGER[c.trigger]}): ${nameOf(encounter, c.saverId)} ${c.success ? "aguanta" : `falla; huyen: ${c.affected.map((id) => nameOf(encounter, id)).join(", ")}`}.`;
    }
    case "surrendered":
      return `${who} se rinde.`;
    case "movementStopped":
      return `${who} no puede seguir moviéndose.`;
    case "escapeAttempt":
      return `${who} intenta escapar de ${nameOf(encounter, entry.grapplerId)}: ${entry.check.success ? "lo consigue" : "no lo consigue"}.`;
    case "turnEnded":
      return null;
  }
}

/** Frase para una entrada del registro de la sesión (null si no se muestra). */
export function describeLogEntry(encounter: Encounter, entry: SessionLogEntry): string | null {
  const item = entry.item;
  switch (item.kind) {
    case "deploymentDone":
      return "Despliegue terminado.";
    case "monsterInitiative":
      return `Iniciativa de los monstruos: ${item.rolls.map((r) => `${r.creatureIds.map((id) => nameOf(encounter, id)).join(", ")} ${r.total}`).join(" · ")}.`;
    case "combatStarted":
      return `¡Comienza el combate! Orden: ${item.order.map((id) => nameOf(encounter, id)).join(", ")}.`;
    case "turnStarted":
      return `— Turno de ${nameOf(encounter, item.actorId)} —`;
    case "turnLog":
      return describeTurnEntry(encounter, item.actorId, item.entry);
    case "brain":
      if (item.event.kind === "planned" && item.event.reason !== "turnStart") return `${nameOf(encounter, item.actorId)} cambia de plan.`;
      if (item.event.kind === "gaveUp") return `${nameOf(encounter, item.actorId)} no encuentra nada que hacer.`;
      return null;
    case "monsterReaction":
      return null;
    case "deathSave":
      return `Salvación contra la muerte de ${nameOf(encounter, item.creatureId)} (${item.d20}): ${DEATH_SAVE[item.result]}.`;
    case "combatEnded":
      return `Fin del combate: ${OUTCOME_LABEL[item.outcome]}.`;
  }
}
